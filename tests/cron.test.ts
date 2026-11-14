import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import worker from "../workers/cron/src/index";

// The cron worker's scheduled runs against a GitHub of in-memory files (the REST
// contents and git data APIs, GraphQL reads), DNS over HTTPS and the jobs'
// sources, all behind one fetch. It counts every call, as Workers counts an
// invocation's subrequests, and refuses the 51st, as the Workers Free plan does.
// Its branch moves only by fast-forward, as GitHub's does, and files can be
// read at any commit it made; `before` lands another writer's commit (the
// admin's) just before a request.

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
  /** The files at each commit (c1, c2…), as reads at a commit see them. */
  const snapshots = new Map([[1, new Map(files)]]);
  const at = (ref: string) => (ref === "main" ? files : snapshots.get(Number(ref.slice(1))) ?? new Map<string, string>());
  const trees = new Map<string, { path: string; text: string | null }[]>();
  const made = new Map<string, { tree: string; parent: string; message: string }>();
  const hooks: { when: string; run: () => void }[] = [];
  const land = (changes: { path: string; text: string | null }[]) => {
    for (const change of changes) {
      if (change.text === null) files.delete(change.path);
      else files.set(change.path, change.text);
    }
    head++;
    snapshots.set(head, new Map(files));
  };
  const sha = (text: string) => createHash("sha1").update(text).digest("hex");
  const children = (dir: string, ref = "main") => {
    const names = new Map<string, "blob" | "tree">();
    for (const path of at(ref).keys()) {
      if (!path.startsWith(`${dir}/`)) continue;
      const rest = path.slice(dir.length + 1);
      names.set(rest.split("/")[0], rest.includes("/") ? "tree" : "blob");
    }
    return [...names];
  };
  const blob = (text: string) => ({ oid: sha(text), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text });
  const object = (ref: string, path: string) => {
    const there = at(ref);
    if (there.has(path)) return blob(there.get(path)!);
    const entries = children(path, ref);
    if (entries.length === 0) return null;
    return {
      entries: entries.map(([name, type]) => ({ name, type, mode: type === "tree" ? 16384 : 33188, object: type === "tree" ? {} : blob(there.get(`${path}/${name}`)!) })),
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
    const call = `${method} ${url.pathname.replace(/^\/repos\/o\/r/, "")}`;
    const hook = hooks.findIndex((h) => call.startsWith(h.when));
    if (hook >= 0) hooks.splice(hook, 1)[0].run();
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
        if (name === "commit") repository.commit = { tree: { oid: `t${value.slice(1)}` } };
        if (/^[pl]\d+$/.test(name)) repository[name] = object(value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1));
      }
      return Response.json({ data: { repository } });
    }
    const route = url.pathname.replace(/^\/repos\/o\/r/, "");
    if (method === "GET" && route.startsWith("/contents/")) {
      const path = decodeURIComponent(route.slice("/contents/".length));
      const ref = url.searchParams.get("ref") ?? "main";
      if (at(ref).has(path)) return Response.json({ type: "file", content: Buffer.from(at(ref).get(path)!).toString("base64") });
      if (options.failLists?.includes(path)) return Response.json({ message: "Server Error" }, { status: 500 });
      const entries = children(path, ref);
      if (entries.length === 0) return Response.json({ message: "Not Found" }, { status: 404 });
      return Response.json(entries.map(([name, type]) => ({ name, type: type === "tree" ? "dir" : "file" })));
    }
    if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: `c${head}` } });
    if (method === "GET" && route.startsWith("/git/commits/")) return Response.json({ tree: { sha: `t${route.slice("/git/commits/c".length)}` } });
    if (method === "POST" && route === "/git/trees") {
      // Every tree here is made on the head's (base_tree), so a commit of it only lands there.
      const id = `tree${trees.size + 1}`;
      trees.set(id, body.tree.map((t: { path: string; sha?: null; content?: string }) => ({ path: t.path, text: t.sha === null ? null : t.content! })));
      return Response.json({ sha: id });
    }
    if (method === "POST" && route === "/git/commits") {
      const id = `commit${made.size + 1}`;
      made.set(id, { tree: body.tree, parent: body.parents[0], message: body.message });
      return Response.json({ sha: id });
    }
    if (method === "PATCH" && route === "/git/refs/heads/main") {
      const commit = made.get(body.sha)!;
      if (commit.parent !== `c${head}`) return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
      commits.push({ message: commit.message, paths: trees.get(commit.tree)!.map((c) => c.path) });
      land(trees.get(commit.tree)!);
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
    /** Another writer's commit of `path` (the admin's), just before the next request that starts with `when` ("PATCH /git/refs"). */
    before: (when: string, path: string, edit: (text: string | undefined) => string) =>
      void hooks.push({ when, run: () => land([{ path, text: edit(files.get(path)) }]) }),
    reset: () => {
      used = 0;
      refused = 0;
    },
  };
}

/**
 * `daily` jobs (a number per game, or the same for each) and 2 hourly ones in
 * each of `games`, which games.json lists with any in `listed`, `inactive` ones
 * as inactive; every job finds 4 items: 1 published, 1 drafted, 1 dismissed and 1 new.
 */
function repoWith(daily: number | Record<string, number>, games = ["overwatch"], listed = games, inactive: string[] = []) {
  const files: Record<string, string> = {
    "data/_meta/games.json": JSON.stringify({ games: listed.map((slug) => ({ slug, name: slug, active: !inactive.includes(slug) })) }),
  };
  const sources: Record<string, string> = {};
  for (const game of games) {
    const count = typeof daily === "number" ? daily : daily[game];
    files[`data/${game}/schemas/news-test.json`] = JSON.stringify({ id: "news-test", name: "News", category: "news", fields: [{ key: "title", label: "Title", type: "string", required: true }] });
    for (const [n, schedule] of [...Array.from({ length: count }, (_, i) => [i + 1, "daily"] as const), [100, "hourly"] as const, [101, "hourly"] as const]) {
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

/** The daily run's log of `game` (data/{game}/syncs/_run-daily.json), or null when it wrote none. */
function runLog(world: ReturnType<typeof fakeWorld>, game = "overwatch"): { run: string; at: string; deferred: string[]; unchecked: string[] } | null {
  const text = world.files.get(`data/${game}/syncs/_run-daily.json`);
  if (text === undefined) return null;
  const log = JSON.parse(text);
  assert.equal(log.run, "daily");
  assert.ok(!Number.isNaN(Date.parse(log.at)));
  assert.ok(text.endsWith("}\n"));
  return log;
}

/**
 * What each daily job of `game` shows after a run: "deferred" or "unchecked"
 * (the run's log says so, and its state is as it was), "ran" (its new item
 * drafted, its state updated), else "lost".
 */
function outcomes(world: ReturnType<typeof fakeWorld>, daily: number, game = "overwatch", repeat = false) {
  const result: Record<"ran" | "deferred" | "unchecked" | "lost", number[]> = { ran: [], deferred: [], unchecked: [], lost: [] };
  const log = runLog(world, game);
  for (let n = 1; n <= daily; n++) {
    const state = JSON.parse(world.files.get(`data/${game}/syncs/job-${n}.json`)!);
    assert.deepEqual(state.dismissed, [`job-${n}-dismissed`], `job-${n} keeps its dismissed ids`);
    for (const skipped of ["old", "dismissed"]) assert.ok(!world.files.has(`data/${game}/imports/job-${n}/job-${n}-${skipped}.json`), `job-${n} drafted its ${skipped} item`);
    const draft = world.files.get(`data/${game}/imports/job-${n}/job-${n}-new.json`);
    const left = log?.deferred.includes(`job-${n}`) ? "deferred" : log?.unchecked.includes(`job-${n}`) ? "unchecked" : null;
    if (left) {
      assert.equal(state.last_error, undefined, `job-${n}'s state isn't where a deferral is kept`);
      result[left].push(n);
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
    assert.deepEqual(outcomes(world, 10), { ran: all(10), deferred: [], unchecked: [], lost: [] });
    // 3 GraphQL reads, each job's DNS lookups and source, and one commit of 5 requests.
    assert.equal(world.used(), 8 + 3 * 10);
    assert.equal(world.commits.length, 1);
    const [headline, , ...body] = world.commits[0].message.split("\n");
    assert.equal(headline, "Import run: 10 jobs");
    assert.deepEqual(body.sort(), all(10).map((n) => `Import 1 draft(s) from job-${n}`).sort());
    // Nothing left for later, nothing to log: the commit is what it always was.
    assert.equal(runLog(world), null);
    assert.ok(!world.commits[0].paths.some((p) => p.includes("/_run-")));
  });

  it("commits a lone job with the message it always had", async () => {
    // As in zero-backend: a second game without any folder yet.
    const { files, sources } = repoWith(1, ["overwatch"], ["overwatch", "marvel-rivals"]);
    const world = fakeWorld(files, sources, { graphql: true });
    await scheduled(world);
    assert.deepEqual(outcomes(world, 1), { ran: [1], deferred: [], unchecked: [], lost: [] });
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
    assert.deepEqual(outcomes(viaRest, 3), { ran: all(3), deferred: [], unchecked: [], lost: [] });
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
    // The log rides the run's one commit.
    assert.equal(world.commits.length, 1);
    assert.ok(world.commits[0].paths.includes("data/overwatch/syncs/_run-daily.json"));
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

  it("through REST, logs every job it leaves for later, and still runs some, with 20 due", async () => {
    // On main, recording each deferral read the job's state: from 15 due jobs none
    // ran, and from 18 some deferrals were only logged.
    const { files, sources } = repoWith(20);
    const world = fakeWorld(files, sources);
    await scheduled(world);
    const result = outcomes(world, 20);
    assert.equal(world.refused(), 0);
    assert.ok(world.used() <= LIMIT);
    assert.deepEqual(result.lost, []);
    assert.deepEqual(result.unchecked, []);
    // Through REST the run's commit reads each job's state again (2 tries, so 2
    // requests a job), so one job runs where two did before that.
    assert.ok(result.ran.length >= 1, `ran ${result.ran.length}`);
    assert.equal(result.ran.length + result.deferred.length, 20);
    assert.ok(!logs.some((l) => /not recorded/.test(l)));
  });

  it("through REST, logs the job files it had no room to read, reads them first next time, and runs one job each run", async () => {
    const { files, sources } = repoWith(40);
    const world = fakeWorld(files, sources);
    await scheduled(world, Date.UTC(2026, 10, 7));
    const first = outcomes(world, 40);
    assert.equal(world.refused(), 0);
    assert.deepEqual(first.lost, []);
    assert.ok(first.unchecked.length > 0);
    assert.equal(first.ran.length, 1);
    assert.equal(world.commits.length, 1);
    await scheduled(world, Date.UTC(2026, 10, 8));
    const second = outcomes(world, 40, "overwatch", true);
    assert.deepEqual(second.lost, []);
    // What the 7th couldn't read, the 8th read first.
    assert.deepEqual(first.unchecked.filter((n) => second.unchecked.includes(n)), []);
    assert.equal(second.ran.length, 1);
  });

  it("clears its log once nothing is left for later, and then writes none", async () => {
    const { files, sources } = repoWith(20);
    const world = fakeWorld(files, sources, { graphql: true });
    await scheduled(world, Date.UTC(2026, 10, 7));
    const first = outcomes(world, 20);
    // Fewer jobs: the 8 deferred ones and 2 others, which all fit.
    const keep = new Set([...first.deferred, ...first.ran.slice(0, 2)]);
    for (const n of all(20)) if (!keep.has(n)) world.files.delete(`data/overwatch/cron_jobs/job-${n}.json`);
    await scheduled(world, Date.UTC(2026, 10, 8));
    assert.deepEqual(runLog(world), { run: "daily", at: runLog(world)!.at, deferred: [], unchecked: [] });
    const commits = world.commits.length;
    await scheduled(world, Date.UTC(2026, 10, 9));
    assert.equal(world.commits.length, commits + 1);
    assert.ok(!world.commits.at(-1)!.paths.includes("data/overwatch/syncs/_run-daily.json"));
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

  it("runs active games' jobs first when not all fit, whatever the order games.json lists them in", async () => {
    // alpha is inactive and listed first: its jobs still run, after overwatch's.
    const { files, sources } = repoWith(10, ["alpha", "overwatch"], ["alpha", "overwatch"], ["alpha"]);
    for (const day of [7, 8, 9]) {
      const world = fakeWorld(files, sources, { graphql: true });
      await scheduled(world, Date.UTC(2026, 10, day));
      assert.equal(world.refused(), 0);
      assert.deepEqual(outcomes(world, 10, "overwatch"), { ran: all(10), deferred: [], unchecked: [], lost: [] }, `on the ${day}th`);
      const alpha = outcomes(world, 10, "alpha");
      assert.equal(alpha.ran.length, 2);
      assert.equal(alpha.deferred.length, 8);
    }
  });

  it("through REST, reads and runs active games' jobs before an inactive game's job files", async () => {
    const { files, sources } = repoWith({ alpha: 40, overwatch: 2 }, ["alpha", "overwatch"], ["alpha", "overwatch"], ["alpha"]);
    const world = fakeWorld(files, sources);
    await scheduled(world);
    assert.equal(world.refused(), 0);
    assert.deepEqual(outcomes(world, 2, "overwatch"), { ran: [1, 2], deferred: [], unchecked: [], lost: [] });
    const alpha = outcomes(world, 40, "alpha");
    assert.deepEqual(alpha.lost, []);
    assert.ok(alpha.unchecked.length > 0);
  });

  it("runs every other game's jobs when one game's can't be listed", async () => {
    const { files, sources } = repoWith(2, ["alpha", "overwatch"]);
    const world = fakeWorld(files, sources, { failLists: ["data/alpha/cron_jobs"] });
    await scheduled(world);
    assert.deepEqual(outcomes(world, 2, "overwatch"), { ran: [1, 2], deferred: [], unchecked: [], lost: [] });
    assert.ok(logs.some((l) => /alpha/.test(l)));
  });
});

describe("a scheduled run while the admin writes too", () => {
  const STATE = (n: number) => `data/overwatch/syncs/job-${n}.json`;
  const dismiss = (id: string) => (text: string | undefined) => {
    const state = JSON.parse(text!);
    return JSON.stringify({ ...state, dismissed: [...state.dismissed, id] });
  };

  it("keeps a dismissal made while the run fetches the job's source, and doesn't draft it", async () => {
    const { files, sources } = repoWith(1);
    const world = fakeWorld(files, sources, { graphql: true });
    // The reviewer dismisses the new item (from the job's preview) while the run fetches the feed.
    world.before("GET /feed.json", STATE(1), dismiss("job-1-new"));
    await scheduled(world);
    const state = JSON.parse(world.files.get(STATE(1))!);
    assert.deepEqual(state.dismissed, ["job-1-dismissed", "job-1-new"]);
    assert.ok(!world.files.has("data/overwatch/imports/job-1/job-1-new.json"));
    assert.deepEqual(state.last_result, { found: 4, added: 0, skipped: 4 });
    assert.equal(world.commits.length, 1);
  });

  for (const graphql of [true, false]) {
    it(`works its one commit out again when the admin commits first, within 50 subrequests${graphql ? "" : ", through REST"}`, async () => {
      const { files, sources } = repoWith(3);
      const world = fakeWorld(files, sources, { graphql });
      world.before("PATCH /git/refs", STATE(2), dismiss("job-2-new"));
      await scheduled(world);
      assert.equal(world.refused(), 0);
      assert.equal(world.commits.length, 1, "the run's one commit");
      const state = JSON.parse(world.files.get(STATE(2))!);
      assert.deepEqual(state.dismissed, ["job-2-dismissed", "job-2-new"]);
      assert.ok(!world.files.has("data/overwatch/imports/job-2/job-2-new.json"));
      for (const n of [1, 3]) assert.ok(world.files.has(`data/overwatch/imports/job-${n}/job-${n}-new.json`), `job-${n}`);
      // Through GraphQL: 3 reads, 3 per job, and the commit twice (5 requests each).
      if (graphql) assert.equal(world.used(), 3 + 3 * 3 + 2 * 5);
      else assert.ok(world.used() <= LIMIT);
    });
  }
});
