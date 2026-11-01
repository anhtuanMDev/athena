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
  type PrimitiveManifest,
  type SchemaInfo,
  type ScreenFile,
} from "../app/lib/screen-model";
import { validateScreenFile } from "../app/lib/screen-policy";

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
