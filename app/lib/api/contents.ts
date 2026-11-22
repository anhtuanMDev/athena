import { STATUS, statusOf } from "./http";

import type { Env } from "./env";
import type { Octokit } from "@octokit/rest";

// A file of the data branch through GitHub's contents API, as the read routes ask for it.

/** A file's contents as GitHub's contents API gives them: base64 text and its blob sha. */
export interface ContentFile {
  content: string;
  sha: string;
}

/** What the contents API answers for a path: a file, a folder's entries, or something else. */
export async function readContent(octokit: Octokit, env: Env, path: string) {
  const { data } = await octokit.repos.getContent({
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    path,
    ref: env.GITHUB_BRANCH ?? "main",
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  return data;
}

/** The answer when it's a file: its content and sha. */
export function asFile(data: unknown): ContentFile | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  return "content" in data && "sha" in data ? (data as ContentFile) : null;
}

/** GitHub's "no such file": a 404 the read routes answer as no file. */
export function isNotFound(error: unknown): boolean {
  return error instanceof Error && statusOf(error) === STATUS.notFound;
}
