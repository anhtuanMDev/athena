import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { asStored } from "../app/lib/as-stored";
import { modeRecordSchema, heroRecordSchema } from "../app/lib/record-schema";
import { keepUnknownKeys } from "../app/lib/unknown-keys";
import type { DynamicField } from "../app/schemas/dynamic-schema";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}`, import.meta.url), "utf8"));
type Item = Record<string, unknown>;
const isObject = (v: unknown): v is Item => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The values react-hook-form submits for a record it was given, as the admin
 * showed them (P3 harness): a registered text or number input it had no value
 * for holds "", a checkbox false; a field array turns any falsy value into [].
 */
function formValues(record: Item, fields: DynamicField[]): Item {
  const fill = (value: unknown, field: DynamicField): unknown => {
    if (field.type === "object_array" || field.type === "abilities" || field.type === "weapon") {
      if (!Array.isArray(value)) return value ? value : [];
      return value.map((entry) => {
        if (!isObject(entry)) return entry;
        const out: Item = { ...entry };
        if (field.type === "object_array") for (const sf of field.subFields ?? []) out[sf.key] = fill(out[sf.key], sf);
        else {
          for (const key of ["id", "name", "type", "description"]) if (out[key] === undefined) out[key] = "";
          const params: Item = { ...(isObject(out.params) ? out.params : {}) };
          for (const sf of field.subFields ?? []) params[sf.key] = fill(params[sf.key], sf);
          out.params = params;
        }
        return out;
      });
    }
    if (value !== undefined) return value;
    return field.type === "boolean" ? false : field.type === "list" || field.type === "reference_list" ? undefined : "";
  };
  const out: Item = { ...record };
  for (const field of fields) out[field.key] = fill(record[field.key], field);
  return out;
}

describe("asStored", () => {
  it("puts back what the form filled in where the record had nothing", () => {
    const stored = { id: "a", options: "", tags: [], nested: { b: 1 } };
    const saved = { id: "a", options: [], tags: [], nested: { b: 1, note: "", flag: false, list: [] }, description: "", passive: [], is_removed: false };
    assert.deepEqual(asStored(stored, saved), stored);
  });

  it("keeps the stored order of keys, at every level, and new keys after", () => {
    const stored = { b: 1, a: { y: 1, x: 2 }, list: [{ q: 1, p: 2 }] };
    const saved = { a: { x: 2, y: 1 }, b: 1, c: 3, list: [{ p: 2, q: 1 }] };
    assert.equal(JSON.stringify(asStored(stored, saved)), JSON.stringify({ b: 1, a: { y: 1, x: 2 }, list: [{ q: 1, p: 2 }], c: 3 }));
  });

  it("keeps real edits: cleared values, emptied lists, new content and coercions", () => {
    const stored = { name: "x", list: [1], age: "60", options: "", flag: true };
    const saved = { name: "", list: [], age: 60, options: [{ value: "On" }], flag: false };
    assert.deepEqual(asStored(stored, saved), saved);
    // A value removed by the form (a cleared number) stays removed; a blank the record had stays.
    assert.deepEqual(asStored({ armor: 5, suffix: "" }, {}), { suffix: "" });
  });

  it("pairs list items by id, so removing one leaves the others' blanks alone", () => {
    const stored = { perks: [{ id: "a", description: "x" }, { id: "b" }] };
    const saved = { perks: [{ id: "b", description: "" }] };
    assert.deepEqual(asStored(stored, saved), { perks: [{ id: "b" }] });
  });

  it("pairs a renamed item with the one at its place, and a new one with none", () => {
    const stored = { perks: [{ id: "a", params: { x: 1 } }, { id: "groggy", params: { level: 3 } }] };
    const saved = { perks: [{ id: "a", params: { x: 1 } }, { id: "groggy-2", description: "", params: { level: 3, note: "", off: false } }, { id: "new", description: "" }] };
    assert.deepEqual(asStored(stored, saved), { perks: [{ id: "a", params: { x: 1 } }, { id: "groggy-2", params: { level: 3 } }, { id: "new", description: "" }] });
  });

  it("keeps a new key with a value, such as the schema_id the mode editor gives a record without one", () => {
    assert.deepEqual(asStored({ id: "push" }, { id: "push", schema_id: "mode-base" }), { id: "push", schema_id: "mode-base" });
  });

  it("keeps a blank the schema requires at the top level: a required checkbox left unticked", () => {
    const fields: DynamicField[] = [
      { key: "is_symmetric", label: "S", type: "boolean", required: true },
      { key: "ranked", label: "R", type: "boolean", required: false },
    ];
    const schema = modeRecordSchema(fields);
    assert.deepEqual(asStored({ id: "push", name: "Push" }, { id: "push", name: "Push", is_symmetric: false, ranked: false }, schema), { id: "push", name: "Push", is_symmetric: false });
  });
});

describe("saving Ana without touching her", () => {
  it("changes nothing but the numbers stored as text (F2), key order included", () => {
    const fields: DynamicField[] = fixture("schemas/hero-hero.json").fields;
    const schema = heroRecordSchema(fields);
    const ana = fixture("heroes/ana.json");
    // A perk stored with fewer keys, as Ana's added "groggy" major perk in the harness.
    ana.major_perks.push({ id: "groggy", name: "Groggy (major)", type: "Major Perk", params: { unlock_level: 3 } });
    const output = schema.parse(formValues(ana, fields)) as Item;
    const saved = asStored(ana, keepUnknownKeys(ana, output, schema), schema);

    const expected = structuredClone(ana);
    for (const age of expected.ages) age.age = Number(age.age);
    for (const xp of expected.perk_level_xp) xp.xp_required = Number(xp.xp_required);
    assert.equal(JSON.stringify(saved, null, 2), JSON.stringify(expected, null, 2));
    // Without asStored, the form's fill-ins and the schema's key order were saved.
    assert.notEqual(JSON.stringify(keepUnknownKeys(ana, output, schema)), JSON.stringify(expected));
  });
});
