import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import {
  homeFields,
  normalizeManifest,
  recordListOrder,
  sourceFields,
  starterScreens,
  validateScreen,
  type AppContext,
  type PrimitiveManifest,
  type SchemaInfo,
  type ScreenFile,
} from "../app/lib/screen-model";
import { validateScreenFile } from "../app/lib/screen-policy";
import * as policyLib from "../app/lib/screen-policy";
import { DEFAULT_CATEGORIES } from "../app/lib/categories";
import { referenceLabels } from "../app/lib/reference-labels";
// P2 additions, imported as a namespace so each missing rule fails its own test.
import * as model from "../app/lib/screen-model";

const manifest: PrimitiveManifest = {
  promo_card: {
    name: "PromoCard",
    props: { title: { type: "string", required: true }, action: { type: "action" }, style: { type: "data_binding" } },
  },
  record_grid: { name: "RecordGrid", list: true, props: { itemLabel: { type: "string", required: true }, action: { type: "action" } } },
};
const schemas = [{ id: "hero-hero", name: "Hero", category: "hero", fields: [{ key: "role", type: "enum", globalEnumId: "role" }] }];
const fields = [{ key: "name", type: "string" }];
const screen = (blocks: ScreenFile["blocks"], extra: Partial<ScreenFile> = {}): ScreenFile => ({ type: "page", blocks, ...extra });
const kinds = (s: ScreenFile) => validateScreen(s, manifest, fields, schemas, ["home"]).map((i) => `${i.level}:${i.kind}`);

describe("validateScreen", () => {
  it("flags links the app won't open", () => {
    const s = screen([{ id: "a", type: "promo_card", props: { title: "Hi", action: { url: "https://phish.example" } } }]);
    assert.ok(kinds(s).includes("error:unsafe-link"));
  });

  it("flags styles as errors and unknown props as ignored", () => {
    const s = screen([{ id: "a", type: "promo_card", props: { title: "Hi", style: {}, banner: "x" } }]);
    const found = kinds(s);
    assert.ok(found.includes("error:blocked-prop"));
    assert.ok(found.includes("warning:ignored-prop"));
  });

  it("warns about a screen with nothing visible and blocks too many blocks", () => {
    assert.ok(kinds(screen([{ id: "a", type: "promo_card", props: { title: "Hi" }, visible: false }])).includes("warning:empty-screen"));
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `b${i}`, type: "promo_card", props: { title: "x" } }));
    assert.ok(kinds(screen(many)).includes("error:too-many-blocks"));
  });

  it("checks item bindings against the source's fields", () => {
    const s = screen([{ id: "g", type: "record_grid", props: { itemLabel: "item.nope" } }], { type: "list", source: { category: "hero" } });
    assert.ok(kinds(s).includes("error:unknown-field"));
    const ok = screen([{ id: "g", type: "record_grid", props: { itemLabel: "item.role" } }], { type: "list", source: { category: "hero" } });
    assert.deepEqual(kinds(ok), []);
  });

  it("accepts links read from the record, checking only that the field exists", () => {
    const list = (action: unknown) =>
      screen([{ id: "g", type: "record_grid", props: { itemLabel: "item.name", action } }], { type: "list", source: { category: "hero" } });
    assert.deepEqual(kinds(list({ url: "item.role" })), []);
    assert.deepEqual(kinds(list({ url: "item.nope" })), ["error:unknown-field"]);
    const card = (action: unknown) => screen([{ id: "a", type: "promo_card", props: { title: "Hi", action } }]);
    assert.deepEqual(kinds(card({ url: "data.name" })), []);
    assert.deepEqual(kinds(card({ url: "data.nope" })), ["error:unknown-field"]);
    assert.deepEqual(kinds(card({ url: "item.name" })), ["error:unknown-field"]); // promo_card isn't a list block
    assert.deepEqual(kinds(card({ url: "data.url; javascript:x" })), ["error:unsafe-link"]);
    assert.deepEqual(kinds(card({ url: "https://overwatch.blizzard.com/news" })), []);
  });
});

describe("starter screens", () => {
  it("pass the same file checks the write API runs", () => {
    for (const { file } of starterScreens({ id: "hero-hero", name: "Hero", category: "hero", fields: [{ key: "role", type: "enum" }, { key: "health", type: "number" }, { key: "abilities", type: "abilities" }] })) {
      assert.deepEqual(validateScreenFile(file), []);
    }
  });

  // The schemas in the zero-backend repo, and its block manifest.
  const fixtures = new URL("./fixtures/", import.meta.url);
  const realSchemas: SchemaInfo[] = readdirSync(new URL("overwatch/schemas", fixtures))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(`overwatch/schemas/${name}`, fixtures), "utf8")));
  const realManifest = normalizeManifest(JSON.parse(readFileSync(new URL("mobile_primitives.json", fixtures), "utf8")));

  it("save without errors for every real schema, named and pictured by its own fields", () => {
    const expected: Record<string, [string, string | undefined]> = {
      "hero-hero": ["item.hero_name", "item.portrait"],
      "hero-two-form-hero": ["item.name", "item.portrait"],
      "item-base-item-attributes": ["item.item_name", "item.icon"],
      "map-base-map-attributes": ["item.name", "item.background_image"],
      "mode-base-game-mode-attributes": ["item.name", undefined],
      "news-news-article": ["item.title", "item.image"],
      "patch-base-patch-attributes": ["item.title", undefined],
    };
    assert.deepEqual(realSchemas.map((s) => s.id).sort(), Object.keys(expected).sort());
    for (const schema of realSchemas) {
      const starters = starterScreens(schema);
      const ids = starters.map((s) => s.id);
      for (const { id, file } of starters) {
        const dataFields = file.type === "detail" ? sourceFields(realSchemas, file.source) : [...sourceFields(realSchemas, file.source), ...homeFields()];
        const errors = validateScreen(file, realManifest, dataFields, realSchemas, ids).filter((i) => i.level === "error");
        assert.deepEqual(errors, [], `${schema.id} → ${id}`);
        assert.deepEqual(validateScreenFile(file), [], `${schema.id} → ${id}`);
      }
      const grid = starters[0].file.blocks.find((b) => b.type === "record_grid")!;
      assert.deepEqual([grid.props.itemLabel, grid.props.itemImage], expected[schema.id], schema.id);
    }
  });
});

describe("record lists", () => {
  it("put the newest first, undated ones last, then order by title", () => {
    const fields = [
      { key: "title", type: "string" },
      { key: "release_date", type: "string" },
    ];
    const records = [
      { id: "b", title: "Bravo" },
      { id: "old", title: "Old", release_date: "2026-10-06" },
      { id: "a", title: "Alpha" },
      { id: "new", title: "New", release_date: "2026-10-20" },
    ];
    assert.deepEqual(recordListOrder(records, fields).map((r) => r.id), ["new", "old", "a", "b"]);
    // Without a date field, by title, else id.
    assert.deepEqual(recordListOrder([{ id: "z", item_name: "Alpha" }, { id: "y" }], [{ key: "item_name", type: "string" }]).map((r) => r.id), ["z", "y"]);
  });
});

// ─── P2: admin ↔ app compatibility ────────────────────────────────────

const fixtureSchemas = (): SchemaInfo[] =>
  readdirSync(new URL("./fixtures/overwatch/schemas", import.meta.url))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/schemas/${name}`, import.meta.url), "utf8")));

describe("sorting records (the app's rule, zms model.ts)", () => {
  // The shared contract with the app: worker B checks the same vectors on Hermes.
  const records = [
    { id: "a", v: "b" },
    { id: "b" },
    { id: "c", v: "A" },
    { id: "d", v: null },
    { id: "e", v: "a" },
    { id: "f", v: "" },
    { id: "g", v: 10 },
    { id: "h", v: "9" },
    { id: "i", v: 2 },
  ];

  it("puts records without the field last in both orders, and keeps file order for ties", () => {
    assert.deepEqual(model.sortByField(records, "v", "asc").map((r) => r.id).join(","), "i,h,g,c,e,a,b,d,f");
    assert.deepEqual(model.sortByField(records, "v", "desc").map((r) => r.id).join(","), "a,c,e,g,h,i,b,d,f");
    assert.deepEqual(model.sortByField(records, "v").map((r) => r.id), model.sortByField(records, "v", "asc").map((r) => r.id));
    // The input is left as it was.
    assert.equal(records[0].id, "a");
  });
});

describe("the preview's records (the app's selectRecords)", () => {
  const schemasOfCategory = [{ id: "one" }, { id: "two" }];
  const records = [
    { id: "x", schema_id: "two", n: 3 },
    { id: "y", n: 1 },
    { id: "z", schema_id: "gone", n: 2 },
    { id: "w", schema_id: "one" },
  ];
  const ids = (list: { id: unknown }[]) => list.map((r) => r.id);

  it("count a record without a known schema_id as the category's first schema", () => {
    assert.deepEqual(ids(model.previewRecords(records, { category: "c", schema: "one" }, schemasOfCategory)), ["y", "z", "w"]);
    assert.deepEqual(ids(model.previewRecords(records, { category: "c", schema: "two" }, schemasOfCategory)), ["x"]);
    assert.deepEqual(ids(model.previewRecords(records, { category: "c", schema: "one" }, [])), ["x", "y", "z", "w"]);
  });

  it("sort like the app, missing values last", () => {
    assert.deepEqual(ids(model.previewRecords(records, { category: "c", sort: "n", order: "desc" }, schemasOfCategory)), ["x", "z", "y", "w"]);
    assert.deepEqual(ids(model.previewRecords(records, { category: "c", sort: "n" }, schemasOfCategory)), ["y", "z", "x", "w"]);
  });

  it("show at most the app's list size, and everything up to it without a limit", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `r${i}` }));
    assert.equal(model.previewRecords(many, { category: "c" }, []).length, policyLib.APP_POLICY.limits.listItems);
    assert.equal(model.previewRecords(many, { category: "c", limit: 0 }, []).length, policyLib.APP_POLICY.limits.listItems);
    assert.equal(model.previewRecords(many, { category: "c", limit: 120 }, []).length, policyLib.APP_POLICY.limits.listItems);
    assert.equal(model.previewRecords(many, { category: "c", limit: 5 }, []).length, 5);
    assert.equal(model.previewRecords(many, { category: "c" }, [], { ...policyLib.APP_POLICY.limits, listItems: 3 }).length, 3);
    assert.deepEqual(model.previewRecords(many, undefined, []), []);
  });
});

describe("screens against the app's limits and screens", () => {
  const appManifest: PrimitiveManifest = {
    shortcut_grid: { name: "ShortcutGrid", props: { title: { type: "string" }, items: { type: "shortcuts" } } },
    info_list: { name: "InfoList", props: { title: { type: "string" }, rows: { type: "info_rows" } } },
    record_grid: { name: "RecordGrid", list: true, props: { itemLabel: { type: "string" }, source: { type: "source" }, action: { type: "action" } } },
    promo_card: { name: "PromoCard", props: { title: { type: "string" }, text: { type: "string" }, action: { type: "action" } } },
  };
  const p2Schemas: SchemaInfo[] = [
    ...schemas,
    { id: "news-news-article", name: "News", category: "news", fields: [{ key: "title", type: "string" }] },
  ];
  const app = (limits: Partial<typeof policyLib.APP_POLICY.limits> = {}) => ({
    limits: { ...policyLib.APP_POLICY.limits, ...limits },
    appScreens: policyLib.APP_POLICY.appScreens,
    categories: DEFAULT_CATEGORIES,
  });
  const found = (s: ScreenFile, context = app()) =>
    model.validateScreen(s, appManifest, model.homeFields(), p2Schemas, ["home", "news"], undefined, context).map((i) => `${i.level}:${i.kind}`);
  const tiles = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Tile ${i}`, screen: "news" }));
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Row ${i}`, value: "x" }));
  const one = (type: string, props: Record<string, unknown>, extra: Partial<ScreenFile> = {}) => screen([{ id: "a", type, props }], { type: "home", ...extra });

  it("refuse more tiles or rows than the app shows", () => {
    assert.deepEqual(found(one("shortcut_grid", { items: tiles(2) }), app({ smallList: 2 })), []);
    assert.deepEqual(found(one("shortcut_grid", { items: tiles(3) }), app({ smallList: 2 })), ["error:too-many-entries"]);
    assert.deepEqual(found(one("info_list", { rows: rows(3) }), app({ smallList: 2 })), ["error:too-many-entries"]);
    assert.deepEqual(found(one("shortcut_grid", { items: tiles(12) })), []);
    assert.deepEqual(found(one("shortcut_grid", { items: tiles(13) })), ["error:too-many-entries"]);
  });

  it("refuse tiles and rows the app leaves out: no label, a missing screen, a link it won't open", () => {
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "", screen: "news" }] })), ["error:required"]);
    assert.deepEqual(found(one("info_list", { rows: [{ label: "", value: "x" }] })), ["error:required"]);
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "Gone", screen: "gone" }] })), ["error:unknown-screen"]);
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "Settings", screen: "app:settings" }] })), []);
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "Foo", screen: "app:foo" }] })), ["error:unknown-screen"]);
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "News", url: "https://overwatch.blizzard.com/en-us/news/" }] })), []);
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "Bad", url: "https://phish.example" }] })), ["error:unsafe-link"]);
    assert.deepEqual(found(one("shortcut_grid", { items: [{ label: "Bound", url: "data.nope" }] })), ["error:unknown-field"]);
  });

  it("open only the app's own screens from actions", () => {
    assert.deepEqual(found(one("promo_card", { title: "x", action: { screen: "app:settings" } })), []);
    assert.deepEqual(found(one("promo_card", { title: "x", action: { screen: "app:foo" } })), ["error:unknown-screen"]);
  });

  it("refuse a source limit above the app's list size, on a block or the screen", () => {
    const grid = (source: Record<string, unknown>) => one("record_grid", { itemLabel: "item.name", source });
    assert.deepEqual(found(grid({ category: "hero", limit: 100 })), []);
    assert.deepEqual(found(grid({ category: "hero", limit: 101 })), ["error:over-limit"]);
    const list = screen([{ id: "a", type: "record_grid", props: { itemLabel: "item.name" } }], { type: "list", source: { category: "hero", limit: 150 } });
    assert.ok(found(list).includes("error:over-limit"));
  });

  it("refuse favorites of a category players can't favorite: the list would always be empty", () => {
    const grid = (category: string) => one("record_grid", { itemLabel: "item.name", source: { category, favorites: true } });
    assert.deepEqual(found(grid("hero")), []);
    assert.deepEqual(found(grid("news")), ["error:not-favoritable"]);
    const list = screen([], { type: "list", source: { category: "news", favorites: true } });
    assert.ok(found(list).includes("error:not-favoritable"));
  });

  it("check an accent read from the data, on every screen type", () => {
    assert.deepEqual(found(one("promo_card", { title: "x" }, { accent: "#FF8200" })), []);
    assert.deepEqual(found(one("promo_card", { title: "x" }, { accent: "data.game.primary" })), []);
    assert.deepEqual(found(one("promo_card", { title: "x" }, { accent: "data.color" })), ["error:unknown-field"]);
  });

  it("warn about text the app cuts short", () => {
    assert.deepEqual(found(one("promo_card", { title: "x", text: "y".repeat(2000) })), []);
    assert.deepEqual(found(one("promo_card", { title: "x", text: "y".repeat(2001) })), ["warning:long-text"]);
    assert.deepEqual(found(one("promo_card", { title: "x", text: "y".repeat(11) }), app({ text: 10 })), ["warning:long-text"]);
  });

  it("cap blocks at the policy's limit", () => {
    const three = screen(["a", "b", "c"].map((id) => ({ id, type: "promo_card", props: { title: "x" } })), { type: "home" });
    assert.ok(found(three, app({ blocksPerScreen: 2 })).includes("error:too-many-blocks"));
    assert.ok(!found(three).includes("error:too-many-blocks"));
  });
});

describe("fields bindings can use", () => {
  it("include every value of the app's game on home and list screens", () => {
    const keys = model.homeFields().map((f) => f.key);
    for (const key of ["game.name", "game.slug", "game.developer", "game.icon", "game.banner", "game.primary", "game.surfaceVariant", "game.border"]) {
      assert.ok(keys.includes(key), key);
    }
    assert.ok(!keys.includes("game.light"));
    const card = (title: string) => screen([{ id: "a", type: "promo_card", props: { title } }]);
    const unknown = (title: string) => model.validateScreen(card(title), manifest, model.homeFields(), schemas, ["home"]).filter((i) => i.kind === "unknown-field");
    assert.deepEqual(unknown("data.game.developer"), []);
    assert.equal(unknown("data.game.nope").length, 1);
  });

  it("take the schema's definition over the hero form's legacy one (difficulty is an enum)", () => {
    const real = fixtureSchemas();
    assert.equal(model.sourceFields(real, { category: "hero" }).find((f) => f.key === "difficulty")?.type, "enum");
    // Without a schema that defines it, the legacy field is still there.
    assert.equal(model.sourceFields([], { category: "hero" }).find((f) => f.key === "difficulty")?.type, "number");
  });

  it("leave out the hero form's legacy kit, which the app shows as bare names", () => {
    assert.ok(!model.sourceFields([], { category: "hero" }, [{ id: "ana", kit: [] }]).some((f) => f.key === "kit"));
    assert.ok(model.sourceFields([], { category: "hero" }, [{ id: "ana", extra: ["a"] }]).some((f) => f.key === "extra"));
  });

  it("offer for filter chips only fields whose options the app can show and match", () => {
    const real = fixtureSchemas();
    const heroKeys = model.filterFields(model.sourceFields(real, { category: "hero" })).map((f) => f.key);
    assert.deepEqual(heroKeys.sort(), ["difficulty", "role", "status", "sub_role"]);
    const modeKeys = model.filterFields(model.sourceFields(real, { category: "mode" })).map((f) => f.key);
    assert.ok(modeKeys.includes("supported_playlists")); // a list read from a global enum
    assert.deepEqual(model.filterFields([{ key: "kind", type: "enum" }, { key: "tags", type: "list" }]), []);
  });

  it("give a weapon's entries the same fields as an ability's", () => {
    const sub = [{ key: "damage", type: "number" }];
    const weapon = model.entryFields({ key: "weapons", type: "weapon", subFields: sub }).map((f) => f.key);
    assert.deepEqual(weapon, ["name", "type", "description", "icon", "params.damage"]);
    assert.deepEqual(weapon, model.entryFields({ key: "abilities", type: "abilities", subFields: sub }).map((f) => f.key));
  });
});

describe("starter screens for references", () => {
  it("leave out reference fields, which the app shows as raw ids", () => {
    const real = fixtureSchemas();
    for (const schema of real) {
      const references = schema.fields.filter((f) => f.type === "reference" || f.type === "reference_list").map((f) => `data.${f.key}`);
      for (const { file } of model.starterScreens(schema)) {
        const bound = file.blocks.flatMap((b) => Object.values(b.props).filter((v): v is string => typeof v === "string"));
        assert.deepEqual(bound.filter((v) => references.includes(v)), [], schema.id);
      }
    }
  });
});

describe("values with their unit or custom suffix (F3, as the app shows them)", () => {
  const cooldown = { key: "params.cooldown", type: "number", unit: "", hasCustomSuffix: true };
  const health = { key: "health", type: "number", unit: "HP" };

  it("show a record's own suffix in place of the field's unit", () => {
    assert.equal(model.valueWithUnit(cooldown, 8, { cooldown: 8, cooldown_suffix: " s " }), "8 s");
    assert.equal(model.valueWithUnit({ ...health, hasCustomSuffix: true }, 250, { health: 250, health_suffix: "pts" }), "250 pts");
    assert.equal(model.valueWithUnit({ key: "trigger", type: "string", hasCustomSuffix: true }, "Hold", { trigger: "Hold", trigger_suffix: "x2" }), "Hold x2");
  });

  it("fall back to the unit when the suffix is empty, or the field has none", () => {
    assert.equal(model.valueWithUnit({ ...health, hasCustomSuffix: true }, 250, { health: 250, health_suffix: "   " }), "250 HP");
    assert.equal(model.valueWithUnit(health, 250, { health: 250, health_suffix: "pts" }), "250 HP");
    assert.equal(model.valueWithUnit(health, "250", { health: "250" }), "250 HP");
    assert.equal(model.valueWithUnit(cooldown, 8, { cooldown: 8, cooldown_suffix: "" }), 8);
  });

  it("leave enums, text without a suffix, empty values and unknown fields as they are", () => {
    assert.equal(model.valueWithUnit({ key: "role", type: "enum", hasCustomSuffix: true }, "Tank", { role: "Tank", role_suffix: "x" }), "Tank");
    assert.equal(model.valueWithUnit({ key: "note", type: "string", unit: "HP" }, "Hold", { note: "Hold" }), "Hold");
    assert.equal(model.valueWithUnit(health, "", { health: "" }), "");
    assert.equal(model.valueWithUnit(undefined, 5, {}), 5);
  });
});

describe("the app's block manifest (zms npm run primitives, as in zero-backend)", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/mobile_primitives.json", import.meta.url), "utf8"));

  void it("gives the app's limits, screens and picture hosts, ignoring its other policy keys", () => {
    // linkHosts and blockedProps are the admin's own (manifestProblems); routeStops is the preview's too.
    for (const key of ["routeStops", "linkHosts", "imageHosts", "blockedProps"]) {
      assert.ok(key in raw.$policy || key in raw.$policy.limits, key);
    }
    assert.deepEqual(policyLib.appPolicy(raw), {
      limits: { screensPerGame: 50, blocksPerScreen: 60, tabs: 5, listItems: 100, smallList: 12, text: 2000, routeStops: 6 },
      appScreens: ["app:settings"],
      imageHosts: ["blz-contentstack-images.akamaized.net", "bnetcmsus-a.akamaihd.net"],
      imageVariants: ["main", "default", "2d", "portrait", "icon"],
    });
  });

  it("lists every block, without the policy or props a screen can't set", () => {
    const blocks = normalizeManifest(raw)!;
    assert.ok(!("$policy" in blocks));
    assert.deepEqual(Object.keys(blocks).sort(), Object.keys(raw).filter((k) => k !== "$policy").sort());
    assert.equal(Object.keys(blocks).length, 24);
    assert.ok(blocks.welcome_banner && blocks.record_actions);
    const unsettable = Object.entries(blocks).flatMap(([type, spec]) =>
      Object.entries(spec.props).filter(([name, prop]) => name === "style" || prop.type === "node").map(([name]) => `${type}.${name}`),
    );
    assert.deepEqual(unsettable, []);
  });
});

describe("the screen preview, as the app draws it", () => {
  it("shows a route's first stages up to the app's limit, staggered past four", () => {
    const stages = ["Spawn", "Checkpoint 1", "Checkpoint 2", "Checkpoint 3", "Checkpoint 4", "Final", "Extra"];
    assert.deepEqual(model.routeLayout(stages.slice(0, 4), 6), { stops: stages.slice(0, 4), staggered: false });
    assert.deepEqual(model.routeLayout(stages.slice(0, 5), 6), { stops: stages.slice(0, 5), staggered: true });
    assert.deepEqual(model.routeLayout(stages, policyLib.APP_POLICY.limits.routeStops), { stops: stages.slice(0, 6), staggered: true });
    assert.deepEqual(model.routeLayout(stages, 3), { stops: stages.slice(0, 3), staggered: false });
  });

  it("gives home and list screens the game's games.json entry and every folder's records", () => {
    const overwatch = { slug: "overwatch", name: "Overwatch 2", developer: "Blizzard Entertainment", primary: "#00B4FF" };
    const heroes = [{ id: "ana" }];
    const data = model.homeData(overwatch, { hero: heroes }, DEFAULT_CATEGORIES);
    assert.equal(data.game, overwatch);
    assert.equal(data.heroes, heroes);
    assert.deepEqual(data.maps, []);
    // No entry for the game: nothing to bind to, as in the app.
    assert.ok(!("game" in model.homeData(undefined, {}, DEFAULT_CATEGORIES)));
  });
});

// ─── Lists of entries (object_array, abilities, weapon) ─────────────────
const fixtureFile = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}.json`, import.meta.url), "utf8"));
const patchSchema: SchemaInfo = fixtureFile("schemas/patch-base-patch-attributes");
const heroSchema: SchemaInfo = fixtureFile("schemas/hero-hero");
const heroRecords: Record<string, unknown>[] = [fixtureFile("heroes/ana"), fixtureFile("heroes/baptiste")];
const fieldOf = (schema: SchemaInfo, key: string) => schema.fields.find((f) => f.key === key)!;

describe("a field_section's list of entries, as the app shows it (zms FieldValue)", () => {
  // The preview's lookups (ScreenEdit): a hero by its record's label, an enum value by its option's name.
  const names = (linked = false): model.ValueNames => ({
    reference: (field, id) => {
      const label = referenceLabels(heroRecords, field).get(id);
      return label === undefined ? undefined : { label, linked };
    },
    enumName: (field, value) => (field.options?.includes(String(value)) ? String(value) : undefined),
  });

  it("titles each entry by its first text sub-field, and shows the rest as rows, a hero by its name", () => {
    const value = [
      {
        hero: "ana",
        ability_or_system_name: "Biotic Rifle",
        developer_comment: "",
        changes: [{ attribute: "Damage", previous_value: "70", new_value: "75" }],
      },
      { hero: "nobody", ability_or_system_name: "Sleep Dart" },
    ];
    assert.deepEqual(model.valueView(fieldOf(patchSchema, "hero_balance_changes"), value, names()), {
      kind: "entries",
      entries: [
        {
          title: "Biotic Rifle",
          rows: [
            { label: "Hero", value: { kind: "text", text: "Ana Amary", linked: false } },
            {
              label: "Changes",
              value: {
                kind: "entries",
                entries: [
                  {
                    title: "Damage",
                    rows: [
                      { label: "Previous Value", value: { kind: "text", text: "70" } },
                      { label: "New Value", value: { kind: "text", text: "75" } },
                    ],
                  },
                ],
              },
            },
          ],
        },
        // A reference with no record shows its id, as in the app.
        { title: "Sleep Dart", rows: [{ label: "Hero", value: { kind: "text", text: "nobody", linked: false } }] },
      ],
    });
  });

  it("links the entries' references where the section links them, and names enum values by their option", () => {
    const view = model.valueView(fieldOf(patchSchema, "bug_fixes"), [{ category: "UI", description: "Fixed a menu.", related_hero: "baptiste" }], names(true));
    assert.deepEqual(view, {
      kind: "entries",
      entries: [
        {
          title: "Fixed a menu.",
          rows: [
            { label: "Category", value: { kind: "chips", chips: [{ text: "UI", linked: false }] } },
            { label: "Related Hero", value: { kind: "text", text: "Baptiste", linked: true } },
          ],
        },
      ],
    });
  });

  it("shows an ability's name, type and description, then its params in the record's units", () => {
    const value = [{ name: "Biotic Rifle", type: "Weapon", description: "Heals allies.", icon: "a.png", params: { cooldown: 1.25, cooldown_suffix: "s", is_removed: false, keybind: "" } }];
    assert.deepEqual(model.valueView(fieldOf(heroSchema, "abilities"), value, names()), {
      kind: "entries",
      entries: [
        {
          title: "Biotic Rifle",
          subtitle: "Weapon",
          text: "Heals allies.",
          rows: [
            { label: "Cooldown", value: { kind: "text", text: "1.25 s" } },
            { label: "Removed From Game", value: { kind: "text", text: "No" } },
          ],
        },
      ],
    });
  });

  it("shows nothing for an empty list", () => {
    assert.equal(model.valueView(fieldOf(patchSchema, "bug_fixes"), [], names()), null);
  });
});

describe("text bound to a list of entries", () => {
  const realManifest = normalizeManifest(fixtureFile("../mobile_primitives"));
  const issuesOf = (schema: SchemaInfo, category: string, blocks: ScreenFile["blocks"]) => {
    const s: ScreenFile = { type: "detail", source: { category }, blocks };
    return validateScreen(s, realManifest, sourceFields([schema], s.source), [schema], [])
      .filter((i) => i.kind === "list-as-text")
      .map((i) => [i.level, i.sectionId, i.prop, /field_section/.test(i.message)]);
  };

  it("is a warning pointing to field_section, for item., data. and info row bindings alike", () => {
    const blocks: ScreenFile["blocks"] = [
      { id: "list", type: "item_list", props: { items: "data.hero_balance_changes", itemTitle: "item.ability_or_system_name", itemText: "item.changes" } },
      { id: "header", type: "detail_header", props: { title: "data.hero_balance_changes" } },
      { id: "info", type: "info_list", props: { rows: [{ label: "Changes", value: "data.general_changes" }, { label: "Title", value: "data.title" }] } },
      // Where a list of entries belongs: a list block's items, and a field section.
      { id: "section", type: "field_section", props: { field: "data.hero_balance_changes" } },
    ];
    assert.deepEqual(issuesOf(patchSchema, "patch", blocks), [
      ["warning", "list", "itemText", true],
      ["warning", "header", "title", true],
      ["warning", "info", "rows", true],
    ]);
  });

  it("counts abilities as a list of entries too", () => {
    const blocks: ScreenFile["blocks"] = [{ id: "stats", type: "stat_row", props: { stat1Label: "Kit", stat1Value: "data.abilities" } }];
    assert.deepEqual(issuesOf(heroSchema, "hero", blocks), [["warning", "stats", "stat1Value", true]]);
  });
});

// ─── R3: the contract with the app ──────────────────────────────────────

void describe("actions that open a detail screen (F9)", () => {
  const appManifest = normalizeManifest(fixtureFile("../mobile_primitives"));
  const fixtureDir = new URL("./fixtures/overwatch/schemas/", import.meta.url);
  const gameSchemas = readdirSync(fixtureDir).map((name) => JSON.parse(readFileSync(new URL(name, fixtureDir), "utf8")) as SchemaInfo);
  const screens = [
    { id: "home", type: "home" },
    { id: "heroes", type: "list", source: { category: "hero" } },
    { id: "maps", type: "list", source: { category: "map" } },
    { id: "hero-detail", type: "detail", source: { category: "hero" } },
    { id: "news-detail", type: "detail", source: { category: "news" } },
  ];
  const issuesOf = (checked: ScreenFile, id: string, dataFields = homeFields()) =>
    validateScreen(checked, appManifest, dataFields, gameSchemas, screens.map((x) => x.id), () => [], { categories: DEFAULT_CATEGORIES, screens, screenId: id })
      .filter((i) => i.kind === "wrong-record")
      .map((i) => `${i.level} ${i.sectionId}.${String(i.prop)}: ${i.message}`);

  void it("needs a list of that category's records: the app opens the tapped one", () => {
    const maps: ScreenFile = {
      type: "list",
      source: { category: "map" },
      blocks: [{ id: "grid", type: "record_grid", props: { itemLabel: "item.name", action: { screen: "hero-detail" } } }],
    };
    assert.deepEqual(issuesOf(maps, "maps"), [
      'error grid.action: action opens "hero-detail", which shows a "hero" record, but this block lists "map" records: the app would find none.',
    ]);

    const home: ScreenFile = {
      type: "home",
      blocks: [
        { id: "promo", type: "promo_card", props: { title: "Hi", buttonLabel: "Go", action: { screen: "hero-detail" } } },
        { id: "tiles", type: "shortcut_grid", props: { items: [{ label: "Heroes", screen: "heroes" }, { label: "Ana", screen: "hero-detail" }] } },
        { id: "news", type: "record_grid", props: { itemLabel: "item.title", source: { category: "news" }, action: { screen: "news-detail" } } },
        { id: "picks", type: "featured_carousel", props: { itemTitle: "item.name", source: { category: "hero" }, action: { screen: "hero-detail" } } },
        { id: "hidden", type: "promo_card", visible: false, props: { title: "Hi", action: { screen: "news-detail" } } },
        { id: "settings", type: "promo_card", props: { title: "Hi", action: { screen: "app:settings" } } },
      ],
    };
    assert.deepEqual(issuesOf(home, "home"), [
      'error promo.action: action opens "hero-detail", a detail screen: only a list of "hero" records can open it, with the record that was tapped.',
      'error tiles.items: Tile 2 opens "hero-detail", a detail screen: only a list of "hero" records can open it, with the record that was tapped.',
      'warning hidden.action: action opens "news-detail", a detail screen: only a list of "news" records can open it, with the record that was tapped.',
    ]);

    // On a detail screen: a list of the screen's own category may open it again, another category's may not.
    const detail: ScreenFile = {
      type: "detail",
      source: { category: "hero" },
      blocks: [
        { id: "related", type: "record_grid", props: { itemLabel: "item.name", action: { screen: "hero-detail" } } },
        { id: "where", type: "record_grid", props: { itemLabel: "item.name", source: { category: "map" }, action: { screen: "hero-detail" } } },
      ],
    };
    assert.deepEqual(issuesOf(detail, "hero-detail", sourceFields(gameSchemas, detail.source)), [
      'error where.action: action opens "hero-detail", which shows a "hero" record, but this block lists "map" records: the app would find none.',
    ]);
  });

  void it("says nothing without the game's screens, as before", () => {
    const promo: ScreenFile = { type: "home", blocks: [{ id: "promo", type: "promo_card", props: { title: "Hi", action: { screen: "hero-detail" } } }] };
    const plain = validateScreen(promo, appManifest, homeFields(), gameSchemas, ["hero-detail"]);
    assert.deepEqual(plain.filter((i) => i.kind === "wrong-record"), []);
  });
});

void describe("a second detail screen of a category (C9)", () => {
  const screens = [{ id: "hero-detail", type: "detail", source: { category: "hero" } }];
  const lore: ScreenFile = { type: "detail", source: { category: "hero" }, blocks: [{ id: "t", type: "text", props: { text: "Lore" } }] };
  const kindsOf = (app: AppContext) =>
    validateScreen(lore, manifest, fields, schemas, ["hero-detail", "hero-lore"], () => [], app).filter((i) => i.kind === "second-detail");

  void it("is a warning: notifications and reference links then open neither", () => {
    const found = kindsOf({ screens: [...screens, { id: "hero-lore", type: "detail", source: { category: "hero" } }], screenId: "hero-lore" });
    assert.deepEqual(
      found.map((i) => [i.level, i.message]),
      [["warning", 'The detail screen "hero-detail" shows "hero" records too: notifications and reference links open neither of them. List blocks can still open either.']],
    );
    assert.deepEqual(kindsOf({ screens, screenId: "hero-detail" }), []);
  });
});

void describe("a screen's categories, as categories.json configures them (C5)", () => {
  const withSkin = [...schemas, { id: "skin-base", name: "Skin", category: "skin", fields: [] }];
  void it("must be configured, not only have a schema", () => {
    const skins: ScreenFile = { type: "list", source: { category: "skin" }, blocks: [{ id: "g", type: "record_grid", props: { itemLabel: "item.name", source: { category: "skin" } } }] };
    const appManifest = normalizeManifest(fixtureFile("../mobile_primitives"));
    const found = validateScreen(skins, appManifest, fields, withSkin, ["home"], () => [], { categories: DEFAULT_CATEGORIES }).filter((i) => i.kind === "unknown-category");
    assert.deepEqual(
      found.map((i) => [i.level, i.sectionId, i.message]),
      [
        ["error", "", 'The screen lists category "skin", which isn\'t in categories.json: the app shows nothing for it.'],
        ["error", "g", 'source lists category "skin", which isn\'t in categories.json: the app shows nothing for it.'],
      ],
    );
  });

  void it("offers starters only for configured categories", () => {
    assert.deepEqual(model.starterSchemas(withSkin, DEFAULT_CATEGORIES).map((schema) => schema.id), ["hero-hero"]);
  });
});

void describe("what data. reads on each kind of screen (C4)", () => {
  const { screenDataFields } = model;

  void it("is the game and the folders on list screens; the source's fields only feed the filter chips", () => {
    assert.equal(typeof screenDataFields, "function", "screen-model exports screenDataFields");
    const list = screenDataFields({ type: "list", source: { category: "hero" }, blocks: [] }, { schemas, categories: DEFAULT_CATEGORIES });
    assert.deepEqual(list.data.map((field) => field.key), homeFields(DEFAULT_CATEGORIES).map((field) => field.key));
    assert.ok(list.filter.some((field) => field.key === "role"));
    const detail = screenDataFields({ type: "detail", source: { category: "hero" }, blocks: [] }, { schemas, categories: DEFAULT_CATEGORIES });
    assert.ok(detail.data.some((field) => field.key === "role"));
    const listScreen: ScreenFile = { type: "list", source: { category: "hero" }, blocks: [{ id: "t", type: "text", props: { text: "data.role" } }] };
    const issues = validateScreen(listScreen, manifest, list.data, schemas, ["home"]).filter((i) => i.kind === "unknown-field");
    assert.equal(issues.length, 1);
  });
});

void describe("pictures and colours in a block (F3, C7)", () => {
  const appManifest = normalizeManifest(fixtureFile("../mobile_primitives"));
  void it("are flagged on their prop", () => {
    const home: ScreenFile = {
      type: "home",
      blocks: [
        { id: "promo", type: "promo_card", props: { title: "Hi", image: "https://i.imgur.com/a.png" } },
        { id: "text", type: "text", props: { text: "Hi", color: "teal" } },
        { id: "ok", type: "promo_card", props: { title: "Hi", image: "/api/assets/a.webp" } },
      ],
    };
    const found = validateScreen(home, appManifest, homeFields(), schemas, ["home"]).filter((i) => ["foreign-picture", "bad-color"].includes(i.kind));
    assert.deepEqual(
      found.map((i) => [i.level, i.sectionId, i.prop, i.kind]),
      [
        ["error", "promo", "image", "foreign-picture"],
        ["error", "text", "color", "bad-color"],
      ],
    );
  });
});
