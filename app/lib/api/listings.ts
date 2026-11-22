import { readCategories } from "../categories";
import { octokitHeaders, readRepoTree } from "../github-tree";
import { githubReader, readJsonFolderCounted, readJsonTogether } from "../mobile-payload";
import { listSummary } from "../record-columns";
import { decodeUtf8Base64 } from "../utf8-base64";

import { asFile, isNotFound, readContent } from "./contents";
import { dataBranch, dataReader, octokitOf, type ApiContext, type Env } from "./env";
import { NO_STORE, STATUS, assertSafeFilePath, isJsonObject, json } from "./http";
import { requireAuth } from "./session";

// The read routes: a folder's files (data/directory), several folders at once
// (data/folders), the games, the dashboard's counts, the latest commits, an enum.

/** Folders data/folders reads at once: what one page needs together, and no more. */
const MAX_FOLDERS = 4;

/** Commits the activity page lists. */
const COMMITS_SHOWN = 20;

const GAMES_PATH = "data/_meta/games.json";

/** What a list of records was asked for: each record whole, only some keys, or as its list shows it. */
interface Shape {
  keysOnly: string[] | null;
  isSummary: boolean;
}

/** A folder that couldn't be listed: an empty list that says so (X-Incomplete), and the error in the log. */
function unlisted(error: unknown): Response {
  console.error("handleListDirectory error:", error);
  return json([], STATUS.ok, { "X-Incomplete": "all" });
}

/** A record as the listing gives it: its summary, only the keys asked for, or whole. */
function shown(content: unknown, { keysOnly, isSummary }: Shape): unknown {
  if (isSummary) {
    return listSummary(content);
  }
  if (!keysOnly) {
    return content;
  }
  if (content === null || content === undefined) {
    return null;
  }
  return Object.fromEntries(keysOnly.flatMap((key) => {
    const value = (content as Record<string, unknown>)[key];
    return value === undefined ? [] : [[key, value]];
  }));
}

/** A folder's records, each as asked for (data/directory with includeContent). */
async function folderRecords(env: Env, { dir, subpath, shape }: { dir: string; subpath: string; shape: Shape }): Promise<Response> {
  try {
    // One GitHub request for the whole folder when the token can use GraphQL
    // (mobile-payload.ts readJsonTogether), else one per file, as before.
    const { files, unread } = await readJsonFolderCounted(dataReader(env), dir);
    // A screen's id is its file's name, as /mobile/init gives it: the screen
    // editor needs every screen's to check where actions lead.
    const named = (file: { name: string; content: unknown }) => (subpath === "screens" && isJsonObject(file.content) ? { ...file.content, id: file.name } : file.content);
    const payload = files.map((file) => shown(named(file), shape)).filter(Boolean);
    // Records that couldn't be read are left out; X-Incomplete says how many, so a
    // check that must see them all (the delete page's) knows it didn't.
    const left = unread + files.length - payload.length;
    return json(payload, STATUS.ok, { ...NO_STORE, ...(left > 0 && { "X-Incomplete": String(left) }) });
  } catch (error) {
    // The folder couldn't be listed: an empty list that isn't the folder's.
    return unlisted(error);
  }
}

/** A folder's file names, without .json (data/directory without includeContent). */
async function folderNames(env: Env, dir: string): Promise<Response> {
  try {
    const data = await readContent(octokitOf(env), env, dir);
    if (!Array.isArray(data)) {
      return json([]);
    }
    const payload = data.filter((entry) => entry.type === "file" && entry.name.endsWith(".json")).map((entry) => entry.name.replace(".json", ""));
    return json(payload, STATUS.ok, NO_STORE);
  } catch (error) {
    // A folder that doesn't exist is empty; any other failure is an empty list
    // that isn't the folder's, which X-Incomplete says.
    return isNotFound(error) ? json([]) : unlisted(error);
  }
}

/** keysOnly or shape=summary, from the query; an answer when they can't be had. */
function shapeOf(params: URLSearchParams): Shape | Response {
  const keysOnly = params.get("keysOnly")?.split(",") ?? null;
  // shape=summary: each record as a list shows it (record-columns.ts
  // listSummary), for lists whose columns follow the schema, so no fixed
  // keys can be asked for. 80 filled heroes come to 158 KB instead of 1.7 MB.
  const shape = params.get("shape");
  if (shape !== null && shape !== "summary") {
    return json({ error: 'shape can only be "summary"' }, STATUS.badRequest);
  }
  if (shape !== null && keysOnly) {
    return json({ error: "Ask for keysOnly or shape, not both" }, STATUS.badRequest);
  }
  return { keysOnly, isSummary: shape === "summary" };
}

export async function handleListDirectory(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const params = new URL(context.request.url).searchParams;
  const game = params.get("game");
  const subpath = params.get("subpath");
  if (!game || !subpath) {
    return json({ error: "game and subpath are required" }, STATUS.badRequest);
  }
  assertSafeFilePath(`data/${game}/${subpath}/dummy.json`);
  const dir = `data/${game}/${subpath}`;
  if (params.get("includeContent") !== "true") {
    return folderNames(context.env, dir);
  }
  // Only the keys asked for, which keeps big records out of the page's memory.
  const shape = shapeOf(params);
  return shape instanceof Response ? shape : folderRecords(context.env, { dir, subpath, shape });
}

/** The folders asked for, or none when they aren't 1 to MAX_FOLDERS different ones. */
function foldersAsked(params: URLSearchParams): { game: string; subpaths: string[] } | null {
  const game = params.get("game") ?? "";
  const subpaths = (params.get("subpaths") ?? "").split(",");
  const isValid = game !== "" && subpaths.every(Boolean) && subpaths.length <= MAX_FOLDERS && new Set(subpaths).size === subpaths.length;
  return isValid ? { game, subpaths } : null;
}

/** A folder data/folders couldn't list: none of its records, and the error in the log. */
function unlistedFolder(dir: string, error: unknown): null {
  console.error(`handleListFolders: ${dir} couldn't be listed:`, error);
  return null;
}

// Several folders of a game at once, as data/directory reads one (with
// includeContent), for a page that needs them together, such as a list's
// schemas and enums: one GitHub request for them all when the token can use
// GraphQL. X-Incomplete counts the records left out ("all" when a folder
// couldn't even be listed).
export async function handleListFolders(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const asked = foldersAsked(new URL(context.request.url).searchParams);
  if (!asked) {
    return json({ error: `game and 1 to ${String(MAX_FOLDERS)} different subpaths are required` }, STATUS.badRequest);
  }
  const { game, subpaths } = asked;
  for (const subpath of subpaths) {
    assertSafeFilePath(`data/${game}/${subpath}/dummy.json`);
  }
  const dirs = subpaths.map((subpath) => `data/${game}/${subpath}`);
  const together = readJsonTogether(dataReader(context.env), dirs, []);
  const folders = await Promise.all(
    dirs.map((dir) =>
      together
        .folder(dir)
        .then(({ files, unread }) => {
          const items = files.map((file) => file.content).filter(Boolean);
          return { items, left: unread + files.length - items.length };
        })
        .catch((error: unknown) => unlistedFolder(dir, error)),
    ),
  );
  const isUnlisted = folders.includes(null);
  const left = folders.reduce((sum, folder) => sum + (folder?.left ?? 0), 0);
  const incomplete = isUnlisted ? "all" : String(left);
  return json(Object.fromEntries(subpaths.map((subpath, i) => [subpath, folders[i]?.items ?? []])), STATUS.ok, {
    ...NO_STORE,
    ...((isUnlisted || left > 0) && { "X-Incomplete": incomplete }),
  });
}

/** games.json's games: none when it has none. */
function gamesOf(file: { content: string }): unknown[] {
  return (JSON.parse(decodeUtf8Base64(file.content)) as { games?: unknown[] }).games ?? [];
}

export async function handleListGames(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  try {
    const file = asFile(await readContent(octokitOf(context.env), context.env, GAMES_PATH));
    return json(file ? gamesOf(file) : []);
  } catch {
    // Any failure reads as no games, logged below with where to look.
  }
  console.error("listGames: data/_meta/games.json not found - check GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH env vars");
  return json([]);
}

/** Each game with its records per configured category, inactive games included. */
async function gameCounts(env: Env): Promise<unknown[]> {
  const octokit = octokitOf(env);
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = dataBranch(env);
  const file = asFile(await readContent(octokit, env, GAMES_PATH));
  const games = (file ? gamesOf(file) : []) as { slug: string }[];
  const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch });
  // The whole tree, pictures included: read with a plain parse, as Octokit's
  // costs several milliseconds once heroes have theirs (github-tree.ts).
  const treeData = await readRepoTree({ token: env.GITHUB_TOKEN, owner, repo, headers: octokitHeaders(octokit) }, branchData.commit.commit.tree.sha);
  // The Categories page locks a category's folder while any game has records in it.
  const categories = await readCategories((path) => githubReader(octokit, owner, repo, branch).read(path));
  return games.map((game) => {
    const count = (folder: string) => treeData.tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(`data/${game.slug}/${folder}/`) && entry.path.endsWith(".json")).length;
    return { ...game, counts: Object.fromEntries(categories.map((category) => [category.folder, count(category.folder)])) };
  });
}

/** The dashboard without counts, when they can't be read; the error in the log. */
function noCounts(error: unknown): Response {
  console.error("handleDashboardData error:", error);
  return json({ games: [] });
}

export async function handleDashboardData(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  try {
    return json({ games: await gameCounts(context.env) }, STATUS.ok, NO_STORE);
  } catch (error) {
    return noCounts(error);
  }
}

interface GithubCommit {
  sha: string;
  commit: { message: string; committer: { date: string } };
  html_url: string;
}

/** A setting, or a placeholder in its stead when the deploy left it out (the type says it's there). */
function orPlaceholder(value: string | undefined, placeholder: string): string {
  return value ?? placeholder;
}

/** The data branch's latest commits, from GitHub's REST API. */
async function latestCommits(env: Env): Promise<Response> {
  const owner = orPlaceholder(env.GITHUB_OWNER, "YOUR_ORG");
  const repo = orPlaceholder(env.GITHUB_REPO, "YOUR_REPO");
  // The data branch's history, which every save commits to: the repo's default branch may be another.
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=${String(COMMITS_SHOWN)}&sha=${encodeURIComponent(dataBranch(env))}`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "User-Agent": "athena-admin" },
  });
  if (!response.ok) {
    return response.status === STATUS.conflict ? json({ commits: [], error: null }) : json({ commits: [], error: `GitHub API returned ${String(response.status)}` });
  }
  const raw: unknown = await response.json();
  const commits = Array.isArray(raw) ? (raw as GithubCommit[]).map((entry) => ({ sha: entry.sha, message: entry.commit.message, date: entry.commit.committer.date, url: entry.html_url })) : [];
  return json({ commits, error: null }, STATUS.ok, NO_STORE);
}

export async function handleCommits(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  if (!context.env.GITHUB_TOKEN) {
    return json({ commits: [], error: "GITHUB_TOKEN not configured" });
  }
  try {
    return await latestCommits(context.env);
  } catch (error) {
    return json({ commits: [], error: error instanceof Error ? error.message : "Unknown error" });
  }
}

export async function handleGetEnum(context: ApiContext, { game, enumId }: { game: string; enumId: string }): Promise<Response> {
  await requireAuth(context);
  const path = `data/${game}/enums/${enumId}.json`;
  assertSafeFilePath(path);
  try {
    const file = asFile(await readContent(octokitOf(context.env), context.env, path));
    if (file) {
      return json(JSON.parse(decodeUtf8Base64(file.content)), STATUS.ok, NO_STORE);
    }
    return json({ error: "Not found" }, STATUS.notFound);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return json({ error: "Not found" }, STATUS.notFound);
    }
    throw error;
  }
}
