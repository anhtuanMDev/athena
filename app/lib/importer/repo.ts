/**
 * The data repository as imports see it: list a folder, read a JSON file,
 * and write several files in one commit, so a run, an approval or a dismissal
 * lands whole or not at all (and the push webhook fires once).
 */
import { GraphqlUnavailable, SYMLINK_MODE, readAtCommit, readObjects, usableText, type GraphqlObject } from "../github-graphql";
import { jsonFileText } from "../json-file";
import { decodeUtf8Base64 } from "../utf8-base64";

export interface FileChange {
  path: string;
  /** The file's new JSON content, or null to delete it. */
  content: unknown | null;
}

/** A file set to a blob already in the repository: an uploaded picture's (BlobWriter). */
export interface BlobChange {
  path: string;
  /** The blob's sha. */
  blob: string;
}

/**
 * A write worked out from files as they are on the commit it goes on top of.
 * The cron worker, "Run now" and a reviewer's publish or dismiss all write a
 * job's files, and each takes a while between reading them and committing
 * (a run fetches its source): what the others committed meanwhile must
 * survive. So the changes come from the files at the head the commit is made
 * on, and when the branch moves before it lands, they're worked out again on
 * the new head.
 */
export interface Edit {
  /** The files `changes` needs. */
  reads: string[];
  /** The changes, given each of `reads` as it is at that head (null: no such file). It may throw to refuse. */
  changes(current: ReadonlyMap<string, unknown>): FileChange[];
  message: string;
}

export interface DataRepo {
  /** File names (without ".json") in a folder; empty when it doesn't exist. */
  list(dir: string): Promise<string[]>;
  read<T = unknown>(path: string): Promise<T | null>;
  /** Makes `edit` one commit on the branch (none when it changes nothing). */
  edit(edit: Edit): Promise<void>;
}

/** The repository at one commit, for a change that must apply to exactly what was checked. */
export interface PinnedRepo {
  /** The branch's head commit, and the blob sha of each file at `paths`, or under those ending in "/". */
  snapshot(paths: string[]): Promise<{ head: string; files: Record<string, string> }>;
  /**
   * Commits `changes` on top of `parent` only: if the branch has moved since,
   * nothing is written (RepoError 422, `moved`). Resolves to the new commit's
   * sha, or null when there was nothing to commit.
   */
  commitOn(parent: string, changes: (FileChange | BlobChange)[], message: string): Promise<string | null>;
}

export interface BlobWriter {
  /** Keeps `base64`'s bytes as a blob, which no commit holds yet, and resolves to its sha. */
  createBlob(base64: string): Promise<string>;
}

/** Paths to read together: files with their text, folders with their .json files' text, and listings (.json names alone). */
export interface ReadPaths {
  files?: string[];
  folders?: string[];
  listings?: string[];
}

/** What one request found at ReadPaths, in their order. */
export interface ReadTogether {
  /** Each file's text: null when there is no such file, undefined when it must be read on its own. */
  files: (string | null | undefined)[];
  /** Each folder's .json files (names without ".json") and their text, undefined when one must be read on its own; null when there's no such folder. */
  folders: ({ name: string; text: string | undefined }[] | null)[];
  /** Each listing's .json file names, without ".json"; null when there's no such folder. */
  listings: (string[] | null)[];
}

export interface BulkReader {
  /** `paths` in one request (GitHub GraphQL); rejects with GraphqlUnavailable when it can't. */
  readTogether(paths: Required<ReadPaths>): Promise<ReadTogether>;
}

export interface GitHubEnv {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
}

export class RepoError extends Error {
  name = "RepoError";
  readonly status: number;
  /** The branch moved before the commit landed: GitHub refused the ref update (422) as not a fast-forward. */
  readonly moved: boolean;
  constructor(message: string, status: number, moved = false) {
    super(message);
    this.status = status;
    this.moved = moved;
  }
}

/** A folder's .json files as list() keeps them: no subfolders, no symlinks. */
const jsonEntries = (object: GraphqlObject) =>
  object?.kind === "tree" ? object.entries.filter((e) => e.type === "blob" && e.mode !== SYMLINK_MODE && e.name.endsWith(".json")) : [];

/** How many times an edit is made before giving up while the branch keeps moving: a Function's (the cron worker passes its own). */
const EDIT_ATTEMPTS = 3;

/**
 * A DataRepo backed by the GitHub REST API, which can also read many files in
 * one GraphQL request. An edit makes at most `editAttempts` tries, each of 5
 * requests through GraphQL (the head, its files, then the tree, commit and ref
 * update), or 5 and one per file read through REST.
 */
export function githubRepo(
  env: GitHubEnv,
  fetcher: typeof fetch = fetch,
  { editAttempts = EDIT_ATTEMPTS }: { editAttempts?: number } = {},
): DataRepo & PinnedRepo & BulkReader & BlobWriter & { readonly editAttempts: number } {
  const base = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const branch = env.GITHUB_BRANCH || "main";
  const target = { token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, fetcher };
  /** GraphQL failed once: this invocation reads through REST from then on. */
  let graphqlDown = false;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetcher(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "Athena-Importer",
        "Cache-Control": "no-cache",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new RepoError(`GitHub answered ${response.status} for ${method} ${path}`, response.status);
    return (await response.json()) as T;
  }

  const contents = (path: string, ref = branch) =>
    `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;

  const head = async () => (await call<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;

  /** A JSON file through REST, at `ref` (a branch or a commit); null when there's none. */
  async function readFile<T>(path: string, ref?: string): Promise<T | null> {
    try {
      const file = await call<{ content?: string }>("GET", contents(path, ref));
      return file.content ? (JSON.parse(decodeUtf8Base64(file.content)) as T) : null;
    } catch (err) {
      if (err instanceof RepoError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * The root tree of `commit`, and the JSON of each of `paths` there (null: no
   * such file): one GraphQL request, or GET commit and a REST read per file.
   */
  async function readAt(commit: string, paths: string[]): Promise<{ tree: string; files: Map<string, unknown> }> {
    const files = new Map<string, unknown>();
    if (paths.length > 0 && !graphqlDown) {
      try {
        const found = await readAtCommit(target, commit, paths);
        if (found.tree) {
          for (const [i, path] of paths.entries()) {
            const object = found.objects[i];
            if (object === null || object.kind === "tree") files.set(path, null);
            else {
              const text = object.kind === "blob" ? usableText(object.blob) : undefined;
              // As a REST read: an empty file is no content; a blob GraphQL can't give whole is read through REST.
              files.set(path, text === undefined ? await readFile(path, commit) : text ? JSON.parse(text) : null);
            }
          }
          return { tree: found.tree, files };
        }
      } catch (err) {
        if (!(err instanceof GraphqlUnavailable)) throw err;
        graphqlDown = true;
        console.warn(`${err.message}, reading through REST`);
      }
    }
    const { tree } = await call<{ tree: { sha: string } }>("GET", `/git/commits/${commit}`);
    for (const path of paths) files.set(path, await readFile(path, commit));
    return { tree: tree.sha, files };
  }

  async function commitOnce(changes: (FileChange | BlobChange)[], message: string, on?: string, baseTree?: string): Promise<string> {
    const parentSha = on ?? (await head());
    const parent = baseTree ? { tree: { sha: baseTree } } : await call<{ tree: { sha: string } }>("GET", `/git/commits/${parentSha}`);
    const tree = await call<{ sha: string }>("POST", "/git/trees", {
      base_tree: parent.tree.sha,
      tree: changes.map((change) =>
        "blob" in change
          ? { path: change.path, mode: "100644", type: "blob", sha: change.blob }
          : change.content === null
            ? { path: change.path, mode: "100644", type: "blob", sha: null }
            : { path: change.path, mode: "100644", type: "blob", content: jsonFileText(change.content) },
      ),
    });
    const commit = await call<{ sha: string }>("POST", "/git/commits", {
      message,
      tree: tree.sha,
      parents: [parentSha],
    });
    try {
      await call("PATCH", `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
    } catch (err) {
      // Not a fast-forward: someone committed on the branch since `parentSha`.
      if (err instanceof RepoError && err.status === 422) throw new RepoError(err.message, 422, true);
      throw err;
    }
    return commit.sha;
  }

  return {
    editAttempts,
    // Answers as list() and read() would: a path that is a folder reads as no file, a
    // file lists nothing, and a blob GraphQL can't give whole is left to read().
    async readTogether({ files, folders, listings }) {
      let found: GraphqlObject[];
      try {
        found = await readObjects(target, branch, [...files, ...folders], listings);
      } catch (err) {
        if (err instanceof GraphqlUnavailable) graphqlDown = true;
        throw err;
      }
      return {
        files: files.map((_, i) => {
          const object = found[i];
          if (object === null || object.kind === "tree") return null;
          return object.kind === "blob" ? usableText(object.blob) : undefined;
        }),
        folders: folders.map((_, i) => {
          const object = found[files.length + i];
          return object === null ? null : jsonEntries(object).map((e) => ({ name: e.name.slice(0, -5), text: usableText(e.blob) }));
        }),
        listings: listings.map((_, i) => {
          const object = found[files.length + folders.length + i];
          return object === null ? null : jsonEntries(object).map((e) => e.name.slice(0, -5));
        }),
      };
    },
    async list(dir) {
      try {
        const entries = await call<{ type: string; name: string }[]>("GET", contents(dir));
        return Array.isArray(entries)
          ? entries.filter((e) => e.type === "file" && e.name.endsWith(".json")).map((e) => e.name.slice(0, -5))
          : [];
      } catch (err) {
        if (err instanceof RepoError && err.status === 404) return [];
        throw err;
      }
    },
    read: (path) => readFile(path),
    async snapshot(paths) {
      const commit = await head();
      const { tree: root } = await call<{ tree: { sha: string } }>("GET", `/git/commits/${commit}`);
      const tree = await call<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>("GET", `/git/trees/${root.sha}?recursive=1`);
      // A truncated tree can't show that a file isn't there: refuse rather than guess.
      if (tree.truncated) throw new RepoError("The data repository has too many files to list in one read.", 503);
      const wanted = (path: string) => paths.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
      const files = Object.fromEntries(tree.tree.filter((e) => e.type === "blob" && wanted(e.path)).map((e) => [e.path, e.sha]));
      return { head: commit, files };
    },
    async commitOn(parent, changes, message) {
      return changes.length > 0 ? commitOnce(changes, message, parent) : null;
    },
    async createBlob(base64) {
      // GitHub decodes it: the bytes are never decoded here (a Function has 10 ms of CPU).
      return (await call<{ sha: string }>("POST", "/git/blobs", { content: base64, encoding: "base64" })).sha;
    },
    async edit({ reads, changes, message }) {
      // What reads nothing is the same on any head: nothing to write, no request.
      if (reads.length === 0 && changes(new Map()).length === 0) return;
      for (let attempt = 1; ; attempt++) {
        const parent = await head();
        const { tree, files } = await readAt(parent, reads);
        const list = changes(files);
        if (list.length === 0) return;
        try {
          await commitOnce(list, message, parent, tree);
          return;
        } catch (err) {
          // Someone else committed between reading the head and moving it: work it out again on theirs.
          if (!(err instanceof RepoError && err.moved)) throw err;
          if (attempt >= editAttempts) throw new RepoError("The data repository changed while saving, again and again. Try again.", 409);
        }
      }
    },
  };
}

/** A DataRepo for one run of several imports (the cron worker's): see runRepo. */
export interface RunRepo extends DataRepo {
  /**
   * Reads `paths` in one request when the repository can (BulkReader), so
   * read() and list() answer them without one; does nothing when it can't
   * (GraphQL unavailable), and they read through REST as before.
   */
  prefetch(paths: ReadPaths): Promise<void>;
  /**
   * The requests reading these would still make: none for a path prefetched,
   * or read or listed before. `edits`: files an edit reads at the head when
   * the run commits, on each try; none while GraphQL reads them all at once.
   */
  pending(paths: { files?: string[]; listings?: string[]; edits?: string[] }): number;
  /**
   * Writes everything edited so far in one commit: one job's with its own
   * message, several under one headline. `extra` (the run's log) goes in the
   * same commit, as one more line of its message, without counting as a job.
   */
  flush(extra?: { changes: FileChange[]; message: string }): Promise<void>;
}

/**
 * `base` for one run of several imports. A Worker on the Workers Free plan may
 * make 50 subrequests, and through REST alone each job made 16: 8 reads, its
 * source's 3 and a commit of 5. Here the run's reads come from a few GraphQL
 * requests (prefetch), any read is made once (the jobs share the categories,
 * schemas and folders), and the jobs' commits are held and made as one (flush):
 * each job writes the same files as on its own, and nothing until the end.
 */
export function runRepo(base: DataRepo & Partial<BulkReader> & { readonly editAttempts?: number }): RunRepo {
  /** File texts the prefetches found; null: no such file. */
  const texts = new Map<string, string | null>();
  /** Folders' .json names the prefetches found. */
  const names = new Map<string, string[]>();
  const reads = new Map<string, Promise<unknown>>();
  const lists = new Map<string, Promise<string[]>>();
  const held: Edit[] = [];
  let together = typeof base.readTogether === "function";

  // A file of a folder read whole that isn't among its .json files is read through REST:
  // it may be missing, or a symlink, which REST reads as its target.
  const holds = (path: string) => texts.has(path) || reads.has(path);

  return {
    async prefetch({ files = [], folders = [], listings = [] }) {
      const wanted = {
        files: [...new Set(files)].filter((f) => !holds(f)),
        folders: [...new Set(folders)],
        listings: [...new Set(listings)].filter((d) => !names.has(d) && !lists.has(d)),
      };
      if (!together || wanted.files.length + wanted.folders.length + wanted.listings.length === 0) return;
      let found: ReadTogether;
      try {
        found = await base.readTogether!(wanted);
      } catch (err) {
        if (!(err instanceof GraphqlUnavailable)) throw err;
        // Once is enough to know: the rest of the run reads through REST.
        together = false;
        console.warn(`${err.message}, reading through REST`);
        return;
      }
      wanted.files.forEach((path, i) => {
        if (found.files[i] !== undefined) texts.set(path, found.files[i]!);
      });
      wanted.folders.forEach((dir, i) => {
        const entries = found.folders[i] ?? [];
        names.set(dir, entries.map((e) => e.name));
        for (const e of entries) if (e.text !== undefined) texts.set(`${dir}/${e.name}.json`, e.text);
      });
      wanted.listings.forEach((dir, i) => names.set(dir, found.listings[i] ?? []));
    },
    pending({ files = [], listings = [], edits = [] }) {
      return (
        [...new Set(files)].filter((f) => !holds(f)).length +
        [...new Set(listings)].filter((d) => !names.has(d) && !lists.has(d)).length +
        (together ? 0 : new Set(edits).size * (base.editAttempts ?? 1))
      );
    },
    async read<T>(path: string) {
      // As the REST read: an empty file is no content.
      if (texts.has(path)) return texts.get(path) ? (JSON.parse(texts.get(path)!) as T) : null;
      if (!reads.has(path)) reads.set(path, base.read(path));
      // A copy each time, as a fresh read would give.
      return structuredClone(await reads.get(path)) as T | null;
    },
    async list(dir) {
      if (names.has(dir)) return [...names.get(dir)!];
      if (!lists.has(dir)) lists.set(dir, base.list(dir));
      return [...(await lists.get(dir)!)];
    },
    async edit(edit) {
      held.push(edit);
    },
    async flush(extra) {
      const edits = held.splice(0);
      const log = extra && extra.changes.length > 0 ? extra : undefined;
      const messages = [...edits.map((e) => e.message), ...(log ? [log.message] : [])];
      if (messages.length === 0) return;
      const jobs = edits.length;
      const message = messages.length === 1 ? messages[0] : `Import run: ${jobs} job${jobs === 1 ? "" : "s"}\n\n${messages.join("\n")}`;
      // Each job's changes worked out on the head the run's one commit goes on.
      await base.edit({
        reads: [...new Set(edits.flatMap((e) => e.reads))],
        changes: (current) => [...edits.flatMap((e) => e.changes(current)), ...(log?.changes ?? [])],
        message,
      });
    },
  };
}
