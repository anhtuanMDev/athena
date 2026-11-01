import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recordListOrder, starterScreens, validateScreen, type PrimitiveManifest, type ScreenFile } from "../app/lib/screen-model";
import { validateScreenFile } from "../app/lib/screen-policy";

const manifest: PrimitiveManifest = {
  promo_card: {
    name: "PromoCard",
    props: { title: { type: "string", required: true }, action: { type: "action" }, style: { type: "data_binding" } },
  },
  record_grid: { name: "RecordGrid", list: true, props: { itemLabel: { type: "string", required: true } } },
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
});

describe("starter screens", () => {
  it("pass the same file checks the write API runs", () => {
    for (const { file } of starterScreens({ id: "hero-hero", name: "Hero", category: "hero", fields: [{ key: "role", type: "enum" }, { key: "health", type: "number" }, { key: "abilities", type: "abilities" }] })) {
      assert.deepEqual(validateScreenFile(file), []);
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
