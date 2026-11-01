/**
 * The data repository as imports see it: list a folder, read a JSON file,
 * and write several files in one commit, so a run, an approval or a dismissal
 * lands whole or not at all (and the push webhook fires once).
 */
import { decodeUtf8Base64 } from "../utf8-base64";

export interface FileChange {
  path: string;
  /** The file's new JSON content, or null to delete it. */
  content: unknown | null;
}

export interface DataRepo {
  /** File names (without ".json") in a folder; empty when it doesn't exist. */
  list(dir: string): Promise<string[]>;
  read<T = unknown>(path: string): Promise<T | null>;
  commit(changes: FileChange[], message: string): Promise<void>;
}

/** The repository at one commit, for a change that must apply to exactly what was checked. */
export interface PinnedRepo {
  /** The branch's head commit, and the blob sha of each file at `paths`, or under those ending in "/". */
  snapshot(paths: string[]): Promise<{ head: string; files: Record<string, string> }>;
  /** Commits `changes` on top of `parent` only: if the branch has moved since, nothing is written (RepoError 422). */
  commitOn(parent: string, changes: FileChange[], message: string): Promise<void>;
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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** A DataRepo backed by the GitHub REST API. */
export function githubRepo(env: GitHubEnv, fetcher: typeof fetch = fetch): DataRepo & PinnedRepo {
  const base = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const branch = env.GITHUB_BRANCH || "main";

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

  const contents = (path: string) =>
    `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;

  const head = async () => (await call<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;

  async function commitOnce(changes: FileChange[], message: string, on?: string): Promise<void> {
    const parentSha = on ?? (await head());
    const parent = await call<{ tree: { sha: string } }>("GET", `/git/commits/${parentSha}`);
    const tree = await call<{ sha: string }>("POST", "/git/trees", {
      base_tree: parent.tree.sha,
      tree: changes.map((change) =>
        change.content === null
          ? { path: change.path, mode: "100644", type: "blob", sha: null }
          : { path: change.path, mode: "100644", type: "blob", content: `${JSON.stringify(change.content, null, 2)}\n` },
      ),
    });
    const commit = await call<{ sha: string }>("POST", "/git/commits", {
      message,
      tree: tree.sha,
      parents: [parentSha],
    });
    await call("PATCH", `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  }

  return {
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
    async read<T>(path: string) {
      try {
        const file = await call<{ content?: string }>("GET", contents(path));
        return file.content ? (JSON.parse(decodeUtf8Base64(file.content)) as T) : null;
      } catch (err) {
        if (err instanceof RepoError && err.status === 404) return null;
        throw err;
      }
    },
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
      if (changes.length > 0) await commitOnce(changes, message, parent);
    },
    async commit(changes, message) {
      if (changes.length === 0) return;
      try {
        await commitOnce(changes, message);
      } catch (err) {
        // Someone else pushed between reading the branch and moving it: try once more on top.
        if (err instanceof RepoError && err.status === 422) await commitOnce(changes, message);
        else throw err;
      }
    },
  };
}
