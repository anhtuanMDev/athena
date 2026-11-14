import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Octokit } from "@octokit/rest";

import { TreeReadError, octokitHeaders, readRepoTree } from "../app/lib/github-tree";
import { buildDataPayload, githubReader } from "../app/lib/mobile-payload";
import { createSessionToken } from "../app/lib/session";

// The repo tree (every picture's hash, for the payloads' ?v=) is read with
// fetch and a plain parse, not through Octokit, whose parse revives every
// value and cost several milliseconds of a Function's 10 once heroes have
// their pictures. The request must stay the one Octokit sent, and every way
// it can go wrong must end as it did.

const PICTURE = "/api/assets/overwatch/heroes/ana/portrait.webp";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const FILES: Record<string, string> = {
  "data/ow/heroes/ana.json": JSON.stringify({ id: "ana", portrait: PICTURE }),
};
const treeOf = (truncated = false) => ({
  sha: "root",
  tree: [
    { path: "public", mode: "040000", type: "tree", sha: "t1" },
    { path: "public/assets/overwatch/heroes/ana/portrait.webp", mode: "100644", type: "blob", sha: SHA, size: 10 },
    { path: "data/ow/heroes/ana.json", mode: "100644", type: "blob", sha: "b2", size: 40 },
  ],
  truncated,
});

/** An Octokit that fails any tree read: the reader must not use it for one. */
function octokitWithoutTrees() {
  const octokit = new Octokit({ auth: "test-token" });
  octokit.git.getTree = (async () => {
    throw new Error("the tree was read through Octokit");
  }) as unknown as typeof octokit.git.getTree;
  return octokit;
}

/** A GitHub answering the GraphQL folder read and the tree, with the tree's answer set per test. */
function github(tree: () => Promise<Response> | Response) {
  const requests: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/graphql")) {
      const entries = Object.entries(FILES).map(([path, text]) => ({
        name: path.split("/").pop(),
        type: "blob",
        mode: 33188,
        object: { oid: "o", byteSize: text.length, isBinary: false, isTruncated: false, text },
      }));
      return Response.json({ data: { repository: { p0: { entries } } } });
    }
    requests.push({ url, method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers)) });
    return tree();
  }) as typeof fetch;
  return { fetcher, requests };
}

const realError = console.error;
let logged: string[];
beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
});
afterEach(() => {
  console.error = realError;
});

describe("reading the repo tree for the payloads' picture versions", () => {
  it("is one request, as Octokit sent it, read without Octokit", async () => {
    const { fetcher, requests } = github(() => Response.json(treeOf()));
    const octokit = octokitWithoutTrees();
    const data = await buildDataPayload(githubReader(octokit, "o", "r", "main", { token: "test-token", fetcher }), "data/ow/heroes");
    assert.deepEqual(data, { payload: [{ id: "ana", portrait: `${PICTURE}?v=${SHA.slice(0, 12)}` }], partial: false, leftOut: 0 });
    assert.equal(requests.length, 1);
    // Octokit's URL, its token scheme, and its Accept and User-Agent; no other header.
    assert.equal(requests[0].url, "https://api.github.com/repos/o/r/git/trees/main?recursive=true");
    assert.equal(requests[0].method, "GET");
    const sent = requests[0].headers;
    assert.match(sent["user-agent"], /^octokit-rest\.js\//);
    assert.deepEqual(Object.keys(octokitHeaders(octokit)).sort(), ["accept", "user-agent"]);
    assert.deepEqual(sent, { ...octokitHeaders(octokit), authorization: "token test-token" });
  });

  it("cut short by GitHub, versions the pictures it lists, leaves nothing out and says so in the log", async () => {
    const { fetcher } = github(() => Response.json(treeOf(true)));
    const data = await buildDataPayload(githubReader(octokitWithoutTrees(), "o", "r", "main", { token: "t", fetcher }), "data/ow/heroes");
    // As before: not partial, so no X-Incomplete; the pictures it didn't list go out unversioned.
    assert.deepEqual(data, { payload: [{ id: "ana", portrait: `${PICTURE}?v=${SHA.slice(0, 12)}` }], partial: false, leftOut: 0 });
    assert.ok(logged.some((line) => line.includes("The repo tree is truncated")), logged.join("\n"));
  });

  for (const [what, tree] of [
    ["a 404", () => Response.json({ message: "Not Found" }, { status: 404 })],
    ["a 502", () => Response.json({ message: "Server Error" }, { status: 502 })],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
    ["an answer that isn't a tree", () => Response.json({ message: "weird" })],
    ["an answer that isn't JSON", () => new Response("<html>", { status: 200 })],
  ] as const) {
    it(`ends as before on ${what}: pictures unversioned, the picture versions counted as one file left out`, async () => {
      const { fetcher } = github(tree);
      const data = await buildDataPayload(githubReader(octokitWithoutTrees(), "o", "r", "main", { token: "t", fetcher }), "data/ow/heroes");
      assert.deepEqual(data, { payload: [{ id: "ana", portrait: PICTURE }], partial: true, leftOut: 1 });
      assert.ok(logged.some((line) => line.includes("Couldn't read the asset hashes")), logged.join("\n"));
    });
  }

  it("gives an error with GitHub's status, or 500 when no answer came, as Octokit's did", async () => {
    for (const [answer, status] of [
      [() => Response.json({}, { status: 404 }), 404],
      [() => Response.json({}, { status: 503 }), 503],
      [() => Promise.reject(new TypeError("fetch failed")), 500],
    ] as const) {
      const err = await readRepoTree({ token: "t", owner: "o", repo: "r", fetcher: github(answer).fetcher }, "main").catch((e: unknown) => e);
      assert.ok(err instanceof TreeReadError);
      assert.equal(err.status, status);
    }
  });

  it("names a branch or tree in the URL as Octokit encodes it", async () => {
    const { fetcher, requests } = github(() => Response.json(treeOf()));
    await readRepoTree({ token: "t", owner: "o", repo: "r", fetcher }, "feature/x y");
    assert.equal(requests[0].url, "https://api.github.com/repos/o/r/git/trees/feature%2Fx%20y?recursive=true");
  });

  it("goes through Octokit for a reader made without the token (REST reads only), as before", async () => {
    const octokit = new Octokit({ auth: "t" });
    let asked = 0;
    octokit.git.getTree = (async () => {
      asked++;
      return { data: treeOf() };
    }) as unknown as typeof octokit.git.getTree;
    const { hashes, truncated } = await githubReader(octokit, "o", "r", "main").assets();
    assert.equal(asked, 1);
    assert.deepEqual([[...hashes], truncated], [[["overwatch/heroes/ana/portrait.webp", SHA]], false]);
  });
});

const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

describe("the dashboard's record counts", () => {
  const SECRET = "test-session-secret";
  const realFetch = globalThis.fetch;
  let tree: () => Response;
  let treeRequests: { url: string; headers: Record<string, string> }[];
  beforeEach(() => {
    treeRequests = [];
    tree = () =>
      Response.json({
        tree: [
          { path: "data/overwatch/heroes/ana.json", type: "blob", sha: "a" },
          { path: "data/overwatch/heroes/baptiste.json", type: "blob", sha: "b" },
          { path: "data/overwatch/maps/busan.json", type: "blob", sha: "c" },
          { path: "public/assets/overwatch/heroes/ana/portrait.webp", type: "blob", sha: "d" },
        ],
        truncated: false,
      });
    const file = (content: unknown) => Response.json({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify(content)).toString("base64"), sha: "s" });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const path = decodeURIComponent(url.pathname);
      if (path === "/repos/o/r/contents/data/_meta/games.json") return file({ games: [{ slug: "overwatch", name: "Overwatch" }] });
      if (path.startsWith("/repos/o/r/contents/")) return Response.json({ message: "Not Found" }, { status: 404 });
      if (path === "/repos/o/r/branches/main") return Response.json({ name: "main", commit: { sha: "c1", commit: { tree: { sha: "tree1" } } } });
      if (path === "/repos/o/r/git/trees/tree1") {
        treeRequests.push({ url: url.href, headers: Object.fromEntries(new Headers(init?.headers)) });
        return tree();
      }
      throw new Error(`unexpected request to ${url.href}`);
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const dashboard = async () => {
    const response = await api({
      request: new Request("https://athena.example/api/data/dashboard", { headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } }),
      env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: "test-token", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
    });
    return (await response.json()) as { games: { slug: string; counts: Record<string, number> }[] };
  };

  it("are counted from the branch's tree, read in one request with Octokit's headers", async () => {
    const { games } = await dashboard();
    assert.deepEqual(games.map((g) => [g.slug, g.counts.heroes, g.counts.maps, g.counts.modes]), [["overwatch", 2, 1, 0]]);
    assert.equal(treeRequests.length, 1);
    assert.equal(treeRequests[0].url, "https://api.github.com/repos/o/r/git/trees/tree1?recursive=true");
    assert.equal(treeRequests[0].headers.authorization, "token test-token");
    assert.equal(treeRequests[0].headers.accept, "application/vnd.github.v3+json");
    assert.match(treeRequests[0].headers["user-agent"], /^octokit-rest\.js\//);
  });

  it("are none, as before, when the tree can't be read", async () => {
    tree = () => Response.json({ message: "Server Error" }, { status: 502 });
    console.error = () => {};
    assert.deepEqual(await dashboard(), { games: [] });
  });
});
