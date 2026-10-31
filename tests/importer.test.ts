import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CronJob } from "../app/schemas/cron";
import type { DynamicField } from "../app/schemas/dynamic-schema";
import { fetchSource, isSafeUrl } from "../app/lib/importer/fetch-source";
import { mapDocument, parseRule, slugify, toIsoDate } from "../app/lib/importer/map";
import type { DataRepo, FileChange } from "../app/lib/importer/repo";
import { dismissDraft, previewImport, publishDraft, recordProblems, runImport } from "../app/lib/importer/run";

// ─── Fixtures ──────────────────────────────────────────────────────────

const PATCH_FIELDS: DynamicField[] = [
  { key: "title", label: "Title", type: "string", required: true },
  { key: "release_date", label: "Release Date", type: "string", required: true },
  { key: "patch_type", label: "Patch Type", type: "enum", required: true, options: ["Full Patch", "Hotfix"] },
  { key: "status", label: "Status", type: "enum", required: true, options: ["Live", "PTR"] },
  { key: "affected_modes", label: "Modes", type: "list", required: false, options: ["Quick Play", "Competitive Play"] },
  { key: "summary", label: "Summary", type: "string", required: false },
  { key: "patch_notes_url", label: "URL", type: "string", required: false },
  {
    key: "general_changes",
    label: "General Changes",
    type: "object_array",
    required: false,
    subFields: [{ key: "description", label: "Description", type: "string", required: true }],
  },
];

// The shape of Blizzard's patch notes page, trimmed to what the mapping reads.
const PATCH_PAGE = `<html><body><script>var x = "<div class='PatchNotes-patch'>";</script>
<div class="PatchNotes-patch PatchNotes-live"><div class="anchor" id="patch-2026-10-20"></div>
  <div class="PatchNotes-labels"><div class="PatchNotes-date">October 20, 2026</div></div>
  <h3 class="PatchNotes-patchTitle">Overwatch Retail Patch Notes &ndash; October 20, 2026</h3>
  <div class="PatchNotes-section"><h4 class="PatchNotes-sectionTitle">Bug Fix Update</h4>
    <div class="PatchNotes-sectionDescription"><p>This is a bug fix update.
      Replay codes have been wiped.</p></div></div>
  <div class="PatchNotesGeneralUpdate-description"><ul><li>Fixed an issue with &quot;Not so Thankless&quot;.</li><li>Fixed DualSense on PC.</li></ul></div>
</div>
<div class="PatchNotes-patch PatchNotes-live"><div class="anchor" id="patch-2026-10-13"></div>
  <div class="PatchNotes-labels"><div class="PatchNotes-date">October 13, 2026</div></div>
  <h3 class="PatchNotes-patchTitle">Overwatch Retail Patch Notes &ndash; October 13, 2026</h3>
</div></body></html>`;

const htmlJob: CronJob = {
  id: "ow-patch-notes",
  name: "Patch notes",
  schema_id: "patch-base",
  category: "patch",
  api_endpoint: "https://example.com/patch-notes",
  source_format: "html",
  items_path: ".PatchNotes-patch",
  id_from: "patch_notes_url",
  max_items: 10,
  schedule: "daily",
  active: true,
  field_mappings: {
    title: ".PatchNotes-patchTitle",
    release_date: ".PatchNotes-date | date",
    patch_type: "=hotfix",
    status: "=Live",
    summary: ".PatchNotes-sectionDescription",
    patch_notes_url: ".anchor@id",
    general_changes: { each: ".PatchNotesGeneralUpdate-description li", fields: { description: "." } },
  },
};

/** A DataRepo over an in-memory file map, recording each commit. */
function memoryRepo(initial: Record<string, unknown> = {}) {
  const files: Record<string, unknown> = structuredClone(initial);
  const commits: { message: string; changes: FileChange[] }[] = [];
  const repo: DataRepo = {
    async list(dir) {
      const prefix = `${dir}/`;
      return Object.keys(files)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && p.endsWith(".json"))
        .map((p) => p.slice(prefix.length, -5));
    },
    async read<T>(path: string) {
      return path in files ? (structuredClone(files[path]) as T) : null;
    },
    async commit(changes, message) {
      commits.push({ message, changes });
      for (const change of changes) {
        if (change.content === null) delete files[change.path];
        else files[change.path] = structuredClone(change.content);
      }
    },
  };
  return { repo, files, commits };
}

/** A fetch that answers DNS-over-HTTPS with `ip` and serves `pages` by URL. */
function fakeFetch(pages: Record<string, { status?: number; body?: string; headers?: Record<string, string> }>, ip = "93.184.216.34") {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const type = url.includes("type=AAAA") ? 28 : 1;
      return Response.json({ Answer: type === 1 ? [{ type: 1, data: ip }] : [] });
    }
    const page = pages[url];
    if (!page) return new Response("missing", { status: 404 });
    return new Response(page.body ?? "", { status: page.status ?? 200, headers: page.headers });
  }) as typeof fetch;
  return { fetcher, calls };
}

const schemaFile = { id: "patch-base", name: "Patch", category: "patch", fields: PATCH_FIELDS };
const baseRepoFiles = (job: CronJob = htmlJob) => ({
  [`data/overwatch/cron_jobs/${job.id}.json`]: job,
  "data/overwatch/schemas/patch-base.json": schemaFile,
});

// ─── Rules, dates and ids ──────────────────────────────────────────────

describe("rules", () => {
  it("parses constants, attributes and transforms", () => {
    assert.deepEqual(parseRule("=Live"), { constant: "Live", path: "", transforms: [] });
    assert.deepEqual(parseRule(" a.title @ href | slug "), { path: "a.title", attr: "href", transforms: ["slug"] });
    assert.deepEqual(parseRule("time | date | upper"), { path: "time", transforms: ["date", "upper"] });
    assert.match((parseRule("x | shout") as { error: string }).error, /Unknown transform "shout"/);
  });

  it("reads dates the way sites write them", () => {
    assert.equal(toIsoDate("October 20, 2026"), "2026-10-20");
    assert.equal(toIsoDate("20 Oct 2026"), "2026-10-20");
    assert.equal(toIsoDate("Sept. 3rd, 2026"), "2026-09-03");
    assert.equal(toIsoDate("2026-10-20T08:00:00Z"), "2026-10-20");
    assert.equal(toIsoDate(1792454400), "2026-10-20");
    assert.equal(toIsoDate("soon"), undefined);
    assert.equal(toIsoDate("October 2026"), undefined);
  });

  it("makes record-safe slugs", () => {
    assert.equal(slugify("Overwatch Retail Patch Notes – October 20, 2026"), "overwatch-retail-patch-notes-october-20-2026");
    assert.equal(slugify("  Café Lúcio!! "), "cafe-lucio");
    assert.equal(slugify("x".repeat(120)).length, 80);
    assert.equal(slugify("---"), "");
  });
});

// ─── Mapping ───────────────────────────────────────────────────────────

describe("mapping HTML", () => {
  it("maps each matching block into a record, ignoring script text", () => {
    const items = mapDocument(PATCH_PAGE, htmlJob, PATCH_FIELDS);
    assert.equal(items.length, 2);
    const [first, second] = items;
    assert.equal(first.id, "patch-2026-10-20");
    assert.deepEqual(first.record, {
      id: "patch-2026-10-20",
      title: "Overwatch Retail Patch Notes – October 20, 2026",
      release_date: "2026-10-20",
      patch_type: "Hotfix",
      status: "Live",
      summary: "This is a bug fix update. Replay codes have been wiped.",
      patch_notes_url: "patch-2026-10-20",
      general_changes: [{ description: 'Fixed an issue with "Not so Thankless".' }, { description: "Fixed DualSense on PC." }],
    });
    assert.deepEqual(first.problems, []);
    assert.equal(second.record.summary, undefined);
    assert.equal(second.record.general_changes, undefined);
  });

  it("reports bad rules on the item instead of failing the whole source", () => {
    const job = { ...htmlJob, field_mappings: { ...htmlJob.field_mappings, title: "h3[", summary: "p | shout" } };
    const [item] = mapDocument(PATCH_PAGE, job, PATCH_FIELDS);
    assert.ok(item.problems.some((p) => p.startsWith('Title: Invalid CSS selector "h3["')));
    assert.ok(item.problems.some((p) => p.startsWith("Summary: Unknown transform")));
    assert.ok(item.problems.includes("Title is required."));
  });

  it("needs an item selector, and a valid one", () => {
    assert.throws(() => mapDocument(PATCH_PAGE, { ...htmlJob, items_path: "" }, PATCH_FIELDS), /need an item selector/);
    assert.throws(() => mapDocument(PATCH_PAGE, { ...htmlJob, items_path: "div[" }, PATCH_FIELDS), /Invalid CSS selector/);
  });
});

describe("mapping JSON", () => {
  const jsonJob: CronJob = {
    ...htmlJob,
    source_format: "json",
    items_path: "data.patches",
    id_from: "title",
    field_mappings: {
      title: "name",
      release_date: "published | date",
      patch_type: "kind",
      status: "=live",
      affected_modes: "modes[]",
      summary: "notes[0].text",
      general_changes: { each: "notes", fields: { description: "text" } },
    },
  };
  const body = JSON.stringify({
    data: {
      patches: [
        {
          name: "Season 20",
          published: 1792454400,
          kind: "FULL patch",
          modes: ["quick play", "Arcade", "Competitive Play"],
          notes: [{ text: "New hero" }, { text: "New map" }],
        },
        { name: "Hotfix!", published: "2026-10-21", kind: "Weekly", notes: [] },
      ],
    },
  });

  it("follows paths, picks elements and matches options loosely", () => {
    const [season, hotfix] = mapDocument(body, jsonJob, PATCH_FIELDS);
    assert.deepEqual(season.record, {
      id: "season-20",
      title: "Season 20",
      release_date: "2026-10-20",
      patch_type: "Full Patch",
      status: "Live",
      affected_modes: ["Quick Play", "Competitive Play"],
      summary: "New hero",
      general_changes: [{ description: "New hero" }, { description: "New map" }],
    });
    assert.deepEqual(season.problems, ['Modes: "Arcade" is not one of Quick Play, Competitive Play.']);
    assert.equal(hotfix.id, "hotfix");
    assert.deepEqual(hotfix.problems, [
      'Patch Type: "Weekly" is not one of Full Patch, Hotfix.',
      "Patch Type is required.",
    ]);
  });

  it("treats a single object as one item and an empty path as the whole response", () => {
    const items = mapDocument(JSON.stringify({ name: "Solo", published: "2026-01-02" }), { ...jsonJob, items_path: "" }, PATCH_FIELDS);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "solo");
  });

  it("reads keys with @ as keys, not attributes", () => {
    const job = { ...jsonJob, items_path: "", id_from: "title", field_mappings: { title: "@id", summary: "meta.@type" } };
    const [item] = mapDocument(JSON.stringify({ "@id": "Season 21", meta: { "@type": "Patch" } }), job, PATCH_FIELDS);
    assert.equal(item.id, "season-21");
    assert.equal(item.record.summary, "Patch");
    assert.deepEqual(parseRule("@id", false), { path: "@id", transforms: [] });
  });

  it("ignores prototype keys and refuses very deep paths", () => {
    const job = { ...jsonJob, items_path: "", field_mappings: { title: "__proto__.polluted", summary: "a.b.c.d.e.f.g.h.i.j.k" } };
    const [item] = mapDocument(JSON.stringify({ name: "x" }), job, PATCH_FIELDS);
    assert.equal(item.record.title, undefined);
    assert.ok(item.problems.includes("Summary: Path is too deep."));
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  it("explains unusable ids and non-JSON bodies", () => {
    const [item] = mapDocument(JSON.stringify([{ name: "!!!" }]), { ...jsonJob, items_path: "" }, PATCH_FIELDS);
    assert.equal(item.id, undefined);
    assert.ok(item.problems.includes("No record id: the id field came out empty."));
    const [noId] = mapDocument(JSON.stringify([{ name: "x" }]), { ...jsonJob, items_path: "", id_from: "" }, PATCH_FIELDS);
    assert.ok(noId.problems.includes("Pick the field the record id comes from."));
    assert.throws(() => mapDocument("<html>", jsonJob, PATCH_FIELDS), /didn't return valid JSON/);
  });

  it("coerces numbers and booleans, and reports what doesn't fit", () => {
    const fields: DynamicField[] = [
      { key: "name", label: "Name", type: "string", required: true },
      { key: "health", label: "Health", type: "number", required: false },
      { key: "armor", label: "Armor", type: "number", required: false },
      { key: "flying", label: "Flying", type: "boolean", required: false },
      { key: "kit", label: "Kit", type: "abilities", required: false },
    ];
    const job = {
      ...jsonJob,
      items_path: "",
      id_from: "name",
      field_mappings: { name: "name", health: "hp", armor: "armor_text | number", flying: "flies", kit: "kit" },
    };
    const [item] = mapDocument(
      JSON.stringify({ name: "Pharah", hp: "250", armor_text: "1,250 armor", flies: "Yes", kit: [{ name: "Jump Jet" }] }),
      job,
      fields,
    );
    assert.deepEqual(item.record, { id: "pharah", name: "Pharah", health: 250, armor: 1250, flying: true });
    assert.deepEqual(item.problems, ["Kit: abilities fields can't be imported yet."]);
    const [bad] = mapDocument(JSON.stringify({ name: "X", hp: "lots", flies: "maybe" }), job, fields);
    assert.deepEqual(bad.problems, ['Health: "lots" is not a number.', 'Flying: "maybe" is not yes or no.']);
  });
});

// ─── Fetching ──────────────────────────────────────────────────────────

describe("fetching sources", () => {
  it("only fetches public HTTPS addresses", async () => {
    const { fetcher } = fakeFetch({});
    for (const url of [
      "http://example.com/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://localhost/x",
      "https://db.internal/x",
      "https://intranet/x",
      "https://user:pw@example.com/x",
      "not a url",
    ]) {
      assert.equal(await isSafeUrl(url, fetcher), false, url);
    }
    assert.equal(await isSafeUrl("https://example.com/x", fetcher), true);
    assert.equal(await isSafeUrl("https://example.com/x", fakeFetch({}, "10.0.0.5").fetcher), false);
    assert.equal(await isSafeUrl("https://example.com/x", fakeFetch({}, "169.254.169.254").fetcher), false);
  });

  it("refuses redirects, errors and oversized bodies", async () => {
    const { fetcher } = fakeFetch({
      "https://example.com/moved": { status: 301, headers: { Location: "https://example.com/new" } },
      "https://example.com/broken": { status: 503 },
      "https://example.com/huge": { body: "x", headers: { "Content-Length": String(6 * 1024 * 1024) } },
      "https://example.com/ok": { body: "hello" },
    });
    await assert.rejects(fetchSource("https://example.com/moved", fetcher), /redirected/);
    await assert.rejects(fetchSource("https://example.com/broken", fetcher), /answered 503/);
    await assert.rejects(fetchSource("https://example.com/huge", fetcher), /larger than 5 MB/);
    await assert.rejects(fetchSource("https://10.0.0.1/ok", fetcher), /public HTTPS address/);
    assert.equal(await fetchSource("https://example.com/ok", fetcher), "hello");
  });
});

// ─── Runs and reviews ──────────────────────────────────────────────────

describe("import runs", () => {
  const pages = { [htmlJob.api_endpoint]: { body: PATCH_PAGE } };

  it("drafts only new items, in one commit with the job's state", async () => {
    const { repo, files, commits } = memoryRepo({
      ...baseRepoFiles(),
      "data/overwatch/patches/patch-2026-10-13.json": { id: "patch-2026-10-13" },
      "data/overwatch/syncs/ow-patch-notes.json": { id: "ow-patch-notes", last_error: "old", dismissed: ["patch-2025-01-01"] },
    });
    const now = new Date("2026-11-01T00:00:00Z");
    const result = await runImport({ repo, game: "overwatch", jobId: "ow-patch-notes", fetcher: fakeFetch(pages).fetcher, now });
    assert.deepEqual(result, { found: 2, added: 1, skipped: 1 });
    assert.equal(commits.length, 1);
    const draft = files["data/overwatch/imports/ow-patch-notes/patch-2026-10-20.json"] as { record: { title: string }; source: unknown };
    assert.equal(draft.record.title, "Overwatch Retail Patch Notes – October 20, 2026");
    assert.deepEqual(draft.source, { job: "ow-patch-notes", url: htmlJob.api_endpoint, fetched_at: now.toISOString() });
    assert.deepEqual(files["data/overwatch/syncs/ow-patch-notes.json"], {
      id: "ow-patch-notes",
      dismissed: ["patch-2025-01-01"],
      last_sync: now.toISOString(),
      last_sync_attempt: now.toISOString(),
      last_result: { found: 2, added: 1, skipped: 1 },
    });
    // Nothing went live.
    assert.equal(files["data/overwatch/patches/patch-2026-10-20.json"], undefined);

    // A second run finds the draft and adds nothing.
    const again = await runImport({ repo, game: "overwatch", jobId: "ow-patch-notes", fetcher: fakeFetch(pages).fetcher, now });
    assert.deepEqual(again, { found: 2, added: 0, skipped: 2 });
    assert.equal(commits[1].changes.length, 1);
  });

  it("caps new drafts per run and works for jobs saved before the new settings", async () => {
    const legacy = { ...htmlJob } as Partial<CronJob>;
    delete legacy.max_items;
    const { repo } = memoryRepo(baseRepoFiles({ ...(legacy as CronJob), max_items: 1 }));
    const result = await runImport({ repo, game: "overwatch", jobId: "ow-patch-notes", fetcher: fakeFetch(pages).fetcher });
    assert.deepEqual(result, { found: 2, added: 1, skipped: 1 });

    const old = { id: "old-job", name: "Old", schema_id: "patch-base", category: "patch", api_endpoint: "https://example.com/api", schedule: "daily", active: true };
    const { repo: oldRepo } = memoryRepo({ ...baseRepoFiles(), "data/overwatch/cron_jobs/old-job.json": old });
    const jsonPages = { "https://example.com/api": { body: JSON.stringify([{ name: "x" }]) } };
    const preview = await previewImport({ repo: oldRepo, game: "overwatch", job: old as CronJob, fetcher: fakeFetch(jsonPages).fetcher });
    assert.equal(preview.total, 1);
    assert.equal(preview.items[0].status, "invalid");
  });

  it("records a failed run without losing dismissed ids", async () => {
    const { repo, files, commits } = memoryRepo({
      ...baseRepoFiles(),
      "data/overwatch/syncs/ow-patch-notes.json": { id: "ow-patch-notes", dismissed: ["a"], last_sync: "2026-10-01T00:00:00.000Z" },
    });
    const broken = fakeFetch({ [htmlJob.api_endpoint]: { status: 500 } }).fetcher;
    await assert.rejects(runImport({ repo, game: "overwatch", jobId: "ow-patch-notes", fetcher: broken }), /answered 500/);
    const state = files["data/overwatch/syncs/ow-patch-notes.json"] as Record<string, unknown>;
    assert.equal(state.last_error, "The source answered 500.");
    assert.deepEqual(state.dismissed, ["a"]);
    assert.equal(state.last_sync, "2026-10-01T00:00:00.000Z");
    assert.equal(commits.length, 1);
  });

  it("rejects unknown jobs, bad ids and non-content categories", async () => {
    const { repo } = memoryRepo(baseRepoFiles());
    await assert.rejects(runImport({ repo, game: "overwatch", jobId: "nope" }), { status: 404 });
    await assert.rejects(runImport({ repo, game: "../etc", jobId: "ow-patch-notes" }), /Invalid game/);
    const { repo: jobRepo } = memoryRepo({
      ...baseRepoFiles(),
      "data/overwatch/schemas/patch-base.json": { ...schemaFile, category: "cron_job" },
    });
    await assert.rejects(
      previewImport({ repo: jobRepo, game: "overwatch", job: htmlJob, fetcher: fakeFetch(pages).fetcher }),
      /can't be imported/,
    );
  });

  it("previews statuses without writing", async () => {
    const { repo, commits } = memoryRepo({
      ...baseRepoFiles(),
      "data/overwatch/imports/ow-patch-notes/patch-2026-10-20.json": { record: {} },
      "data/overwatch/syncs/ow-patch-notes.json": { id: "ow-patch-notes", dismissed: ["patch-2026-10-13"] },
    });
    const { items, total } = await previewImport({ repo, game: "overwatch", job: htmlJob, fetcher: fakeFetch(pages).fetcher });
    assert.equal(total, 2);
    assert.deepEqual(items.map((i) => i.status), ["draft", "dismissed"]);
    assert.equal(commits.length, 0);
  });
});

describe("reviewing drafts", () => {
  const draftPath = "data/overwatch/imports/ow-patch-notes/patch-2026-10-20.json";
  const record = {
    id: "patch-2026-10-20",
    title: "Patch",
    release_date: "2026-10-20",
    patch_type: "Hotfix",
    status: "Live",
    general_changes: [{ description: "Fixed" }],
  };

  it("publishes a reviewed draft and drops it in one commit", async () => {
    const { repo, files, commits } = memoryRepo({ ...baseRepoFiles(), [draftPath]: { record } });
    const path = await publishDraft(repo, "overwatch", "ow-patch-notes", record);
    assert.equal(path, "data/overwatch/patches/patch-2026-10-20.json");
    assert.deepEqual(files[path], record);
    assert.equal(files[draftPath], undefined);
    assert.equal(commits.length, 1);
  });

  it("won't publish a record that breaks the schema or already exists", async () => {
    const { repo, commits } = memoryRepo({
      ...baseRepoFiles(),
      [draftPath]: { record },
      "data/overwatch/patches/taken.json": { id: "taken" },
    });
    await assert.rejects(publishDraft(repo, "overwatch", "ow-patch-notes", { ...record, status: "Soon", extra: 1 }), (err: Error) => {
      assert.match(err.message, /"extra" is not a field/);
      assert.match(err.message, /Status must be one of Live, PTR/);
      return true;
    });
    await assert.rejects(publishDraft(repo, "overwatch", "ow-patch-notes", { ...record, id: "taken" }), { status: 409 });
    await assert.rejects(publishDraft(repo, "overwatch", "ow-patch-notes", { ...record, id: "../x" }), /Invalid record id/);
    assert.equal(commits.length, 0);
  });

  it("checks types, required fields and nested entries", () => {
    assert.deepEqual(recordProblems(PATCH_FIELDS, record), []);
    assert.deepEqual(
      recordProblems(PATCH_FIELDS, { ...record, title: 3, affected_modes: ["Arcade"], general_changes: [{}] }),
      ["Title must be text.", "Modes has a value that isn't one of Quick Play, Competitive Play.", "General Changes: Description is required."],
    );
    assert.deepEqual(recordProblems(PATCH_FIELDS, { id: "x" }).slice(0, 2), ["Title is required.", "Release Date is required."]);
  });

  it("dismisses a draft for good", async () => {
    const { repo, files, commits } = memoryRepo({
      ...baseRepoFiles(),
      [draftPath]: { record },
      "data/overwatch/syncs/ow-patch-notes.json": { id: "ow-patch-notes", last_sync: "t", dismissed: ["a", "patch-2026-10-20"] },
    });
    await dismissDraft(repo, "overwatch", "ow-patch-notes", "patch-2026-10-20");
    assert.equal(files[draftPath], undefined);
    assert.deepEqual(files["data/overwatch/syncs/ow-patch-notes.json"], {
      id: "ow-patch-notes",
      last_sync: "t",
      dismissed: ["a", "patch-2026-10-20"],
    });
    assert.equal(commits.length, 1);
    const run = await runImport({ repo, game: "overwatch", jobId: "ow-patch-notes", fetcher: fakeFetch({ [htmlJob.api_endpoint]: { body: PATCH_PAGE } }).fetcher });
    assert.equal(run.added, 1); // the 13th; the dismissed 20th stays out
    assert.ok(files["data/overwatch/imports/ow-patch-notes/patch-2026-10-13.json"]);
  });
});
