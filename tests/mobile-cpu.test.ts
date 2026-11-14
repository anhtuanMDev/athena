import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { onRequest as mobileData } from "../functions/mobile/data";
import { filledHeroes } from "./fixtures/filled-heroes";

// The CPU a cold /mobile/data build costs, held to a budget. On the Workers
// Free plan a Function gets 10 ms of CPU, and a build killed for going over
// caches nothing: the folder then fails on every request in that data center.
//
// Machines differ, so the budget is relative: on 80 filled-in heroes, the
// whole request may cost at most twice what parsing GitHub's answer, parsing
// each record and writing the payload cost on the same machine, measured in
// the same process (the work no build can skip). Before the R4 changes it
// cost 2.7 times that, mostly in Octokit's parse of the repo tree and in
// copying every record to version its pictures; now about 1.6 times.
//
// Each side is this thread's CPU time (not the clock, which other processes
// slow), the least of 9 runs taken in turn after 5 to warm up, each started
// on a collected heap. Run 20 times beside builds, the ratio stayed between
// 1.50 and 1.70.

const HEROES = 80;
const BUDGET = 2.0;
const RUNS = 9;

const sha = (text: string) => createHash("sha1").update(text).digest("hex");
const encoder = new TextEncoder();

/** GitHub's answers for a repo of `HEROES` filled heroes: the GraphQL read of their folder, and the recursive tree. */
function answers() {
  const { files, pictures } = filledHeroes(HEROES);
  const entries = Object.entries(files).map(([path, text]) => ({
    name: path.slice(path.lastIndexOf("/") + 1),
    type: "blob",
    mode: 33188,
    object: { oid: sha(text), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text },
  }));
  const graphql = encoder.encode(JSON.stringify({ data: { repository: { p0: { entries } } } }));
  // The tree as GitHub lists it: folders, then files, each with its URL.
  const paths = [...Object.keys(files), ...pictures.map((p) => `public/assets/${p}`)];
  const folders = new Set(paths.flatMap((p) => p.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))));
  const tree = [
    ...[...folders].map((path) => ({ path, mode: "040000", type: "tree", sha: sha(path), url: `https://api.github.com/repos/o/r/git/trees/${sha(path)}` })),
    ...paths.map((path) => ({ path, mode: "100644", type: "blob", sha: sha(`blob ${path}`), size: 20_000 + path.length, url: `https://api.github.com/repos/o/r/git/blobs/${sha(`blob ${path}`)}` })),
  ].sort((a, b) => (a.path < b.path ? -1 : 1));
  return { files, graphql, tree: encoder.encode(JSON.stringify({ sha: sha("root"), url: "https://api.github.com/repos/o/r/git/trees/root", tree, truncated: false })) };
}

/** caches.default in memory; payload entries are cleared before each run, so each is a cold build. */
function memoryCache() {
  const store = new Map<string, { body: ArrayBuffer; headers: [string, string][] }>();
  return {
    store,
    cache: {
      async match(request: Request) {
        const hit = store.get(request.url);
        return hit ? new Response(hit.body.slice(0), { headers: hit.headers }) : undefined;
      },
      async put(request: Request, response: Response) {
        store.set(request.url, { body: await response.arrayBuffer(), headers: [...response.headers] });
      },
    },
  };
}

// A collection before each timed run, so none pays for the garbage of the one before.
setFlagsFromString("--expose-gc");
const collect = runInNewContext("gc") as () => void;

const cpu = () => {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
};

describe("the CPU a cold /mobile/data build costs", () => {
  it(`stays within ${BUDGET} times the parsing it can't skip, on ${HEROES} filled-in heroes`, { skip: typeof process.threadCpuUsage !== "function" && "needs process.threadCpuUsage (Node 23.9+)" }, async (t) => {
    const { graphql, tree } = answers();
    const realFetch = globalThis.fetch;
    const realCaches = (globalThis as { caches?: unknown }).caches;
    const { store, cache } = memoryCache();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/graphql") return new Response(graphql, { headers: { "content-type": "application/json" } });
      if (url.pathname.startsWith("/repos/o/r/git/trees/")) return new Response(tree, { headers: { "content-type": "application/json" } });
      if (decodeURIComponent(url.pathname) === "/repos/o/r/contents/data/_meta/games.json") {
        return Response.json({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify({ games: [{ slug: "overwatch" }] })).toString("base64") });
      }
      if (url.pathname.startsWith("/repos/o/r/contents/")) return Response.json({ message: "Not Found" }, { status: 404 });
      throw new Error(`unexpected request to ${url.href}`);
    }) as typeof fetch;
    (globalThis as { caches?: unknown }).caches = { default: cache };
    const env = { RATE_LIMIT_KV: { async get() { return "1"; }, async put() {} }, GITHUB_TOKEN: "t", GITHUB_OWNER: "o", GITHUB_REPO: "r" };

    // The Function as a data center runs it: its game, folder and version
    // memos kept, the payload and the picture hashes not (a save of a picture
    // makes every folder cold).
    const build = async () => {
      for (const key of [...store.keys()]) if (/\/mobile\/(data|last-good|unconfirmed)\b|asset-hashes/.test(key)) store.delete(key);
      const waits: Promise<unknown>[] = [];
      const res = await mobileData({ env, request: new Request("https://athena.example/mobile/data?game=overwatch&entity=heroes"), waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await res.arrayBuffer();
      await Promise.all(waits);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("X-Incomplete"), null);
    };
    // What any build of this folder must do: parse GitHub's answer, parse each record, write the payload.
    const floor = async () => {
      const answer = JSON.parse(new TextDecoder().decode(graphql)) as { data: { repository: { p0: { entries: { object: { text: string } }[] } } } };
      const records = answer.data.repository.p0.entries.map((e) => JSON.parse(e.object.text) as unknown);
      await new Response(JSON.stringify(records)).arrayBuffer();
    };
    const timed = async (fn: () => Promise<void>) => {
      collect();
      const start = cpu();
      await fn();
      return cpu() - start;
    };

    try {
      // Warm both, so neither pays for compiling what the other doesn't.
      for (let i = 0; i < 5; i++) {
        await build();
        await floor();
      }
      const builds: number[] = [];
      const floors: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        builds.push(await timed(build));
        floors.push(await timed(floor));
      }
      const ratio = Math.min(...builds) / Math.min(...floors);
      t.diagnostic(`cold build ${Math.min(...builds).toFixed(2)} ms, parsing ${Math.min(...floors).toFixed(2)} ms: ${ratio.toFixed(2)} times`);
      assert.ok(
        ratio <= BUDGET,
        `A cold build took ${Math.min(...builds).toFixed(2)} ms of CPU, ${ratio.toFixed(2)} times the ${Math.min(...floors).toFixed(2)} ms its parsing needs (budget ${BUDGET}).`,
      );
    } finally {
      globalThis.fetch = realFetch;
      (globalThis as { caches?: unknown }).caches = realCaches;
    }
  });
});
