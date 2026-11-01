import type { Octokit } from "@octokit/rest";
import { decodeUtf8Base64 } from "./utf8-base64";

// Reading the data repo for /mobile/init and /mobile/data. Files are edited by
// hand as well as by the admin, and GitHub can fail a request now and then, so
// one unreadable file is left out instead of emptying its whole folder, and a
// payload missing files is cached briefly rather than until the next save.
//
// Pictures under public/assets keep their path when they're replaced, so the
// payloads add each one's content hash to its URL (/api/assets/x.webp?v=…):
// the app can then keep a picture for good and still get a new one at once.

/** The data repo as the mobile endpoints read it. */
export interface RepoReader {
  /** Paths of the .json files in `dir`; rejects with a `status` of 404 when it doesn't exist. */
  list(dir: string): Promise<string[]>;
  /** A file's text; rejects with a `status` of 404 when it doesn't exist. */
  read(path: string): Promise<string>;
  /** The git blob hash of every file under public/assets, by its path below that folder. */
  assets(): Promise<Map<string, string>>;
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

/**
 * The JSON files of a folder, or none when the folder doesn't exist. A file
 * that can't be fetched or parsed is left out and makes the result partial;
 * failing to list the folder rejects, so no payload claims it is empty.
 */
export async function readJsonFolder(reader: RepoReader, dir: string): Promise<{ files: JsonFile[]; partial: boolean }> {
  let paths: string[];
  try {
    paths = await reader.list(dir);
  } catch (err) {
    if (isNotFound(err)) return { files: [], partial: false };
    throw err;
  }
  const files: JsonFile[] = [];
  let partial = false;
  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    const chunk = await Promise.all(
      paths.slice(i, i + CHUNK_SIZE).map(async (path) => {
        try {
          return { name: path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, ""), content: JSON.parse(await reader.read(path)) as unknown };
        } catch (err) {
          console.error(`Left out ${path}:`, err);
          partial = true;
          return null;
        }
      }),
    );
    files.push(...chunk.filter((file): file is JsonFile => file !== null));
  }
  return { files, partial };
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
      const [schemaFiles, enumFiles, screenFiles, navFile] = await Promise.all([
        readJsonFolder(reader, `data/${gameId}/schemas`),
        readJsonFolder(reader, `data/${gameId}/enums`),
        readJsonFolder(reader, `data/${gameId}/screens`),
        // No navigation file: the app shows a single Home tab
        readJsonFile(reader, `data/${gameId}/navigation.json`),
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
  const payload = versionAssets(
    {
      games: activeGames,
      schemas,
      enums,
      screens,
      navigation,
      // App builds from before screens require this key; layouts are no longer served.
      layouts: {},
    },
    hashes,
  );
  return { payload, partial: partial || noHashes };
}

/** The /mobile/data payload: the records of one folder. */
export async function buildDataPayload(reader: RepoReader, dir: string): Promise<{ payload: unknown[]; partial: boolean }> {
  const [{ files, partial }, { hashes, partial: noHashes }] = await Promise.all([readJsonFolder(reader, dir), assetHashes(reader)]);
  return { payload: versionAssets(files.map((f) => f.content), hashes), partial: partial || noHashes };
}

/** A RepoReader over the GitHub contents API. */
export function githubReader(octokit: Octokit, owner: string, repo: string, ref: string): RepoReader {
  return {
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
