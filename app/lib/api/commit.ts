import { RepoError } from "../importer/repo";

import type { BlobChange, FileChange, PinnedRepo } from "../importer/repo";

/** Why a checked commit wasn't made: the file was created, deleted or modified since it was loaded, or the branch kept moving. */
export type CommitConflict = "exists" | "deleted" | "modified" | "moving";

/** A commit made only if `path` is still at `sha` (null: it mustn't exist yet). */
export interface CheckedCommit {
  path: string;
  sha: string | null;
  /** Other paths whose files the caller wants as they were at the commit (folders end in "/"). */
  reads: string[];
  changes: (FileChange | BlobChange)[];
  message: string;
}

/** How many times the branch may move under a commit before it's a conflict. */
const ATTEMPTS = 2;

function staleness(expected: string | null, now: string | null): CommitConflict | null {
  if (expected === null && now !== null) {
    return "exists";
  }
  if (expected !== null && now === null) {
    return "deleted";
  }
  return expected !== null && now !== expected ? "modified" : null;
}

type CheckedResult = { commit: string | null; files: Record<string, string> } | { conflict: CommitConflict };

/** One try of commitChecked, with `attempts` left after it for a branch that moves meanwhile. */
async function attemptCommit(repo: PinnedRepo, commit: CheckedCommit, attempts: number): Promise<CheckedResult> {
  const snapshot = await repo.snapshot([commit.path, ...commit.reads]);
  const conflict = staleness(commit.sha, snapshot.files[commit.path] ?? null);
  if (conflict !== null) {
    return { conflict };
  }
  try {
    return { commit: await repo.commitOn(snapshot.head, commit.changes, commit.message), files: snapshot.files };
  } catch (err) {
    // The branch moved: checked and tried again on its new head, while tries are left.
    if (!(err instanceof RepoError && err.moved)) {
      throw err;
    }
    return attempts > 0 ? attemptCommit(repo, commit, attempts - 1) : { conflict: "moving" };
  }
}

/**
 * Commits `changes` on the branch's head, if `path` is still at the sha the
 * editor loaded. A branch that moves between the check and the commit (an
 * import, another admin's save) is checked and committed on once more; a
 * second move is a conflict. Resolves to the commit (null when there was
 * nothing to commit) and the files at `path` and `reads` it was made on.
 */
export async function commitChecked(repo: PinnedRepo, commit: CheckedCommit): Promise<CheckedResult> {
  return attemptCommit(repo, commit, ATTEMPTS - 1);
}
