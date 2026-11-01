/**
 * Reading the data repository through GitHub's GraphQL API: one request for a
 * whole folder, or several, with every file's text. The REST contents API
 * takes one request per file, and a Function on the Workers Free plan may make
 * 50, so folders of more files came back with records left out.
 *
 * GitHub's limits (docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api):
 * cost and node limits count connections, which these queries have none of,
 * so each costs 1 point of 5,000 an hour; a request may run 10 seconds. The
 * response and blob sizes it allows aren't documented: a blob GitHub cuts
 * short says so (isTruncated), and is read through REST instead.
 *
 * Whether the server's token may use GraphQL isn't known in advance (it
 * depends on its type), so every failure is a GraphqlUnavailable, and the
 * readers then use REST as before.
 */

export interface GraphqlTarget {
  token: string;
  owner: string;
  repo: string;
  fetcher?: typeof fetch;
}

/** GraphQL couldn't answer. `reason` says how, in words safe to log: never GitHub's own message, which can quote the request. */
export class GraphqlUnavailable extends Error {
  name = "GraphqlUnavailable";
  readonly reason: string;
  constructor(reason: string) {
    super(`GitHub GraphQL unavailable (${reason})`);
    this.reason = reason;
  }
}

/** A file as GraphQL describes it. */
export interface GraphqlBlob {
  oid: string;
  byteSize: number;
  isBinary: boolean | null;
  isTruncated: boolean;
  text: string | null;
}

/** What GraphQL found at a path: a folder's entries, a file, something else (a submodule), or nothing. */
export type GraphqlObject =
  | { kind: "tree"; entries: { name: string; type: string; mode: number; blob: GraphqlBlob | null }[] }
  | { kind: "blob"; blob: GraphqlBlob }
  | { kind: "other" }
  | null;

const ENDPOINT = "https://api.github.com/graphql";
const OBJECT = `fragment Text on Blob { oid byteSize isBinary isTruncated text }
fragment Item on GitObject {
  ... on Blob { ...Text }
  ... on Tree { entries { name type mode object { ...Text } } }
}`;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const malformed = () => new GraphqlUnavailable("malformed response");

/** The repository object of a query's answer; anything but a clean answer is a GraphqlUnavailable. */
async function query(target: GraphqlTarget, operationName: string, text: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await (target.fetcher ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "User-Agent": "athena-admin",
      },
      body: JSON.stringify({ operationName, query: text, variables: { owner: target.owner, name: target.repo, ...variables } }),
    });
  } catch {
    throw new GraphqlUnavailable("network error");
  }
  if (!response.ok) throw new GraphqlUnavailable(`HTTP ${response.status}`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!isObject(body)) throw malformed();
  // Any error makes the whole answer untrusted, even with data: a field it
  // couldn't read comes back null, which would pass for a missing folder.
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const types = [...new Set(body.errors.map((e) => (isObject(e) && typeof e.type === "string" && /^[A-Z_]{1,40}$/.test(e.type) ? e.type : "unknown")))];
    throw new GraphqlUnavailable(`errors: ${types.join(", ")}`);
  }
  const repository = isObject(body.data) ? body.data.repository : undefined;
  if (!isObject(repository)) throw malformed();
  return repository;
}

function blobOf(value: unknown): GraphqlBlob {
  if (
    !isObject(value) ||
    typeof value.oid !== "string" ||
    typeof value.byteSize !== "number" ||
    typeof value.isTruncated !== "boolean" ||
    !(typeof value.text === "string" || value.text === null) ||
    !(typeof value.isBinary === "boolean" || value.isBinary === null)
  ) {
    throw malformed();
  }
  return { oid: value.oid, byteSize: value.byteSize, isBinary: value.isBinary, isTruncated: value.isTruncated, text: value.text };
}

function objectOf(value: unknown): GraphqlObject {
  if (value === null) return null;
  if (!isObject(value)) throw malformed();
  if ("entries" in value) {
    if (!Array.isArray(value.entries)) throw malformed();
    return {
      kind: "tree",
      entries: value.entries.map((entry) => {
        if (!isObject(entry) || typeof entry.name !== "string" || typeof entry.type !== "string" || typeof entry.mode !== "number") throw malformed();
        return { name: entry.name, type: entry.type, mode: entry.mode, blob: entry.type === "blob" ? blobOf(entry.object) : null };
      }),
    };
  }
  if ("oid" in value) return { kind: "blob", blob: blobOf(value) };
  return { kind: "other" };
}

/**
 * What is at each of `paths` on `branch`, in one request. Paths go in as
 * variables ("main:data/overwatch/news"), never into the query's text.
 */
export async function readObjects(target: GraphqlTarget, branch: string, paths: string[]): Promise<GraphqlObject[]> {
  if (paths.length === 0) return [];
  const names = paths.map((_, i) => `p${i}`);
  const text = `query AthenaRead($owner: String!, $name: String!, ${names.map((n) => `$${n}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
${names.map((n) => `    ${n}: object(expression: $${n}) { ...Item }`).join("\n")}
  }
}
${OBJECT}`;
  const repository = await query(target, "AthenaRead", text, Object.fromEntries(paths.map((path, i) => [names[i], `${branch}:${path}`])));
  return names.map((n) => objectOf(repository[n] ?? null));
}

/** Whether GraphQL answers with the server's token: what /api/github/status reports. */
export async function graphqlStatus(target: GraphqlTarget): Promise<boolean> {
  try {
    const repository = await query(target, "AthenaStatus", "query AthenaStatus($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }", {});
    return typeof repository.id === "string";
  } catch {
    return false;
  }
}

/** Git's mode for a symlink: REST lists those as "symlink", not as files. */
export const SYMLINK_MODE = 0o120000;

/**
 * A blob's text as REST would read it, or undefined when it must be read
 * through REST: cut short, binary, of another size than GitHub says, or
 * holding U+FFFD (old files saved as Latin-1 decode their own way, see
 * utf8-base64.ts). A byte-order mark is dropped, as REST's decoding drops it.
 */
export function usableText(blob: GraphqlBlob | null): string | undefined {
  if (!blob || blob.isTruncated || blob.isBinary || blob.text === null) return undefined;
  if (new TextEncoder().encode(blob.text).length !== blob.byteSize || blob.text.includes("�")) return undefined;
  return blob.text.replace(/^﻿/, "");
}
