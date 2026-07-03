import { Octokit } from "@octokit/rest";
import { requireEnv, getEnv } from "~/lib/env.server";

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!_octokit) {
    _octokit = new Octokit({ auth: requireEnv("GITHUB_TOKEN") });
  }
  return _octokit;
}

function getConfig() {
  return {
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    branch: getEnv("GITHUB_BRANCH") ?? "main",
  };
}

export interface GitHubFile<T = unknown> {
  sha: string;
  content: T;
}

export async function getFile<T = unknown>(path: string): Promise<GitHubFile<T> | null> {
  const octokit = getOctokit();
  const { owner, repo, branch } = getConfig();
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if ("content" in data && "sha" in data) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return { sha: data.sha, content: JSON.parse(decoded) as T };
    }
    return null;
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  const file = await getFile(path);
  return file !== null;
}

export async function createFile(path: string, content: unknown, message?: string): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo, branch } = getConfig();
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: message ?? `Add ${path}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
    branch,
  });
}

export class ConflictError extends Error {
  path: string;
  constructor(path: string) {
    super(`Conflict on ${path}: the file was modified since you loaded it. Please refresh and re-apply your changes.`);
    this.name = "ConflictError";
    this.path = path;
  }
}

export async function updateFile(path: string, content: unknown, sha: string, message?: string): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo, branch } = getConfig();
  try {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: message ?? `Update ${path}`,
      content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
      sha,
      branch,
    });
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 409) {
      throw new ConflictError(path);
    }
    throw err;
  }
}

export async function deleteFile(path: string, sha: string, message?: string): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo, branch } = getConfig();
  try {
    await octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message: message ?? `Delete ${path}`,
      sha,
      branch,
    });
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 409) {
      throw new ConflictError(path);
    }
    throw err;
  }
}

export function isConflictError(err: unknown): err is ConflictError {
  return err instanceof ConflictError;
}

export function conflictResponse() {
  return { errors: { _form: ["Conflict: file was modified since loading. Refresh and re-apply."] } };
}

export async function listDirectory(game: string, subpath: string): Promise<string[]> {
  const octokit = getOctokit();
  const { owner, repo, branch } = getConfig();
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: `data/${game}/${subpath}`,
      ref: branch,
    });
    if (Array.isArray(data)) {
      return data
        .filter((entry) => entry.type === "file" && entry.name.endsWith(".json"))
        .map((entry) => entry.name.replace(".json", ""));
    }
    return [];
  } catch {
    return [];
  }
}

export async function listGames(): Promise<Array<{ slug: string; name: string; developer?: string; active: boolean; icon?: string }>> {
  const file = await getFile<{ games: Array<{ slug: string; name: string; developer?: string; active: boolean; icon?: string }> }>("data/_meta/games.json");
  if (!file) {
    console.error("listGames: data/_meta/games.json not found — check GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH env vars and that the file exists in the target repo.");
    return [];
  }
  return file.content.games ?? [];
}

export async function getFileSha(path: string): Promise<string | null> {
  const file = await getFile(path);
  return file?.sha ?? null;
}
