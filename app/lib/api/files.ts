import { GAMES_PATH } from "../games-guard";
import { jsonFileText } from "../json-file";
import { pushAfterWrite } from "../push";
import { decodeUtf8Base64, encodeUtf8Base64 } from "../utf8-base64";

import { asFile, isNotFound, readContent } from "./contents";
import { dataBranch, octokitOf, pushEnv, type ApiContext } from "./env";
import { PICTURES_ELSEWHERE } from "./games";
import { BAD_REQUEST, NO_STORE, SMALL_BODY_LIMIT, STATUS, WRITE_BODY_LIMIT, assertSafeFilePath, json, readJsonBody, statusOf } from "./http";
import { purgePaths } from "./purge";
import { requireAuth } from "./session";
import { writeProblems } from "./write-checks";
import { deleteFileRequest, refusedWrite, writeRequest, type WriteRequest } from "./write-requests";

// data/file: reading, writing and deleting one file of the data branch.

export async function handleGetFile(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const path = new URL(context.request.url).searchParams.get("path");
  if (!path) {
    return json({ error: "path is required" }, STATUS.badRequest);
  }
  assertSafeFilePath(path);
  try {
    const file = asFile(await readContent(octokitOf(context.env), context.env, path));
    if (!file) {
      return json(null);
    }
    const content: unknown = path.endsWith(".json") ? JSON.parse(decodeUtf8Base64(file.content)) : file.content;
    return json({ sha: file.sha, content }, STATUS.ok, NO_STORE);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return json(null);
    }
    throw error;
  }
}

/** The file's text as the contents API takes it: base64 as sent, or the JSON as the data repo writes it. */
function contentText(body: WriteRequest): string {
  return body.isBase64 ? (body.content as string) : encodeUtf8Base64(jsonFileText(body.content));
}

function commitMessage(body: WriteRequest): string {
  if (body.message !== undefined) {
    return body.message;
  }
  return body.sha ? `Update ${body.path}` : `Add ${body.path}`;
}

async function commitWrite(context: ApiContext, body: WriteRequest): Promise<Response> {
  const { env } = context;
  try {
    const result = await octokitOf(env).repos.createOrUpdateFileContents({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      path: body.path,
      message: commitMessage(body),
      content: contentText(body),
      sha: body.sha,
      branch: dataBranch(env),
    });
    purgePaths(context, [body.path]);
    // Only once the record is saved; a push never fails the save.
    const push = await pushAfterWrite(body, pushEnv(env));
    // The new sha lets an editor keep saving without reloading the file.
    return json({ ok: true, sha: result.data.content?.sha ?? null, ...(push && { push }) });
  } catch (error: unknown) {
    const refused = refusedWrite(error, body.path);
    if (refused) {
      return refused;
    }
    throw error;
  }
}

export async function handleWriteFile(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const body = writeRequest(await readJsonBody(context.request, WRITE_BODY_LIMIT));
  if (typeof body === "string") {
    return json({ error: body }, BAD_REQUEST);
  }
  assertSafeFilePath(body.path);
  // A picture is never a commit of its own: it goes with its record's save or games.json's.
  if (body.path.startsWith("public/assets/")) {
    return json({ error: PICTURES_ELSEWHERE }, BAD_REQUEST);
  }
  const problems = await writeProblems(context.env, body);
  if (problems.length > 0) {
    return json({ error: `This file can't be saved: ${problems.join(" ")}` }, STATUS.badRequest);
  }
  return commitWrite(context, body);
}

export async function handleDeleteFile(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const body = deleteFileRequest(await readJsonBody(context.request, SMALL_BODY_LIMIT));
  if (typeof body === "string") {
    return json({ error: body }, BAD_REQUEST);
  }
  assertSafeFilePath(body.path);
  // games.json lists every game; nothing in the admin deletes it (app/lib/games-guard.ts).
  if (decodeURIComponent(body.path) === GAMES_PATH) {
    return json({ error: `${GAMES_PATH} can't be deleted: it lists every game.` }, STATUS.badRequest);
  }
  const { env } = context;
  try {
    await octokitOf(env).repos.deleteFile({ owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: body.path, message: body.message ?? `Delete ${body.path}`, sha: body.sha, branch: dataBranch(env) });
    purgePaths(context, [body.path]);
    return json({ ok: true });
  } catch (error: unknown) {
    return deleteRefusal(error, body.path);
  }
}

/** A delete GitHub refused, as the editor should hear it; anything else is rethrown. */
function deleteRefusal(error: unknown, path: string): Response {
  // Gone already: someone removed it since this page loaded it.
  if (statusOf(error) === STATUS.notFound) {
    return json({ error: `Conflict on ${path}: the file was already removed.`, conflict: true }, STATUS.conflict);
  }
  const refused = refusedWrite(error, path);
  if (refused) {
    return refused;
  }
  throw error;
}
