/**
 * The data repo's whole tree (GET /repos/{owner}/{repo}/git/trees/{tree}?recursive=true),
 * read with fetch and a plain JSON.parse instead of through Octokit.
 *
 * Octokit parses every answer with a reviver that runs on each value (it keeps
 * numbers past 2^53 exact). Once heroes have their pictures, the tree has
 * thousands of entries, and that parse cost several times a plain one: 3.75 ms
 * against 0.67 ms for 80 heroes in workerd. The /mobile/* builds and the
 * dashboard read the tree, under the Workers Free plan's 10 ms of CPU.
 *
 * The request is the one Octokit sent: the same URL, the same Authorization
 * scheme ("token …"), and its Accept and User-Agent headers, read from the
 * Octokit instance at hand. It fails as Octokit did, with an error carrying
 * the HTTP status (500 when the request never got an answer), so callers keep
 * their outcomes.
 */

/** An entry of a recursive tree, as GitHub lists it. */
export interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

export interface RepoTree {
  tree: TreeEntry[];
  /** GitHub cut the listing short (past 100,000 entries or 7 MB): some entries are missing. */
  truncated: boolean;
}

export interface TreeTarget {
  token: string;
  owner: string;
  repo: string;
  fetcher?: typeof fetch;
  /** Accept and User-Agent as Octokit sends them (octokitHeaders). */
  headers?: Record<string, string>;
}

/** A failed tree read: `status` is GitHub's, or 500 when no answer came, as Octokit's RequestError has it. */
export class TreeReadError extends Error {
  name = "TreeReadError";
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The Accept and User-Agent headers an Octokit instance sends with every request. */
export function octokitHeaders(octokit: { request: { endpoint: { DEFAULTS: { headers: Record<string, unknown> } } } }): Record<string, string> {
  const defaults = octokit.request.endpoint.DEFAULTS.headers;
  const headers: Record<string, string> = {};
  for (const name of ["accept", "user-agent"]) {
    const value = defaults[name];
    if (typeof value === "string") headers[name] = value;
  }
  return headers;
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** The tree `treeSha` (a sha or a branch name) lists, every level of it. */
export async function readRepoTree(target: TreeTarget, treeSha: string): Promise<RepoTree> {
  const url = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=true`;
  let response: Response;
  try {
    response = await (target.fetcher ?? fetch)(url, {
      method: "GET",
      headers: {
        accept: "application/vnd.github.v3+json",
        "user-agent": "athena-admin",
        ...target.headers,
        authorization: `token ${target.token}`,
      },
    });
  } catch (err) {
    throw new TreeReadError(err instanceof Error ? err.message : String(err), 500);
  }
  if (!response.ok) throw new TreeReadError(`GitHub answered ${response.status} for the repo tree`, response.status);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isObject(body) || !Array.isArray(body.tree)) throw new TreeReadError("The repo tree's answer isn't a tree", response.status);
  return { tree: body.tree as TreeEntry[], truncated: body.truncated === true };
}
