import { Octokit } from "@octokit/rest";

import { GraphqlUnavailable } from "../github-graphql";
import { RepoError, githubRepo, type PinnedRepo } from "../importer/repo";
import { githubReader, type RepoReader } from "../mobile-payload";
import { deletionConflict, deletionRequest, isOwnedAsset, prunePlan, pruneRequest, recordAssetDir, type DeletionRequest, type ScannedRecord } from "../record-assets";
import { assertSafeEntityId, assertSafeGameSlug } from "../safe-path";

import { NO_STORE, SAVE_BODY_LIMIT, STATUS, assertSafeFilePath, json, readJsonBody } from "./http";
import { purgePaths } from "./purge";
import { requireAuth } from "./session";

import type { ApiContext, Env } from "./env";

// A record's pictures: listed for the delete page, deleted with it, or pruned after a save.

/** Files GraphQL can't give whole (too big, or not UTF-8) that a prune reads through REST before giving up. */
const PRUNE_REST_READS = 10;

const JSON_EXTENSION = ".json";

const GRAPHQL_UNAVAILABLE = "couldn't check what uses it (GitHub GraphQL is unavailable)";

/** The data branch's files under some paths, at its head commit. */
type Snapshot = Awaited<ReturnType<PinnedRepo["snapshot"]>>;

/** GitHub's 503 for a tree too big to list: the answer says so. */
function isTooBig(error: unknown): error is RepoError {
  return error instanceof RepoError && error.status === STATUS.unavailable;
}

/** The record a query names (game, folder, id), checked: its file and its pictures' folder. */
function recordOfQuery(url: URL): { record: string; dir: string } {
  const game = url.searchParams.get("game") ?? "";
  const folder = url.searchParams.get("folder") ?? "";
  const id = url.searchParams.get("id") ?? "";
  assertSafeGameSlug(game);
  assertSafeEntityId(id);
  const record = `data/${game}/${folder}/${id}.json`;
  assertSafeFilePath(record);
  return { record, dir: recordAssetDir(game, folder, id) };
}

// A record's pictures, for the delete page (app/lib/record-assets.ts): the files
// of its own folder, the record's sha, and the commit they were read at.
export async function handleRecordAssets(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const { record, dir } = recordOfQuery(new URL(context.request.url));
  try {
    const { head, files } = await githubRepo(context.env).snapshot([record, dir]);
    const assets = Object.entries(files)
      .filter(([path]) => isOwnedAsset(path, dir))
      .map(([path, sha]) => ({ path, sha }));
    return json({ head, sha: files[record] ?? null, files: assets }, STATUS.ok, NO_STORE);
  } catch (error) {
    if (isTooBig(error)) {
      return json({ error: error.message }, STATUS.unavailable);
    }
    throw error;
  }
}

function deletionConflictAnswer(error: string): Response {
  return json({ error, conflict: true }, STATUS.conflict);
}

/** The record and its pictures removed in one commit, on the commit the page read them at; or why not. */
async function commitDeletion(context: ApiContext, request: DeletionRequest, record: string): Promise<Response | null> {
  const repo = githubRepo(context.env);
  try {
    const snapshot = await repo.snapshot([record, recordAssetDir(request.game, request.folder, request.id)]);
    const problem = deletionConflict(request, snapshot);
    if (problem) {
      return deletionConflictAnswer(problem);
    }
    const removed = [record, ...request.remove.map((file) => file.path)].map((path) => ({ path, content: null }));
    await repo.commitOn(snapshot.head, removed, `Delete ${request.folder} ${request.id} and ${String(request.remove.length)} of its pictures`);
    return null;
  } catch (error) {
    // 422: the branch moved between the check and the commit.
    if (error instanceof RepoError && error.status === STATUS.unprocessable) {
      return deletionConflictAnswer("The data changed while deleting. Reload the page to check again.");
    }
    if (isTooBig(error)) {
      return json({ error: error.message }, STATUS.unavailable);
    }
    throw error;
  }
}

// Deletes a record and the pictures of its folder the delete page showed, in
// one commit (so the push webhook fires once). Only files of the record's own
// folder, exactly as the page saw them, at the commit it read them at; any
// change since is a conflict to reload. Which pictures other records still use
// is the page's check: the server can't read every record of a game within a
// Function's 50 subrequests (Workers Free).
export async function handleDeleteRecord(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const request = deletionRequest(await readJsonBody(context.request, SAVE_BODY_LIMIT));
  if (typeof request === "string") {
    return json({ error: request }, STATUS.badRequest);
  }
  const record = `data/${request.game}/${request.folder}/${request.id}.json`;
  for (const path of [record, ...request.remove.map((file) => file.path), ...request.keep]) {
    assertSafeFilePath(path);
  }
  const refusal = await commitDeletion(context, request, record);
  if (refusal) {
    return refusal;
  }
  // The record's caches, and the pictures' once, not per file: they share one mobile
  // version key, and KV takes one write a second per key. The other pictures' edge
  // copies expire within 5 minutes (asset-headers.ts).
  purgePaths(context, [record]);
  purgePaths(context, [request.remove[0].path]);
  return json({ ok: true });
}

/** A file's text as a record: its JSON, or the text itself when it isn't JSON (it may still point at a picture). */
function scanned({ path, text }: { path: string; text: string }): ScannedRecord {
  let content: unknown = text;
  try {
    content = JSON.parse(text);
  } catch {
    // A file that isn't valid JSON is searched as text: it may still point at a picture.
  }
  return { folder: path, id: path.slice(path.lastIndexOf("/") + 1, -JSON_EXTENSION.length), content };
}

/** The files of `dirs` in one GraphQL request: each with its text, or without one when GraphQL couldn't give it whole. */
async function folderTexts(reader: RepoReader, dirs: string[]): Promise<{ path: string; text?: string }[] | string> {
  if (!reader.readMany) {
    return GRAPHQL_UNAVAILABLE;
  }
  try {
    const read = await reader.readMany(dirs, []);
    return read.folders.flatMap((folder) => folder ?? []);
  } catch (error) {
    if (error instanceof GraphqlUnavailable) {
      return GRAPHQL_UNAVAILABLE;
    }
    throw error;
  }
}

/** The texts GraphQL left out, read through REST one after another, by path. */
async function wholeTexts(reader: RepoReader, paths: string[]): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  await paths.reduce(async (previous, path) => {
    await previous;
    texts.set(path, await reader.read(path));
  }, Promise.resolve());
  return texts;
}

/**
 * Every JSON file of a game's data and of data/_meta, as at commit `head`, in
 * one GraphQL request; or why they can't be read (then nothing is removed).
 * `paths` are the repository's files at that commit.
 */
async function recordsAt(env: Env, head: string, { game, paths }: { game: string; paths: string[] }): Promise<ScannedRecord[] | string> {
  const jsonPaths = paths.filter((path) => (path.startsWith(`data/${game}/`) || path.startsWith("data/_meta/")) && path.endsWith(JSON_EXTENSION));
  const dirs = [...new Set(jsonPaths.map((path) => path.slice(0, path.lastIndexOf("/"))))];
  // Pinned at `head`: what's checked is exactly what the commit below applies to.
  const reader = githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, head, { token: env.GITHUB_TOKEN });
  const texts = await folderTexts(reader, dirs);
  if (typeof texts === "string") {
    return texts;
  }
  const whole = texts.filter((entry) => entry.text === undefined).map((entry) => entry.path);
  if (whole.length > PRUNE_REST_READS) {
    return "couldn't check what uses it (too many files to read one by one)";
  }
  const read = await wholeTexts(reader, whole);
  return texts.map((entry) => scanned({ path: entry.path, text: entry.text ?? read.get(entry.path) ?? "" }));
}

/** A prune's answer when nothing is removed: each picture kept, and why. */
function keptAll(paths: string[], why: string): Response {
  return json({ removed: [], kept: paths.map((path) => ({ path, why })) });
}

interface PruneScope {
  request: { game: string; folder: string; id: string };
  snapshot: Snapshot;
  files: { path: string; sha: string }[];
}

/** Removes the pictures no record uses, in one commit on the commit they were read at. */
async function removeUnused(context: ApiContext, { request, snapshot, files }: PruneScope): Promise<Response> {
  const { game, folder, id } = request;
  const records = await recordsAt(context.env, snapshot.head, { game, paths: Object.keys(snapshot.files) });
  if (typeof records === "string") {
    return keptAll(files.map((file) => file.path), records);
  }
  const plan = prunePlan(recordAssetDir(game, folder, id), files, records);
  if (plan.remove.length > 0) {
    try {
      const count = plan.remove.length;
      await githubRepo(context.env).commitOn(snapshot.head, plan.remove.map((file) => ({ path: file.path, content: null })), `Remove ${String(count)} replaced picture${count === 1 ? "" : "s"} of ${folder} ${id}`);
    } catch (error) {
      // 422: the branch moved since it was read, so the check may be out of date.
      if (error instanceof RepoError && error.status === STATUS.unprocessable) {
        return keptAll(files.map((file) => file.path), "the data changed meanwhile");
      }
      throw error;
    }
    // One purge for the pictures (they share the mobile assets version); the rest expire (asset-headers.ts).
    purgePaths(context, [plan.remove[0].path]);
  }
  return json({ removed: plan.remove.map((file) => file.path), kept: plan.keep.map((kept) => ({ path: kept.path, why: `used by ${kept.usedBy.join(", ")}` })) });
}

/** The game's data, data/_meta and the record's pictures, at the branch's head; or the prune's answer when the tree is too big. */
async function pruneSnapshot(context: ApiContext, request: { game: string; folder: string; id: string; paths: string[] }): Promise<Snapshot | Response> {
  try {
    return await githubRepo(context.env).snapshot([`data/${request.game}/`, "data/_meta/", recordAssetDir(request.game, request.folder, request.id)]);
  } catch (error) {
    if (isTooBig(error)) {
      return keptAll(request.paths, "couldn't check what uses it (the data repository is too big to list)");
    }
    throw error;
  }
}

// After a save, the files of the record's own folder the save stopped
// pointing at (record-assets.ts droppedAssets): those that no JSON file of the
// game or of data/_meta points at, the saved record included, are deleted in
// one commit, on the commit everything was read at. Whatever can't be checked
// is kept and said so; the save itself is done already, so this never fails it.
// 8 GitHub requests: the snapshot (3), the records (1 GraphQL), the commit (4).
export async function handlePruneAssets(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const request = pruneRequest(await readJsonBody(context.request, SAVE_BODY_LIMIT));
  if (typeof request === "string") {
    return json({ error: request }, STATUS.badRequest);
  }
  for (const path of request.paths) {
    assertSafeFilePath(path);
  }
  const snapshot = await pruneSnapshot(context, request);
  if (snapshot instanceof Response) {
    return snapshot;
  }
  // Files already gone need nothing.
  const files = request.paths.filter((path) => snapshot.files[path]).map((path) => ({ path, sha: snapshot.files[path] }));
  return files.length === 0 ? json({ removed: [], kept: [] }) : removeUnused(context, { request, snapshot, files });
}
