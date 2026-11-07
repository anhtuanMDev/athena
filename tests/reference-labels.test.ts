import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DEFAULT_CATEGORIES } from "../app/lib/categories";
import { detailScreenFor, isReferenceField, pickerKeys, pickerOption, referenceFolder, referenceFolders, referenceLabels, referenceRecords, type ReferenceField } from "../app/lib/reference-labels";
import { screenReferenceFolders, sourceFields, type FieldOption, type ScreenFile } from "../app/lib/screen-model";

// The app's reference labels (zms src/content/model.ts: referenceFolder,
// referenceFolders, referenceLabels; the cases of its content-model tests), so
// the screen preview names a reference's record as the app does.

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/schemas/${name}.json`, import.meta.url), "utf8"));
const mode = fixture("mode-base-game-mode-attributes");
const patch = fixture("patch-base-patch-attributes");
const fieldOf = (fields: ReferenceField[] | undefined, key: string) => fields!.find((f) => f.key === key)!;
const maps = fieldOf(mode.fields, "compatible_maps");
const introduced = fieldOf(mode.fields, "introduced_patch");
const changes = fieldOf(patch.fields, "hero_balance_changes");
const ref = (endpoint?: string, type = "reference"): ReferenceField => ({ key: "ref", type, referenceApiEndpoint: endpoint });

describe("references", () => {
  it("point only into a category folder of the record's game, as the admin allows", () => {
    assert.ok(isReferenceField(maps) && isReferenceField(introduced));
    assert.equal(referenceFolder(maps, DEFAULT_CATEGORIES), "maps");
    assert.equal(referenceFolder(introduced, DEFAULT_CATEGORIES), "patches");
    for (const endpoint of ["/api/{game}/enums/role", "/api/overwatch/heroes", "/api/{game}/schemas", "/api/{game}/heroes/", "/api/{game}/../heroes", "heroes", undefined]) {
      assert.equal(referenceFolder(ref(endpoint), DEFAULT_CATEGORIES), undefined, String(endpoint));
    }
    assert.equal(referenceFolder(ref("/api/{game}/heroes", "string"), DEFAULT_CATEGORIES), undefined);
    assert.equal(referenceFolder(ref("/api/{game}/heroes"), DEFAULT_CATEGORIES.filter((c) => c.folder !== "heroes")), undefined);
  });

  it("list the folders a field and its entries point into, once each and capped", () => {
    assert.deepEqual(referenceFolders(changes, DEFAULT_CATEGORIES, 3), ["heroes"]);
    assert.deepEqual(referenceFolders(fieldOf(patch.fields, "summary"), DEFAULT_CATEGORIES, 3), []);
    const wide: ReferenceField = { key: "wide", type: "object_array", subFields: ["heroes", "maps", "heroes", "modes", "items"].map((folder) => ({ ...ref(`/api/{game}/${folder}`), key: folder })) };
    assert.deepEqual(referenceFolders(wide, DEFAULT_CATEGORIES, 3), ["heroes", "maps", "modes"]);
  });

  it("label each record as the admin's picker does", () => {
    assert.deepEqual(referenceLabels([{ id: "colosseo", name: "Colosseo" }, { id: "esperanca", name: "" }, { name: "No id" }], maps), new Map([["colosseo", "Colosseo"], ["esperanca", "esperanca"]]));
    assert.deepEqual(
      referenceLabels([{ id: "p1", title: "Patch one", name: "p-one" }, { id: "p2", name: "Patch two" }, { id: "p3" }], introduced),
      new Map([["p1", "Patch one"], ["p2", "Patch two"], ["p3", "p3"]]),
    );
    assert.deepEqual(referenceLabels([{ id: "x", slug: "ana", name: "Ana", role: "Support" }], { ...maps, referenceValueKey: "slug", referenceLabelKey: "{name} ({role})" }), new Map([["ana", "Ana (Support)"]]));
    assert.deepEqual(referenceLabels([{ id: "x", name: "X" }], ref()), new Map([["x", "X"]]));
    // Cut as the app cuts any text (policy.ts clampText).
    assert.equal(referenceLabels([{ id: "x", name: "y".repeat(2500) }], ref()).get("x")!.length, 2000);
  });

  it("find each record by the id it is referenced by, as its label is", () => {
    const records = [{ id: "x", slug: "ana" }, { id: "", slug: "" }, { slug: "solo" }];
    assert.deepEqual([...referenceRecords(records, { ...maps, referenceValueKey: "slug" })], [["ana", records[0]], ["solo", records[2]]]);
  });
});

describe("the screen a linked reference opens", () => {
  const detail = (category: string, schema?: string) => ({ type: "detail", source: { category, ...(schema && { schema }) } });
  it("is the game's one detail screen of the record's category", () => {
    const screens = [detail("map"), detail("hero"), { type: "list", source: { category: "patch" } }, detail("patch"), detail("patch", "patch-hotfix"), { type: "detail" }, null];
    assert.deepEqual(detailScreenFor(screens, "map"), detail("map"));
    // None, or two: the app links nowhere.
    assert.equal(detailScreenFor(screens, "mode"), undefined);
    assert.equal(detailScreenFor(screens, "patch"), undefined);
  });
});

describe("the reference folders a screen labels", () => {
  const fields: FieldOption[] = [
    { key: "title", type: "string" },
    ...(mode.fields as FieldOption[]),
    { key: "hero", type: "reference", referenceApiEndpoint: "/api/{game}/heroes" },
    { key: "item", type: "reference", referenceApiEndpoint: "/api/{game}/items" },
  ];
  const block = (id: string, type: string, props: Record<string, unknown>, visible?: boolean) => ({ id, type, props, ...(visible === false && { visible }) });
  it("are those its visible blocks' bindings point into, in block order, at most 3", () => {
    const screen: ScreenFile = {
      type: "detail",
      source: { category: "mode" },
      blocks: [
        block("h", "detail_header", { title: "data.title", eyebrow: "data.introduced_patch" }),
        block("hidden", "field_section", { field: "data.item" }, false),
        block("i", "info_list", { rows: [{ label: "Hero", value: "data.hero" }] }),
        block("f", "field_section", { field: "data.compatible_maps" }),
        block("g", "field_section", { field: "data.item" }),
      ],
    };
    assert.deepEqual(screenReferenceFolders(screen, fields, [], DEFAULT_CATEGORIES, 3), ["patches", "heroes", "maps"]);
    assert.deepEqual(screenReferenceFolders({ ...screen, blocks: [] }, fields, [], DEFAULT_CATEGORIES, 3), []);
  });

  it("include those of a list's entries (item.)", () => {
    const screen: ScreenFile = { type: "list", blocks: [block("g", "record_grid", { source: { category: "patch" }, itemLabel: "item.previous_patch" })] };
    assert.deepEqual(screenReferenceFolders(screen, [], [patch], DEFAULT_CATEGORIES, 3), ["patches"]);
  });
});

describe("the admin's reference picker", () => {
  // The folder listing it reads, keysOnly as the server applies it ([[path]].ts handleListDirectory).
  const handler = "../functions/api/[[path]].ts";
  const SECRET = "test-session-secret";
  const HEROES = [{ id: "ana", name: "Ana", role: "Support", bio: "long text" }, { id: "rein", name: "Reinhardt", role: "Tank" }];

  async function listed(keysOnly: string | null): Promise<Record<string, unknown>[]> {
    const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };
    const { createSessionToken } = await import("../app/lib/session");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/graphql") return Response.json({ message: "Bad credentials" }, { status: 401 });
      const path = decodeURIComponent(url.pathname.replace(/^\/repos\/o\/r\/contents\//, ""));
      if (path === "data/overwatch/heroes") return Response.json(HEROES.map((h) => ({ type: "file", name: `${h.id}.json`, path: `${path}/${h.id}.json` })));
      const hero = HEROES.find((h) => path === `data/overwatch/heroes/${h.id}.json`)!;
      return Response.json({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify(hero)).toString("base64"), path });
    }) as typeof fetch;
    try {
      const query = `game=overwatch&subpath=heroes&includeContent=true${keysOnly === null ? "" : `&keysOnly=${encodeURIComponent(keysOnly)}`}`;
      const response = await api({
        request: new Request(`https://athena.example/api/data/directory?${query}`, { headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}` } }),
        env: { RATE_LIMIT_KV: { async get() { return null; } }, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
        params: {},
        next: async () => new Response(null),
      });
      return (await response.json()) as Record<string, unknown>[];
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  it("asks for the keys a {key} template uses, so its labels show the records' values", async () => {
    const template = "{name}, {role}";
    // As it asked before: the template itself, split at its comma, so no key matched.
    const before = await listed(`id,${template}`);
    assert.deepEqual(before.map((r) => pickerOption(r, "id", template).name), [", ", ", "]);
    const keys = pickerKeys("id", template)!;
    assert.deepEqual(keys, ["id", "name", "role"]);
    const after = await listed(keys.join(","));
    assert.deepEqual(after.map((r) => pickerOption(r, "id", template)), [{ id: "ana", name: "Ana, Support" }, { id: "rein", name: "Reinhardt, Tank" }]);
    // Still only what it needs: not the bio.
    assert.equal(after[0].bio, undefined);
  });

  it("asks for a label key's fallbacks, and reads whole records when a key can't go in the list", () => {
    assert.deepEqual(pickerKeys("id", "title"), ["id", "title", "name"]);
    assert.deepEqual(pickerKeys("slug", "{a} {b}"), ["slug", "id", "a", "b"]);
    assert.equal(pickerKeys("id", "{a,b}"), null);
    assert.deepEqual(pickerOption({ id: "p1", name: "Patch" }, "id", "title"), { id: "p1", name: "Patch" });
    assert.deepEqual(pickerOption({ slug: "", id: "x" }, "slug", "name"), { id: "x", name: "x" });
  });
});

describe("the reference folders golden, shared with the app", () => {
  // tests/fixtures/reference-folders-golden.json; zms runs the same file, so the
  // app and the admin label a screen's references from the same 3 folders.
  // REFERENCE_GOLDEN points at another copy (the one shared with zms) to check it.
  const source = process.env.REFERENCE_GOLDEN ?? new URL("./fixtures/reference-folders-golden.json", import.meta.url);
  const golden = JSON.parse(readFileSync(source, "utf8"));
  const folders = (g: typeof golden, screen: ScreenFile, max: number) => screenReferenceFolders(screen, sourceFields(g.schemas, screen.source), g.schemas, g.categories, max);

  it("picks the first folders in block order, then prop order, then array order, sub-fields in schema order, hidden blocks left out", () => {
    assert.deepEqual(folders(golden, golden.screen, golden.max), golden.expected);
    assert.deepEqual(folders(golden, golden.screen, 99), golden.expectedUncapped);
  });

  // reference-folders-golden-items.json: how item.* bindings resolve, and a list's items binding.
  const itemsSource = process.env.REFERENCE_GOLDEN_ITEMS ?? new URL("./fixtures/reference-folders-golden-items.json", import.meta.url);
  const items = JSON.parse(readFileSync(itemsSource, "utf8"));
  for (const c of items.cases as { name: string; screen: ScreenFile; expected: string[] }[]) {
    it(`resolves item.* as the app does: ${c.name}`, () => {
      assert.deepEqual(folders(items, c.screen, items.max), c.expected);
    });
  }
});
