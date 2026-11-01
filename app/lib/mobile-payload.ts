import type { Octokit } from "@octokit/rest";
import { CATEGORIES_PATH, DEFAULT_CATEGORIES, appCategory, normalizeCategories, readCategories } from "./categories";
import { decodeUtf8Base64 } from "./utf8-base64";
import { GraphqlUnavailable, SYMLINK_MODE, readObjects, usableText, type GraphqlObject } from "./github-graphql";

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
  assets(): Promise<Map<string, string>>;
  /**
   * The .json files of several folders, and several files, in one request
   * (GitHub GraphQL): null for one that doesn't exist; a file without text is
   * one to read with read(). Rejects with GraphqlUnavailable when it can't:
   * then list() and read() do it all.
   */
  readMany?(folders: string[], files: string[]): Promise<{ folders: (FileText[] | null)[]; files: (FileText | null)[] }>;
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

/**
 * `value` with every string that is exactly the path of a picture in `hashes`
 * given that picture's version. Other strings, including text that merely
 * mentions a path, unknown paths and other sites' URLs, are left as they are.
 */
export function versionAssets<T>(value: T, hashes: Map<string, string>): T {
  if (typeof value === "string") {
    const file = assetFile(value);
    const hash = file === undefined ? undefined : hashes.get(file);
    return (hash ? `${value}?v=${hash.slice(0, VERSION_LENGTH)}` : value) as T;
  }
  if (Array.isArray(value)) return value.map((entry) => versionAssets(entry, hashes)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, versionAssets(entry, hashes)])) as T;
  }
  return value;
}

/** The asset hashes, or none (pictures then go out unversioned) and a partial payload when they can't be read. */
async function assetHashes(reader: RepoReader): Promise<{ hashes: Map<string, string>; partial: boolean }> {
  try {
    return { hashes: await reader.assets(), partial: false };
  } catch (err) {
    console.error("Couldn't read the asset hashes:", err);
    return { hashes: new Map(), partial: true };
  }
}

/** The /mobile/init payload: active games with their schemas, enums, screens and navigation. */
export async function buildInitPayload(reader: RepoReader): Promise<{ payload: Record<string, unknown>; partial: boolean }> {
  const assets = assetHashes(reader);
  // games.json; without it there is nothing to show.
  const games: { slug?: string; id?: string; active?: unknown }[] = JSON.parse(await reader.read("data/_meta/games.json")).games ?? [];
  const activeGames = games.filter((g) => g.active !== false);
  // Every game's folders and navigation, and the categories, in one request when the reader can.
  const dirs = (gameId: string) => [`data/${gameId}/schemas`, `data/${gameId}/enums`, `data/${gameId}/screens`];
  const ids = activeGames.map((game) => String(game.slug || game.id));
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
  // Set when a file was left out, so this payload is only cached briefly.
  let partial = false;

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
      partial ||= schemaFiles.partial || enumFiles.partial || screenFiles.partial || navFile.partial;
    }),
  );

  const { hashes, partial: noHashes } = await assets;
  const { content: categories, partial: noCategories } = await categoriesFile;
  const payload = versionAssets(
    {
      games: activeGames,
      // The app has no use for the admin's notify settings.
      categories: (categories === null ? [...DEFAULT_CATEGORIES] : normalizeCategories(categories).categories).map(appCategory),
      schemas,
      enums,
      screens,
      navigation,
      // App builds from before screens require this key; layouts are no longer served.
      layouts: {},
    },
    hashes,
  );
  return { payload, partial: partial || noHashes || noCategories };
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

/** The /mobile/data payload: the records of one folder. */
export async function buildDataPayload(reader: RepoReader, dir: string): Promise<{ payload: unknown[]; partial: boolean }> {
  const [{ files, partial }, { hashes, partial: noHashes }] = await Promise.all([readJsonFolder(reader, dir), assetHashes(reader)]);
  return { payload: versionAssets(files.map((f) => f.content), hashes), partial: partial || noHashes };
}

/**
 * A RepoReader over the GitHub contents API; with `graphql` (the token), it
 * reads folders through GraphQL too (readMany). After GraphQL fails once, the
 * reader uses REST alone, so a token that can't use it costs one request per
 * reader (one per Function invocation), and one line in the log.
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
      const { data } = await octokit.git.getTree({ owner, repo, tree_sha: ref, recursive: "true" });
      if (data.truncated) console.error("The repo tree is truncated: some pictures go out without a version.");
      const prefix = "public/assets/";
      return new Map(
        data.tree.filter((entry) => entry.type === "blob" && entry.path?.startsWith(prefix) && entry.sha).map((entry) => [entry.path!.slice(prefix.length), entry.sha!]),
      );
    },
  };
}
