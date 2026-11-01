import type { Octokit } from "@octokit/rest";
import { decodeUtf8Base64 } from "./utf8-base64";

// Reading the data repo for /mobile/init and /mobile/data. Files are edited by
// hand as well as by the admin, and GitHub can fail a request now and then, so
// one unreadable file is left out instead of emptying its whole folder, and a
// payload missing files is cached briefly rather than until the next save.

/** The data repo as the mobile endpoints read it. */
export interface RepoReader {
  /** Paths of the .json files in `dir`; rejects with a `status` of 404 when it doesn't exist. */
  list(dir: string): Promise<string[]>;
  /** A file's text; rejects with a `status` of 404 when it doesn't exist. */
  read(path: string): Promise<string>;
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
  };
}
