import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import worker from "../workers/cron/src/index";

// The cron worker's scheduled runs against a GitHub of in-memory files (the REST
// contents and git data APIs, GraphQL reads), DNS over HTTPS and the jobs'
// sources, all behind one fetch. It counts every call, as Workers counts an
// invocation's subrequests, and refuses the 51st, as the Workers Free plan does.

const LIMIT = 50;
const DAY = 86_400_000;
const DAILY = "0 0 * * *";

interface Options {
  /** GraphQL answers (else 401, as for a token that can't use it). */
  graphql?: boolean;
  /** Folders whose REST listing fails (500). */
  failLists?: string[];
}

function fakeWorld(initial: Record<string, string>, sources: Record<string, string>, options: Options = {}) {
  const files = new Map(Object.entries(initial));
  const commits: { message: string; paths: string[] }[] = [];
  let head = 1;
  let used = 0;
  let refused = 0;
  const pending = new Map<string, { path: string; text: string | null }[]>();
  const sha = (text: string) => createHash("sha1").update(text).digest("hex");
  const children = (dir: string) => {
    const names = new Map<string, "blob" | "tree">();
    for (const path of files.keys()) {
      if (!path.startsWith(`${dir}/`)) continue;
      const rest = path.slice(dir.length + 1);
      names.set(rest.split("/")[0], rest.includes("/") ? "tree" : "blob");
    }
    return [...names];
  };
  const blob = (text: string) => ({ oid: sha(text), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text });
  const object = (path: string) => {
    if (files.has(path)) return blob(files.get(path)!);
    const entries = children(path);
    if (entries.length === 0) return null;
    return {
      entries: entries.map(([name, type]) => ({ name, type, mode: type === "tree" ? 16384 : 33188, object: type === "tree" ? {} : blob(files.get(`${path}/${name}`)!) })),
    };
  };

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (used >= LIMIT) {
      refused++;
      throw new Error("Too many subrequests.");
    }
    used++;
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.hostname === "cloudflare-dns.com") {
      return Response.json({ Answer: url.searchParams.get("type") === "A" ? [{ type: 1, data: "93.184.216.34" }] : [] });
    }
    if (url.href in sources) return new Response(sources[url.href]);
    if (url.hostname !== "api.github.com") throw new Error(`unexpected request to ${url.href}`);
    if (url.pathname === "/graphql") {
      if (!options.graphql) return Response.json({ message: "Bad credentials" }, { status: 401 });
      const repository: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(body.variables as Record<string, string>)) {
        if (/^[pl]\d+$/.test(name)) repository[name] = object(value.slice(value.indexOf(":") + 1));
      }
      return Response.json({ data: { repository } });
    }
    const route = url.pathname.replace(/^\/repos\/o\/r/, "");
    if (method === "GET" && route.startsWith("/contents/")) {
      const path = decodeURIComponent(route.slice("/contents/".length));
      if (files.has(path)) return Response.json({ type: "file", content: Buffer.from(files.get(path)!).toString("base64") });
      if (options.failLists?.includes(path)) return Response.json({ message: "Server Error" }, { status: 500 });
      const entries = children(path);
      if (entries.length === 0) return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json(entries.map(([name, type]) => ({ name, type: type === "tree" ? "dir" : "file" })));
    }
    if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: `c${head}` } });
    if (method === "GET" && route.startsWith("/git/commits/")) return Response.json({ tree: { sha: `t${head}` } });
    if (method === "POST" && route === "/git/trees") {
      pending.set("tree", body.tree.map((t: { path: string; sha?: null; content?: string }) => ({ path: t.path, text: t.sha === null ? null : t.content! })));
      return Response.json({ sha: "tree" });
    }
    if (method === "POST" && route === "/git/commits") {
      commits.push({ message: body.message, paths: pending.get(body.tree)!.map((c) => c.path) });
      return Response.json({ sha: "commit" });
    }
    if (method === "PATCH" && route === "/git/refs/heads/main") {
      for (const change of pending.get("tree")!) {
        if (change.text === null) files.delete(change.path);
        else files.set(change.path, change.text);
      }
      head++;
      return Response.json({ object: { sha: `c${head}` } });
    }
    throw new Error(`unexpected ${method} ${url.href}`);
  }) as typeof fetch;

  return {
    fetcher,
    files,
    commits,
    used: () => used,
    refused: () => refused,
    reset: () => {
      used = 0;
      refused = 0;
    },
  };
}

/**
 * `daily` jobs and 2 hourly ones in each of `games`, which games.json lists with
 * any in `listed`; every job finds 4 items: 1 published, 1 drafted, 1 dismissed and 1 new.
 */
function repoWith(daily: number, games = ["overwatch"], listed = games) {
  const files: Record<string, string> = {
    "data/_meta/games.json": JSON.stringify({ games: listed.map((slug) => ({ slug, name: slug, active: true })) }),
  };
  const sources: Record<string, string> = {};
  for (const game of games) {
    files[`data/${game}/schemas/news-test.json`] = JSON.stringify({ id: "news-test", name: "News", category: "news", fields: [{ key: "title", label: "Title", type: "string", required: true }] });
    for (const [n, schedule] of [...Array.from({ length: daily }, (_, i) => [i + 1, "daily"] as const), [100, "hourly"] as const, [101, "hourly"] as const]) {
      const id = `job-${n}`;
      const url = `https://src${n}.${game}.example/feed.json`;
      files[`data/${game}/cron_jobs/${id}.json`] = JSON.stringify({
        id, name: `Job ${n}`, schema_id: "news-test", category: "news", api_endpoint: url, source_format: "json",
        items_path: "items", id_from: "title", max_items: 10, schedule, active: true, field_mappings: { title: "title" },
      });
      files[`data/${game}/news/job-${n}-old.json`] = JSON.stringify({ id: `job-${n}-old` });
      files[`data/${game}/imports/${id}/job-${n}-waiting.json`] = JSON.stringify({ record: { id: `job-${n}-waiting` } });
      files[`data/${game}/syncs/${id}.json`] = JSON.stringify({ id, dismissed: [`job-${n}-dismissed`] });
      sources[url] = JSON.stringify({ items: ["old", "waiting", "dismissed", "new"].map((w) => ({ title: `Job ${n} ${w}` })) });
    }
  }
  return { files, sources };
}

const realFetch = globalThis.fetch;
let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "warn", "error"] as const) mock.method(console, level, (...args: unknown[]) => logs.push(args.map(String).join(" ")));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
});

async function scheduled(world: ReturnType<typeof fakeWorld>, at = Date.UTC(2026, 10, 7)) {
  globalThis.fetch = world.fetcher;
  world.reset();
  const waits: Promise<unknown>[] = [];
  const env = { GITHUB_TOKEN: "test-token-not-real", GITHUB_OWNER: "o", GITHUB_REPO: "r", GITHUB_BRANCH: "main", CRON_SECRET: "s" };
  await worker.scheduled({ cron: DAILY, scheduledTime: at } as never, env, { waitUntil: (p: Promise<unknown>) => waits.push(p) } as never);
  // A run Workers stopped part way rejects; the outcome below shows what it left.
  await Promise.all(waits).catch((err: Error) => logs.push(`aborted: ${err.message}`));
}

/** What each daily job of `game` shows after a run: "deferred" (its state says so), "ran" (its new item drafted, its state updated), else "lost". */
function outcomes(world: ReturnType<typeof fakeWorld>, daily: number, game = "overwatch", repeat = false) {
  const result: Record<"ran" | "deferred" | "lost", number[]> = { ran: [], deferred: [], lost: [] };
  for (let n = 1; n <= daily; n++) {
    const state = JSON.parse(world.files.get(`data/${game}/syncs/job-${n}.json`)!);
    assert.deepEqual(state.dismissed, [`job-${n}-dismissed`], `job-${n} keeps its dismissed ids`);
    for (const skipped of ["old", "dismissed"]) assert.ok(!world.files.has(`data/${game}/imports/job-${n}/job-${n}-${skipped}.json`), `job-${n} drafted its ${skipped} item`);
    const draft = world.files.get(`data/${game}/imports/job-${n}/job-${n}-new.json`);
    if (/^Deferred: subrequest budget/.test(state.last_error ?? "")) {
      assert.ok(state.last_sync_attempt);
      result.deferred.push(n);
    } else if (draft) {
      assert.deepEqual(JSON.parse(draft).record, { id: `job-${n}-new`, title: `Job ${n} new` });
      assert.ok(draft.endsWith("}\n"));
      // Run again, a job finds its new item drafted already.
      const again = repeat && state.last_result?.added === 0;
      assert.deepEqual(state.last_result, again ? { found: 4, added: 0, skipped: 4 } : { found: 4, added: 1, skipped: 3 }, `job-${n}`);
      assert.equal(state.last_error, undefined);
      result.ran.push(n);
    } else result.lost.push(n);
  }
  for (const n of [100, 101]) assert.equal(world.files.get(`data/${game}/syncs/job-${n}.json`), JSON.stringify({ id: `job-${n}`, dismissed: [`job-${n}-dismissed`] }), "a daily run leaves hourly jobs alone");
  return result;
}
const all = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("a scheduled import run on the Workers Free plan", () => {
  it("runs 10 jobs in 8 subrequests plus 3 per job, in one commit", async () => {
    const { files, sources } = repoWith(10);
    const world = fakeWorld(files, sources, { graphql: true });
    await scheduled(world);
    assert.deepEqual(outcomes(world, 10), { ran: all(10), deferred: [], lost: [] });
    // 3 GraphQL reads, each job's DNS lookups and source, and one commit of 5 requests.
    assert.equal(world.used(), 8 + 3 * 10);
    assert.equal(world.commits.length, 1);
    const [headline, , ...body] = world.commits[0].message.split("\n");
    assert.equal(headline, "Import run: 10 jobs");
    assert.deepEqual(body.sort(), all(10).map((n) => `Import 1 draft(s) from job-${n}`).sort());
  });

  it("commits a lone job with the message it always had", async () => {
    // As in zero-backend: a second game without any folder yet.
    const { files, sources } = repoWith(1, ["overwatch"], ["overwatch", "marvel-rivals"]);
    const world = fakeWorld(files, sources, { graphql: true });
    await scheduled(world);
    assert.deepEqual(outcomes(world, 1), { ran: [1], deferred: [], lost: [] });
    assert.equal(world.used(), 11);
    assert.deepEqual(world.commits.map((c) => c.message), ["Import 1 draft(s) from job-1"]);
  });

  it("reads through REST when GraphQL can't, to the same result", async () => {
    const { files, sources } = repoWith(3);
    const viaGraphql = fakeWorld(files, sources, { graphql: true });
    const viaRest = fakeWorld(files, sources);
    await scheduled(viaGraphql);
    await scheduled(viaRest);
    const stamp = (text: string) => text.replace(/"\d{4}-\d\d-\d\dT[\d:.]+Z"/g, '"<time>"');
    assert.deepEqual(new Map([...viaRest.files].map(([p, t]) => [p, stamp(t)])), new Map([...viaGraphql.files].map(([p, t]) => [p, stamp(t)])));
    assert.deepEqual(outcomes(viaRest, 3), { ran: all(3), deferred: [], lost: [] });
    assert.ok(viaRest.used() <= LIMIT);
    assert.equal(viaRest.commits.length, 1);
  });

  it("never loses a job: of 20, those that don't fit are deferred where the admin sees it", async () => {
    const { files, sources } = repoWith(20);
    const world = fakeWorld(files, sources, { graphql: true });
    await scheduled(world);
    const result = outcomes(world, 20);
    assert.equal(world.refused(), 0);
    assert.ok(world.used() <= LIMIT);
    assert.deepEqual(result.lost, []);
    assert.equal(result.ran.length, 12);
    assert.equal(result.deferred.length, 8);
    assert.equal(logs.filter((l) => /deferred: subrequest budget/.test(l)).length, 8);
  });

  it("never loses a job through REST either, while it can record a deferral", async () => {
    const { files, sources } = repoWith(10);
    const world = fakeWorld(files, sources);
    await scheduled(world);
    const result = outcomes(world, 10);
    assert.equal(world.refused(), 0);
    assert.deepEqual(result.lost, []);
    assert.equal(result.ran.length + result.deferred.length, 10);
    assert.ok(result.ran.length >= 3);
  });

  it("runs first the jobs it deferred last time, and otherwise starts further along each run", async () => {
    const { files, sources } = repoWith(20);
    const world = fakeWorld(files, sources, { graphql: true });
    await scheduled(world, Date.UTC(2026, 10, 7));
    const first = outcomes(world, 20);
    await scheduled(world, Date.UTC(2026, 10, 8));
    const second = outcomes(world, 20, "overwatch", true);
    // Every job deferred on the 7th ran on the 8th.
    assert.deepEqual(first.deferred.filter((n) => !second.ran.includes(n)), []);
    // The same 20 jobs on another day: others are the ones left for later.
    const other = fakeWorld(files, sources, { graphql: true });
    await scheduled(other, Date.UTC(2026, 10, 8));
    assert.notDeepEqual(outcomes(other, 20).deferred, first.deferred);
  });

  it("runs every other game's jobs when one game's can't be listed", async () => {
    const { files, sources } = repoWith(2, ["alpha", "overwatch"]);
    const world = fakeWorld(files, sources, { failLists: ["data/alpha/cron_jobs"] });
    await scheduled(world);
    assert.deepEqual(outcomes(world, 2, "overwatch"), { ran: [1, 2], deferred: [], lost: [] });
    assert.ok(logs.some((l) => /alpha/.test(l)));
  });
});
