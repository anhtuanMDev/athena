import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CATEGORIES_PATH,
  DEFAULT_CATEGORIES,
  MAX_CATEGORIES,
  isCategoryFolderFormat,
  normalizeCategories,
  parseCategories,
  readCategories,
  type Category,
} from "../app/lib/categories";
import { versionKeysToBump } from "../app/lib/github-webhook";
import type { DataRepo, FileChange } from "../app/lib/importer/repo";
import { publishDraft, recordFolder } from "../app/lib/importer/run";
import { MOBILE_INIT_VERSION_KEY, mobileDataVersionKey, mobileVersionKeyForPath } from "../app/lib/mobile-cache-version";
import { buildInitPayload, servedFolders, type RepoReader } from "../app/lib/mobile-payload";
import { dataWriteProblems, validateDataFile, validateSchemaFile } from "../app/lib/screen-policy";
import { encodeUtf8Base64 } from "../app/lib/utf8-base64";
import { onRequest as mobileData } from "../functions/mobile/data";

const REAL_FILE = readFileSync(new URL("./fixtures/categories.json", import.meta.url), "utf8");
const EVENTS: Category = { category: "event", folder: "events", label: "Events", singular: "Event", icon: "calendar", favoritable: false };
const withEvents = { categories: [...DEFAULT_CATEGORIES, EVENTS] };
const entry = (change: Partial<Category> & Record<string, unknown>) => ({ ...EVENTS, ...change });

describe("categories.json", () => {
  it("as in the data repo: the built-in six, with nothing to fix", () => {
    assert.deepEqual(normalizeCategories(JSON.parse(REAL_FILE)), { categories: DEFAULT_CATEGORIES, problems: [] });
  });

  it("falls back to the built-in categories when missing, not JSON, or with none usable", () => {
    assert.deepEqual(parseCategories(null), DEFAULT_CATEGORIES);
    assert.deepEqual(parseCategories("{ nope"), DEFAULT_CATEGORIES);
    for (const raw of [{}, { categories: "x" }, { categories: [] }, { categories: [{ category: "x", folder: "_meta" }] }, [], null]) {
      const { categories, problems } = normalizeCategories(raw);
      assert.deepEqual(categories, DEFAULT_CATEGORIES, JSON.stringify(raw));
      assert.ok(problems.length > 0);
    }
  });

  it("never lets a category name an internal folder or leave the game's folder, whatever the file says", () => {
    const folders = ["_meta", "cron_jobs", "../x", "a/b", "a.b", "schemas", "screens", "imports", "syncs", "enums", "assets", "navigation", "cron", "raw", "Events", "", "x".repeat(41)];
    for (const folder of folders) {
      const { categories, problems } = normalizeCategories({ categories: [...DEFAULT_CATEGORIES, entry({ folder })] });
      assert.deepEqual(categories, DEFAULT_CATEGORIES, folder);
      assert.equal(problems.length, 1, folder);
      assert.equal(isCategoryFolderFormat(folder), false, folder);
    }
    for (const category of ["cron_job", "Event", "1x", "a-b", ""]) {
      assert.deepEqual(normalizeCategories({ categories: [...DEFAULT_CATEGORIES, entry({ category })] }).categories, DEFAULT_CATEGORIES, category);
    }
    assert.equal(isCategoryFolderFormat("events"), true);
  });

  it("keeps the folders of the built-in editors, and drops duplicates", () => {
    const tries = [
      entry({ category: "hero", folder: "champions" }),
      entry({ folder: "heroes" }),
      entry({ category: "map" }),
      entry({ folder: "news" }),
    ];
    for (const tried of tries) {
      const { categories, problems } = normalizeCategories({ categories: [...DEFAULT_CATEGORIES, tried] });
      assert.deepEqual(categories, DEFAULT_CATEGORIES, JSON.stringify(tried));
      assert.equal(problems.length, 1);
    }
  });

  it("caps the list and labels, and fills in or reports the rest", () => {
    const many = Array.from({ length: MAX_CATEGORIES + 3 }, (_, i) => entry({ category: `c${i}`, folder: `f${i}` }));
    const capped = normalizeCategories({ categories: many });
    assert.equal(capped.categories.length, MAX_CATEGORIES);
    assert.equal(capped.problems.length, 3);
    assert.equal(normalizeCategories({ categories: [entry({ label: "x".repeat(41) })] }).problems.length, 2); // and none left
    assert.equal(normalizeCategories({ categories: [entry({ label: "  " })] }).problems.length, 2);

    const lenient = normalizeCategories({ categories: [{ category: "event", folder: "events", label: " Events ", icon: "skull", favoritable: "yes" }] });
    assert.deepEqual(lenient.categories, [{ category: "event", folder: "events", label: "Events", singular: "Events", icon: "list", favoritable: false }]);
    assert.equal(lenient.problems.length, 2);
  });

  it("is read as the built-in categories when the repo can't serve it", async () => {
    const missing = Object.assign(new Error("Not Found"), { status: 404 });
    assert.deepEqual(await readCategories(async () => { throw missing; }), DEFAULT_CATEGORIES);
    const logError = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await readCategories(async () => { throw new Error("rate limited"); }), DEFAULT_CATEGORIES);
    } finally {
      console.error = logError;
    }
    assert.deepEqual(await readCategories(async (path) => (path === CATEGORIES_PATH ? JSON.stringify(withEvents) : "")), [...DEFAULT_CATEGORIES, EVENTS]);
  });
});

describe("writing categories.json and schemas", () => {
  it("refuses a categories.json the normalizer would change, as JSON or base64", () => {
    assert.deepEqual(validateDataFile(CATEGORIES_PATH, withEvents), []);
    const tampered = { categories: [...DEFAULT_CATEGORIES, entry({ folder: "schemas" })] };
    assert.equal(validateDataFile(CATEGORIES_PATH, tampered).length, 1);
    assert.equal(dataWriteProblems(CATEGORIES_PATH, encodeUtf8Base64(JSON.stringify(tampered)), true).length, 1);
  });

  it("lets schema references read from configured categories only", () => {
    const schema = { id: "x", fields: [{ key: "event", type: "reference", referenceApiEndpoint: "/api/{game}/events" }] };
    assert.equal(validateSchemaFile(schema).length, 1);
    assert.deepEqual(validateSchemaFile(schema, withEvents.categories), []);
    assert.deepEqual(dataWriteProblems("data/overwatch/schemas/x.json", schema, false, withEvents.categories), []);
  });
});

describe("cache versions and the webhook", () => {
  it("send any record folder to its own version and categories.json to init's", () => {
    assert.equal(mobileVersionKeyForPath(CATEGORIES_PATH), MOBILE_INIT_VERSION_KEY);
    assert.equal(mobileVersionKeyForPath("data/overwatch/events/lan-2026.json"), mobileDataVersionKey("overwatch", "events"));
    assert.equal(mobileVersionKeyForPath("data/overwatch/cron_jobs/x.json"), null);
    assert.equal(mobileVersionKeyForPath("data/overwatch/imports/job.json"), null);
  });

  it("refresh every configured folder when a push doesn't list its files", () => {
    const keys = versionKeysToBump(undefined, ["overwatch"], ["heroes", "events"]);
    assert.ok(keys.includes(mobileDataVersionKey("overwatch", "events")));
    assert.ok(!keys.includes(mobileDataVersionKey("overwatch", "maps")));
  });
});

describe("the importer", () => {
  function memoryRepo(initial: Record<string, unknown>) {
    const files: Record<string, unknown> = structuredClone(initial);
    const repo: DataRepo = {
      async list(dir) {
        return Object.keys(files).filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1, -5));
      },
      async read<T>(path: string) {
        return path in files ? (structuredClone(files[path]) as T) : null;
      },
      async commit(changes: FileChange[]) {
        for (const change of changes) {
          if (change.content === null) delete files[change.path];
          else files[change.path] = change.content;
        }
      },
    };
    return { repo, files };
  }

  it("publishes into a configured category's folder, and refuses others", async () => {
    assert.equal(recordFolder("event", withEvents.categories), "events");
    assert.throws(() => recordFolder("event"), /can't be imported/);
    assert.throws(() => recordFolder("cron_job", withEvents.categories), /can't be imported/);

    const { repo, files } = memoryRepo({
      [CATEGORIES_PATH]: withEvents,
      "data/overwatch/cron_jobs/lan-events.json": {
        id: "lan-events",
        name: "LAN events",
        schema_id: "event-base",
        category: "event",
        api_endpoint: "https://example.com/events",
        source_format: "html",
        items_path: ".event",
        id_from: "title",
        max_items: 10,
        schedule: "daily",
        active: true,
        field_mappings: { title: ".title" },
      },
      "data/overwatch/schemas/event-base.json": { id: "event-base", name: "Event", category: "event", fields: [{ key: "title", label: "Title", type: "string", required: true }] },
    });
    const path = await publishDraft(repo, "overwatch", "lan-events", { id: "lan-2026", title: "LAN 2026" });
    assert.equal(path, "data/overwatch/events/lan-2026.json");
    assert.deepEqual(files[path], { id: "lan-2026", title: "LAN 2026", schema_id: "event-base" });
  });
});

describe("mobile payloads", () => {
  const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });
  const reader = (files: Record<string, string>): RepoReader => ({
    async list(dir) {
      const paths = Object.keys(files).filter((p) => p.startsWith(`${dir}/`));
      if (paths.length === 0) throw notFound();
      return paths;
    },
    async read(path) {
      if (!(path in files)) throw notFound();
      return files[path];
    },
    async assets() {
      return new Map();
    },
  });
  const games = JSON.stringify({ games: [{ slug: "overwatch", active: true }] });

  it("give the app the configured categories in init, or the built-in ones", async () => {
    const tampered = { categories: [...withEvents.categories, entry({ category: "meta", folder: "_meta" })] };
    const init = await buildInitPayload(reader({ "data/_meta/games.json": games, [CATEGORIES_PATH]: JSON.stringify(tampered) }));
    assert.deepEqual(init.payload.categories, withEvents.categories);
    assert.equal(init.partial, false);

    const none = await buildInitPayload(reader({ "data/_meta/games.json": games }));
    assert.deepEqual(none.payload.categories, DEFAULT_CATEGORIES);
  });

  it("keep the served folders a minute in each data center's cache", async () => {
    let now = 0;
    const memo = new Map<string, { body: string; expires: number }>();
    const cache = {
      async match(request: Request) {
        const kept = memo.get(request.url);
        return kept && kept.expires > now ? new Response(kept.body) : undefined;
      },
      async put(request: Request, response: Response) {
        const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1]);
        memo.set(request.url, { body: await response.text(), expires: now + maxAge * 1000 });
      },
    };
    let reads = 0;
    const files = reader({ [CATEGORIES_PATH]: JSON.stringify(withEvents) });
    const counting: RepoReader = { ...files, read: (path) => (reads++, files.read(path)) };
    for (let i = 0; i < 10; i++) assert.ok((await servedFolders(cache, counting)).includes("events"));
    assert.equal(reads, 1);
    now += 60_000;
    await servedFolders(cache, counting);
    assert.equal(reads, 2);
  });
});

describe("GET /mobile/data", () => {
  // GitHub answers categories.json with `config`; KV and caches record what's asked.
  const realFetch = globalThis.fetch;
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let kvReads: string[] = [];
  let github: string[] = [];
  const kv = {
    async get(key: string) {
      kvReads.push(key);
      return null;
    },
  };
  const serve = (config: unknown) => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      github.push(String(input));
      const content = Buffer.from(JSON.stringify(config)).toString("base64");
      return new Response(JSON.stringify({ type: "file", encoding: "base64", content, path: CATEGORIES_PATH, name: "categories.json" }), {
        headers: { "Content-Type": "application/json" },
      });
    };
  };
  beforeEach(() => {
    kvReads = [];
    github = [];
    // An empty memo, and every payload already cached.
    (globalThis as { caches?: unknown }).caches = {
      default: {
        async match(request: Request) {
          return request.url.includes("/mobile/data?") ? new Response("[]") : undefined;
        },
        async put() {},
      },
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { caches?: unknown }).caches = realCaches;
  });
  const get = (entity: string) =>
    mobileData({
      env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "anhtuanMDev", GITHUB_REPO: "zero-backend" },
      request: new Request(`https://athena.example/mobile/data?game=overwatch&entity=${entity}`),
    });

  it("serves a configured category", async () => {
    serve(withEvents);
    const res = await get("events");
    assert.equal(res.status, 200);
    assert.ok(kvReads.includes(mobileDataVersionKey("overwatch", "events")));
  });

  it("refuses an unconfigured folder before any KV read, and an internal one before reaching GitHub", async () => {
    serve({ categories: DEFAULT_CATEGORIES });
    assert.equal((await get("events")).status, 400);
    assert.deepEqual(kvReads, []);
    github = [];
    for (const entity of ["schemas", "cron_jobs", "_meta", "..%2Fx"]) assert.equal((await get(entity)).status, 400, entity);
    assert.deepEqual(github, []);
    assert.deepEqual(kvReads, []);
  });
});
