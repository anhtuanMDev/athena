import type { Octokit } from "@octokit/rest";
import { CATEGORIES_PATH, DEFAULT_CATEGORIES, appCategory, normalizeCategories, readCategories } from "./categories";
import { isGameActive } from "./games";
import { decodeUtf8Base64 } from "./utf8-base64";
import { GraphqlUnavailable, SYMLINK_MODE, readObjects, usableText, type GraphqlObject } from "./github-graphql";
import { octokitHeaders, readRepoTree } from "./github-tree";

// Reading the data repo for /mobile/init and /mobile/data. Files are edited by
// hand as well as by the admin, and GitHub can fail a request now and then, so
// one unreadable file is left out instead of emptying its whole folder, and a
// payload missing files is cached briefly rather than until the next save.
//
// Pictures under public/assets keep their path when they're replaced, so the
// payloads add each one's content hash to its URL (/api/assets/x.webp?v=…):
// the app can then keep a picture for good and still get a new one at once.
//
// Folders are read through GitHub GraphQL when the token allows it: one
// request for any number of files (see github-graphql.ts). Through REST, each
// file is a request of its own, and a Function on the Workers Free plan may
// make 50.

/** The data repo as the mobile endpoints read it. */
export interface RepoReader {
  /** Paths of the .json files in `dir`; rejects with a `status` of 404 when it doesn't exist. */
  list(dir: string): Promise<string[]>;
  /** A file's text; rejects with a `status` of 404 when it doesn't exist. */
  read(path: string): Promise<string>;
  /** The git blob hash of every file under public/assets, by its path below that folder. */
  assets(): Promise<AssetHashes>;
  /**
   * The .json files of several folders, and several files, in one request
   * (GitHub GraphQL): null for one that doesn't exist; a file without text is
   * one to read with read(). Rejects with GraphqlUnavailable when it can't:
   * then list() and read() do it all.
   */
  readMany?(folders: string[], files: string[]): Promise<{ folders: (FileText[] | null)[]; files: (FileText | null)[] }>;
}

/**
 * The pictures' hashes, and whether GitHub cut the tree short: the pictures
 * it left out then go out unversioned, as they always did, but such a list
 * is never kept for later builds.
 */
export interface AssetHashes {
  hashes: Map<string, string>;
  truncated: boolean;
}

/** A file and, when it came with it, its text. */
export interface FileText {
  path: string;
  text?: string;
}

export interface JsonFile {
  /** The file name without ".json" (a screen's id). */
  name: string;
  content: unknown;
}

/** How long the Workers cache keeps a payload: until a save bumps its version, or a minute when files were left out. */
export const CACHE_CONTROL = {
  complete: "public, max-age=31536000, s-maxage=31536000",
  partial: "public, max-age=60, s-maxage=60",
};

/** Files fetched at once, within Cloudflare's and GitHub's concurrency limits. */
const CHUNK_SIZE = 10;

const isNotFound = (err: unknown) => (err as { status?: unknown } | null)?.status === 404;

/** A folder's JSON files; `unread` counts those left out. */
export interface JsonFolder {
  files: JsonFile[];
  partial: boolean;
  unread: number;
}

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");

/** The files of `texts` parsed, in their order; those without text are read, CHUNK_SIZE at once. One that can't be read or parsed is left out. */
async function parseFiles(reader: RepoReader, texts: FileText[]): Promise<JsonFolder> {
  const files: JsonFile[] = [];
  let unread = 0;
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = await Promise.all(
      texts.slice(i, i + CHUNK_SIZE).map(async ({ path, text }) => {
        try {
          return { name: nameOf(path), content: JSON.parse(text ?? (await reader.read(path))) as unknown };
        } catch (err) {
          console.error(`Left out ${path}:`, err);
          unread++;
          return null;
        }
      }),
    );
    files.push(...chunk.filter((file): file is JsonFile => file !== null));
  }
  return { files, partial: unread > 0, unread };
}

/** Through REST: list the folder (404: it has no files), then read each file. */
async function readFolderRest(reader: RepoReader, dir: string): Promise<JsonFolder> {
  let paths: string[];
  try {
    paths = await reader.list(dir);
  } catch (err) {
    if (isNotFound(err)) return { files: [], partial: false, unread: 0 };
    throw err;
  }
  return parseFiles(reader, paths.map((path) => ({ path })));
}

/**
 * `folders` and `files` read together, in one request when the reader can
 * (GraphQL), else each through REST. Each result is a promise of its own,
 * settling as a REST read of it would: a folder that can't be listed rejects.
 */
export function readJsonTogether(reader: RepoReader, folders: string[], files: string[]) {
  const batch =
    reader.readMany && folders.length + files.length > 0
      ? reader.readMany(folders, files).catch((err) => {
          if (err instanceof GraphqlUnavailable) return null;
          throw err;
        })
      : Promise.resolve(null);
  return {
    async folder(dir: string): Promise<JsonFolder> {
      const read = await batch;
      const texts = read?.folders[folders.indexOf(dir)];
      if (!read || texts === undefined) return readFolderRest(reader, dir);
      return texts === null ? { files: [], partial: false, unread: 0 } : parseFiles(reader, texts);
    },
    async file(path: string): Promise<{ content: unknown; partial: boolean }> {
      const read = await batch;
      const found = read?.files[files.indexOf(path)];
      if (!read || found === undefined || (found !== null && found.text === undefined)) return readJsonFile(reader, path);
      if (found === null) return { content: null, partial: false };
      try {
        return { content: JSON.parse(found.text!), partial: false };
      } catch (err) {
        console.error(`Left out ${path}:`, err);
        return { content: null, partial: true };
      }
    },
  };
}

/**
 * The JSON files of a folder, or none when the folder doesn't exist. A file
 * that can't be fetched or parsed is left out and makes the result partial;
 * failing to list the folder rejects, so no payload claims it is empty.
 */
export async function readJsonFolder(reader: RepoReader, dir: string): Promise<{ files: JsonFile[]; partial: boolean }> {
  const { files, partial } = await readJsonFolderCounted(reader, dir);
  return { files, partial };
}

/** readJsonFolder, with the number of files left out (the admin's X-Incomplete). */
export function readJsonFolderCounted(reader: RepoReader, dir: string): Promise<JsonFolder> {
  return readJsonTogether(reader, [dir], []).folder(dir);
}

/** A JSON file, or null when it doesn't exist; an unparsable file is null and partial. */
export async function readJsonFile(reader: RepoReader, path: string): Promise<{ content: unknown; partial: boolean }> {
  let text: string;
  try {
    text = await reader.read(path);
  } catch (err) {
    if (isNotFound(err)) return { content: null, partial: false };
    throw err;
  }
  try {
    return { content: JSON.parse(text), partial: false };
  } catch (err) {
    console.error(`Left out ${path}:`, err);
    return { content: null, partial: true };
  }
}

/** Characters of a picture's content hash in its URL: enough to tell versions apart. */
const VERSION_LENGTH = 12;

/** The file under public/assets an asset path names ("/api/assets/x.webp", "assets/x.webp"), as stored in the data. */
function assetFile(value: string): string | undefined {
  const path = value.startsWith("/api/assets/") ? value.slice("/api/assets/".length) : value.startsWith("assets/") ? value.slice("assets/".length) : undefined;
  // Already versioned, or carrying another query: left as written.
  if (!path || /[?#]/.test(path)) return undefined;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** A string with its picture's version when it is exactly the path of a picture in `hashes`. */
function versionString(value: string, hashes: Map<string, string>): string {
  const file = assetFile(value);
  const hash = file === undefined ? undefined : hashes.get(file);
  return hash ? `${value}?v=${hash.slice(0, VERSION_LENGTH)}` : value;
}

/**
 * `value` with every string that is exactly the path of a picture in `hashes`
 * given that picture's version. Other strings, including text that merely
 * mentions a path, unknown paths and other sites' URLs, are left as they are.
 */
export function versionAssets<T>(value: T, hashes: Map<string, string>): T {
  if (typeof value === "string") return versionString(value, hashes) as T;
  if (Array.isArray(value)) return value.map((entry) => versionAssets(entry, hashes)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, versionAssets(entry, hashes)])) as T;
  }
  return value;
}

/**
 * versionAssets done in place, for a payload the build has just parsed and
 * owns: the same rule for each string, without copying every object and
 * list. On 80 filled heroes the copies cost 3.3 ms of workerd's CPU; this
 * costs 0.6 ms.
 */
export function versionAssetsInPlace(value: unknown, hashes: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const entry: unknown = value[i];
      if (typeof entry === "string") {
        if (mayBeAsset(entry)) value[i] = versionString(entry, hashes);
      } else if (entry && typeof entry === "object") versionAssetsInPlace(entry, hashes);
    }
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A parsed record has only its own keys: for…in reads them without a list of them.
    for (const key in record) {
      const entry = record[key];
      if (typeof entry === "string") {
        if (mayBeAsset(entry)) record[key] = versionString(entry, hashes);
      } else if (entry && typeof entry === "object") versionAssetsInPlace(entry, hashes);
    }
  }
}

/** Whether a string can start "/api/assets/" or "assets/": most of a record's text can't, and is passed over at once. */
const mayBeAsset = (value: string) => {
  const first = value.charCodeAt(0);
  return first === 47 || first === 97;
};

/**
 * Where a data center keeps the picture hashes it read, for the next builds
 * under the same assets version (the init payload and every folder's share
 * them): a cold build then skips the tree, one GitHub request and its parse.
 */
export interface AssetHashesMemo {
  cache: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };
  /** The assets version the payload is built under (mobile-cache-version.ts); null when KV couldn't say. */
  version: string | null;
}

/**
 * How long the kept hashes are used. A save through the admin, or a push the
 * webhook sees, moves the assets version and so leaves them behind at once;
 * a picture pushed with neither would otherwise keep its old version until
 * the next such save. An hour bounds that, and still covers the bursts of
 * cold builds a save sets off.
 */
const ASSET_HASHES_MEMO_SECONDS = 3600;

const assetHashesKey = (version: string) => new Request(`https://api.internal/mobile/asset-hashes?a=${encodeURIComponent(version)}`);

/** The kept hashes are [path, hash] pairs: cheaper to write and read than an object keyed by 1,600 paths. */
const isPairList = (value: unknown): value is [string, string][] =>
  Array.isArray(value) && value.every((pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string");

/**
 * The asset hashes, or none (pictures then go out unversioned) and a partial
 * payload when they can't be read. With a memo, those kept under the same
 * assets version are used; only a complete read is kept, and nothing is kept
 * or used while the version is unknown.
 */
async function assetHashes(reader: RepoReader, memo?: AssetHashesMemo): Promise<{ hashes: Map<string, string>; partial: boolean }> {
  const key = memo && memo.version !== null ? assetHashesKey(memo.version) : null;
  if (memo && key) {
    const kept = await memo.cache.match(key).catch(() => undefined);
    const pairs: unknown = kept ? await kept.json().catch(() => undefined) : undefined;
    if (isPairList(pairs)) return { hashes: new Map(pairs), partial: false };
  }
  let read: AssetHashes;
  try {
    read = await reader.assets();
  } catch (err) {
    console.error("Couldn't read the asset hashes:", err);
    return { hashes: new Map(), partial: true };
  }
  if (memo && key && !read.truncated) {
    // Only the part of each hash a URL carries, so the kept list stays small.
    const pairs = Array.from(read.hashes, ([path, hash]) => [path, hash.slice(0, VERSION_LENGTH)]);
    const entry = new Response(JSON.stringify(pairs), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ASSET_HASHES_MEMO_SECONDS}` },
    });
    await memo.cache.put(key, entry).catch((err) => console.error("Picture hashes memo failed:", err));
  }
  return { hashes: read.hashes, partial: false };
}

const GAMES_PATH = "data/_meta/games.json";
type GameEntry = { slug?: string; id?: string; active?: unknown };

/**
 * The games players see in games.json's text: all but those marked `active:
 * false`, and the id the app knows each by (its slug, else its id). The one
 * rule for /mobile/init and for which games /mobile/data serves. Throws when
 * the file isn't a list of games.
 */
function activeGamesIn(text: string): { games: GameEntry[]; ids: string[] } {
  const games: GameEntry[] = JSON.parse(text).games ?? [];
  const active = games.filter(isGameActive);
  return { games: active, ids: active.map((game) => String(game.slug || game.id)) };
}

/**
 * The /mobile/init payload: active games with their schemas, enums, screens
 * and navigation. `leftOut` counts the files left out (the picture versions as
 * one), the app's X-Incomplete; `games`, the ids of the games it lists.
 * `assetsMemo`: where the picture hashes are kept between builds.
 */
export async function buildInitPayload(
  reader: RepoReader,
  assetsMemo?: AssetHashesMemo,
): Promise<{ payload: Record<string, unknown>; partial: boolean; leftOut: number; games: string[] }> {
  const assets = assetHashes(reader, assetsMemo);
  // games.json; without it there is nothing to show.
  const { games: activeGames, ids } = activeGamesIn(await reader.read(GAMES_PATH));
  // Every game's folders and navigation, and the categories, in one request when the reader can.
  const dirs = (gameId: string) => [`data/${gameId}/schemas`, `data/${gameId}/enums`, `data/${gameId}/screens`];
  const together = readJsonTogether(reader, ids.flatMap(dirs), [...ids.map((id) => `data/${id}/navigation.json`), CATEGORIES_PATH]);
  // The app's category list. Missing: the built-in ones; unreadable: those, cached briefly.
  const categoriesFile = together.file(CATEGORIES_PATH).catch((err) => {
    console.error(`Left out ${CATEGORIES_PATH}:`, err);
    return { content: null, partial: true };
  });

  const schemas: Record<string, unknown[]> = {};
  const enums: Record<string, unknown[]> = {};
  const screens: Record<string, unknown[]> = {};
  const navigation: Record<string, unknown> = {};
  // Files left out: this payload is then only cached briefly, and says so.
  let leftOut = 0;

  // A missing folder is empty; a file that can't be read is left out on its own.
  await Promise.all(
    activeGames.map(async (game) => {
      const gameId = String(game.slug || game.id);
      const [schemaDir, enumDir, screenDir] = dirs(gameId);
      const [schemaFiles, enumFiles, screenFiles, navFile] = await Promise.all([
        together.folder(schemaDir),
        together.folder(enumDir),
        together.folder(screenDir),
        // No navigation file: the app shows a single Home tab
        together.file(`data/${gameId}/navigation.json`),
      ]);
      schemas[gameId] = schemaFiles.files.map((f) => f.content);
      enums[gameId] = enumFiles.files.map((f) => f.content);
      // Screen files are named by their id ("home", "hero-detail") and don't
      // store it, so the app gets it from the name.
      screens[gameId] = screenFiles.files.map((f) => ({ ...(f.content as object), id: f.name }));
      navigation[gameId] = navFile.content;
      leftOut += schemaFiles.unread + enumFiles.unread + screenFiles.unread + (navFile.partial ? 1 : 0);
    }),
  );

  const { hashes, partial: noHashes } = await assets;
  const { content: categories, partial: noCategories } = await categoriesFile;
  const payload = {
    games: activeGames,
    // The app has no use for the admin's notify settings.
    categories: (categories === null ? [...DEFAULT_CATEGORIES] : normalizeCategories(categories).categories).map(appCategory),
    schemas,
    enums,
    screens,
    navigation,
    // App builds from before screens require this key; layouts are no longer served.
    layouts: {},
  };
  // Everything in it was parsed or made by this build (appCategory copies), so it is versioned in place.
  versionAssetsInPlace(payload, hashes);
  leftOut += (noHashes ? 1 : 0) + (noCategories ? 1 : 0);
  return { payload, partial: leftOut > 0, leftOut, games: ids };
}

/** How long a data center keeps the list of folders /mobile/data serves. */
const FOLDERS_MEMO_SECONDS = 60;

/**
 * The category folders /mobile/data serves, kept FOLDERS_MEMO_SECONDS in this
 * data center's cache: checking a request costs no KV read and at most one
 * GitHub read a minute, and a new category is served within that time.
 */
export async function servedFolders(
  cache: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> },
  reader: RepoReader,
): Promise<string[]> {
  const key = new Request("https://api.internal/mobile/category-folders");
  const kept = await cache.match(key).catch(() => undefined);
  if (kept) return kept.json();
  const folders = (await readCategories((path) => reader.read(path))).map((c) => c.folder);
  const entry = new Response(JSON.stringify(folders), { headers: { "Cache-Control": `max-age=${FOLDERS_MEMO_SECONDS}` } });
  await cache.put(key, entry).catch((err) => console.error("Category folders memo failed:", err));
  return folders;
}

/** How long a data center keeps the list of games /mobile/data serves. */
const GAMES_MEMO_SECONDS = 60;
/** How long the list read last is kept, for when games.json can't be read: as long as a complete payload. */
const GAMES_KEPT_SECONDS = 31536000;

/**
 * The ids of the games /mobile/data serves (active ones), kept
 * GAMES_MEMO_SECONDS in this data center's cache like servedFolders: a request
 * for any other game is refused before it costs a KV read or reaches GitHub,
 * and a game turned off stops being served within that time.
 *
 * When games.json can't be read (GitHub down, a hand edit that broke it), the
 * list read last stands in, so stale payloads can still be served for the
 * games that were active then. With none, null: nobody can tell which games
 * are served. Either is kept for the minute too, so a broken games.json can't
 * make every request ask GitHub again.
 */
export async function activeGames(
  cache: { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> },
  reader: RepoReader,
): Promise<string[] | null> {
  const key = new Request("https://api.internal/mobile/active-games");
  const lastKey = new Request("https://api.internal/mobile/last-good/active-games");
  const entry = (games: string[] | null, seconds: number) => new Response(JSON.stringify(games), { headers: { "Cache-Control": `max-age=${seconds}` } });
  const kept = await cache.match(key).catch(() => undefined);
  if (kept) return kept.json();
  let games: string[] | null;
  try {
    games = activeGamesIn(await reader.read(GAMES_PATH)).ids;
    await cache.put(lastKey, entry(games, GAMES_KEPT_SECONDS)).catch((err) => console.error("Games list copy failed:", err));
  } catch (err) {
    console.error("games.json couldn't be read; using the list read last:", err);
    const last = await cache.match(lastKey).catch(() => undefined);
    games = last ? await last.json() : null;
  }
  await cache.put(key, entry(games, GAMES_MEMO_SECONDS)).catch((err) => console.error("Games memo failed:", err));
  return games;
}

/**
 * The /mobile/data payload: the records of one folder. `leftOut` counts the
 * files left out (the picture versions as one), the app's X-Incomplete.
 * `assetsMemo`: where the picture hashes are kept between builds.
 */
export async function buildDataPayload(
  reader: RepoReader,
  dir: string,
  assetsMemo?: AssetHashesMemo,
): Promise<{ payload: unknown[]; partial: boolean; leftOut: number }> {
  const [{ files, unread }, { hashes, partial: noHashes }] = await Promise.all([readJsonFolderCounted(reader, dir), assetHashes(reader, assetsMemo)]);
  const leftOut = unread + (noHashes ? 1 : 0);
  // The records were parsed for this build alone, so they are versioned in place.
  const payload = files.map((f) => f.content);
  versionAssetsInPlace(payload, hashes);
  return { payload, partial: leftOut > 0, leftOut };
}

/**
 * A RepoReader over the GitHub contents API; with `graphql` (the token), it
 * reads folders through GraphQL too (readMany). After GraphQL fails once, the
 * reader uses REST alone, so a token that can't use it costs one request per
 * reader (one per Function invocation), and one line in the log. With the
 * token it also reads the repo tree without Octokit's parse (github-tree.ts).
 */
export function githubReader(octokit: Octokit, owner: string, repo: string, ref: string, graphql?: { token: string; fetcher?: typeof fetch }): RepoReader {
  let graphqlDown = false;
  const readMany = async (folders: string[], files: string[]) => {
    if (graphqlDown) throw new GraphqlUnavailable("failed earlier");
    let found: GraphqlObject[];
    try {
      found = await readObjects({ token: graphql!.token, owner, repo, fetcher: graphql!.fetcher }, ref, [...folders, ...files]);
    } catch (err) {
      if (err instanceof GraphqlUnavailable) {
        graphqlDown = true;
        console.warn(`${err.message}, reading through REST`);
      }
      throw err;
    }
    return {
      // A folder's .json files, as list() keeps them: no subfolders, no symlinks. A path that is a file lists nothing.
      folders: folders.map((dir, i): FileText[] | null => {
        const object = found[i];
        if (object === null) return null;
        if (object.kind !== "tree") return [];
        return object.entries
          .filter((e) => e.type === "blob" && e.mode !== SYMLINK_MODE && e.name.endsWith(".json"))
          .map((e) => ({ path: `${dir}/${e.name}`, text: usableText(e.blob) }));
      }),
      // A file, with its text when GraphQL gave it whole; anything else is left to read().
      files: files.map((path, i): FileText | null => {
        const object = found[folders.length + i];
        if (object === null) return null;
        return { path, text: object.kind === "blob" ? usableText(object.blob) : undefined };
      }),
    };
  };
  return {
    ...(graphql && { readMany }),
    async list(dir) {
      const { data } = await octokit.repos.getContent({ owner, repo, path: dir, ref });
      return Array.isArray(data) ? data.filter((entry) => entry.type === "file" && entry.name.endsWith(".json")).map((entry) => entry.path) : [];
    },
    async read(path) {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) throw new Error(`${path} is not a file.`);
      return decodeUtf8Base64(data.content);
    },
    async assets() {
      // One call for the whole tree; blob hashes are git's content hashes.
      // Without the token at hand (a reader made for REST reads only), Octokit reads it.
      const data = graphql
        ? await readRepoTree({ token: graphql.token, owner, repo, fetcher: graphql.fetcher, headers: octokitHeaders(octokit) }, ref)
        : (await octokit.git.getTree({ owner, repo, tree_sha: ref, recursive: "true" })).data;
      if (data.truncated) console.error("The repo tree is truncated: some pictures go out without a version.");
      const prefix = "public/assets/";
      const hashes = new Map<string, string>();
      for (const entry of data.tree) {
        if (entry.type === "blob" && entry.path?.startsWith(prefix) && entry.sha) hashes.set(entry.path.slice(prefix.length), entry.sha);
      }
      return { hashes, truncated: data.truncated };
    },
  };
}
