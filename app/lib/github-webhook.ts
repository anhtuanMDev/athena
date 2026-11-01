// GitHub push webhooks for the data repo.
//
// Edits merged on GitHub never pass through the admin's save, which is what
// bumps the mobile cache versions (see mobile-cache-version.ts). The webhook
// bumps them instead, for the payloads the pushed files feed.

import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY, mobileDataVersionKey, mobileVersionKeyForPath } from "./mobile-cache-version";
import { assertSafeGameSlug } from "./safe-path";

/** The parts of GitHub's push payload the webhook reads. */
export interface PushEvent {
  ref?: unknown;
  forced?: unknown;
  deleted?: unknown;
  repository?: { full_name?: unknown };
  commits?: unknown;
}

const SIGNATURE = /^sha256=([0-9a-f]{64})$/i;
/** GitHub lists at most this many commits in one push payload. */
const MAX_LISTED_COMMITS = 2048;

/** Whether `signature` (the X-Hub-Signature-256 header) is GitHub's HMAC of `body` under `secret`. */
export async function verifyGithubSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  const match = SIGNATURE.exec(signature ?? "");
  if (!match || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const expected = Uint8Array.from(match[1].match(/../g) ?? [], (byte) => parseInt(byte, 16));
  // subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", key, expected, encoder.encode(body));
}

/** Whether the push updated `branch` of `owner/repo` (deleting the branch doesn't count). */
export function isPushTo(push: PushEvent, owner: string, repo: string, branch: string): boolean {
  const name = push.repository?.full_name;
  return (
    typeof name === "string" &&
    name.toLowerCase() === `${owner}/${repo}`.toLowerCase() &&
    push.ref === `refs/heads/${branch}` &&
    push.deleted !== true
  );
}

/**
 * Files the push added, changed or removed, or undefined when the payload can't
 * tell: a force push can drop files that no listed commit mentions, and GitHub
 * stops listing commits past MAX_LISTED_COMMITS.
 */
export function changedPaths(push: PushEvent): string[] | undefined {
  if (push.forced === true || !Array.isArray(push.commits) || push.commits.length >= MAX_LISTED_COMMITS) return undefined;
  const paths = new Set<string>();
  for (const commit of push.commits) {
    for (const list of [commit?.added, commit?.modified, commit?.removed]) {
      if (!Array.isArray(list)) return undefined;
      for (const path of list) if (typeof path === "string") paths.add(path);
    }
  }
  return [...paths];
}

/**
 * Cache version keys to bump: those the paths feed, or, when the paths are
 * unknown, every mobile payload of `games` and their category `folders`.
 */
export function versionKeysToBump(paths: string[] | undefined, games: string[], folders: readonly string[]): string[] {
  if (paths) return [...new Set(paths.map(mobileVersionKeyForPath).filter((key) => key !== null))];
  const safeGames = games.filter((game) => {
    try {
      assertSafeGameSlug(game);
      return true;
    } catch {
      return false;
    }
  });
  return [
    MOBILE_INIT_VERSION_KEY,
    MOBILE_ASSETS_VERSION_KEY,
    ...safeGames.flatMap((game) => folders.map((folder) => mobileDataVersionKey(game, folder))),
  ];
}
