import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { z } from "zod";

import { recordSchemaFor } from "../app/lib/record-schema";
import { buildDynamicZodSchema, type DynamicSchemaFile } from "../app/schemas/dynamic-schema";
import { HeroSchema } from "../app/schemas/hero";
import { MapSchema } from "../app/schemas/map";
import { ModeSchema } from "../app/schemas/mode";

// Real data from the zero-backend repo: its schemas and records on main, and
// two heroes from before they were deleted (baptiste at 6779803, ana).
const FIXTURES = new URL("./fixtures/overwatch/", import.meta.url);
const readFolder = (folder: string) =>
  readdirSync(new URL(folder, FIXTURES))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(`${folder}/${name}`, FIXTURES), "utf8")));

const schemas: DynamicSchemaFile[] = readFolder("schemas");
const records: Record<string, Record<string, unknown>[]> = {
  heroes: readFolder("heroes"),
  modes: readFolder("modes"),
  patches: readFolder("patches"),
  news: readFolder("news"),
};
const CATEGORY: Record<string, string> = { heroes: "hero", maps: "map", modes: "mode", patches: "patch", news: "news", items: "item" };
const schemasOf = (folder: string) => schemas.filter((s) => s.category === CATEGORY[folder]);
const fieldsOf = (folder: string, record: Record<string, unknown>) =>
  (schemasOf(folder).find((s) => s.id === record.schema_id) ?? schemasOf(folder)[0]).fields;

// What each editor validated with before the schemas moved to app/lib/record-schema.ts.
const previous: Record<string, (record: Record<string, unknown>) => z.ZodType> = {
  heroes: (r) => buildDynamicZodSchema(fieldsOf("heroes", r), HeroSchema, ["id", "name", "real_name", "portrait"]),
  modes: (r) => buildDynamicZodSchema(fieldsOf("modes", r), ModeSchema, ["id", "name", "description"]),
  maps: () => buildDynamicZodSchema(schemasOf("maps").flatMap((s) => s.fields), MapSchema, ["name", "id", "game_modes"]).strict(),
  // NewsEditor's form; patches and items had static schemas that no real record matched.
  news: (r) =>
    buildDynamicZodSchema(
      fieldsOf("news", r),
      z.object({ id: z.string().regex(/^(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/) }),
      ["id"],
    ).strict(),
};

const accepts = (folder: string, record: Record<string, unknown>) => recordSchemaFor(folder, schemasOf(folder), record).safeParse(record).success;

// Records written by hand for the categories with no real record left.
const map = {
  id: "kings-row",
  name: "King's Row",
  game: "overwatch",
  map_type: "hybrid",
  location: "London",
  route: [{ label: "Point A", detail: "Courtyard" }],
};
const item = { id: "codebreaker", item_name: "Codebreaker", item_slot_type: "Weapon", rarity: "Epic", cost: 3500, slot_cost: 1 };

/** Ways to break a record: a required field gone, a field of the wrong type, a key no schema has. */
function variants(record: Record<string, unknown>, fields: { key: string; type: string; required?: boolean }[]) {
  const required = fields.find((f) => f.required && f.type === "string" && record[f.key] !== undefined);
  const number = fields.find((f) => f.type === "number" && record[f.key] !== undefined);
  const { [required?.key ?? ""]: _dropped, ...missing } = record;
  return {
    "missing a required field": required ? missing : undefined,
    "a number that isn't one": number ? { ...record, [number.key]: "lots" } : undefined,
    "an unknown key": { ...record, junk: 1 },
    "a list where text goes": required ? { ...record, [required.key]: ["x"] } : undefined,
  };
}

describe("record schemas", () => {
  it("accept every real record", () => {
    for (const [folder, list] of Object.entries(records)) {
      assert.ok(list.length > 0, folder);
      for (const record of list) assert.ok(accepts(folder, record), `${folder}/${record.id}`);
    }
    assert.ok(accepts("maps", map));
    assert.ok(accepts("items", item));
  });

  it("accept and reject what each editor did before", () => {
    const cases: [string, Record<string, unknown>][] = [
      ...records.heroes.map((r): [string, Record<string, unknown>] => ["heroes", r]),
      ...records.modes.map((r): [string, Record<string, unknown>] => ["modes", r]),
      ...records.news.map((r): [string, Record<string, unknown>] => ["news", r]),
      ["maps", map],
    ];
    for (const [folder, record] of cases) {
      const fields = folder === "maps" ? schemasOf("maps").flatMap((s) => s.fields) : fieldsOf(folder, record);
      for (const [name, variant] of Object.entries({ "as saved": record, ...variants(record, fields) })) {
        if (!variant) continue;
        const before = previous[folder](variant).safeParse(variant).success;
        assert.equal(accepts(folder, variant), before, `${folder}/${record.id} ${name}`);
      }
    }
  });

  it("let every record name its schema, which mode, map and news forms refused before", () => {
    for (const [folder, record] of [
      ["modes", records.modes[0]],
      ["maps", map],
      ["news", records.news[0]],
      ["patches", records.patches[0]],
      ["items", item],
    ] as const) {
      const withSchema = { ...record, schema_id: schemasOf(folder)[0].id };
      assert.ok(accepts(folder, withSchema), folder);
      if (previous[folder]) assert.equal(previous[folder](withSchema).safeParse(withSchema).success, false, `${folder} before`);
      assert.equal(accepts(folder, { ...record, schema_id: 3 }), false, `${folder} with a numeric schema_id`);
    }
  });

  it("check patches and items against their dynamic schema, not the old static one", () => {
    const patch = records.patches[0];
    const { title: _title, ...untitled } = patch;
    assert.equal(accepts("patches", untitled), false);
    assert.equal(accepts("patches", { ...patch, changes: [] }), false);
    assert.equal(accepts("patches", { patch: "2026.07", date: "2026-07-01", changes: [{ hero: "ana", field: "x" }] }), false);
    assert.equal(accepts("items", { ...item, cost: "lots" }), false);
    assert.equal(accepts("items", { ...item, effects: [] }), false);
  });

  it("pick the record's schema by schema_id, else the category's first", () => {
    const twoForm = { id: "x", name: "X", game: "overwatch", schema_id: "hero-two-form-hero" };
    assert.ok(accepts("heroes", twoForm)); // that schema has no required fields
    assert.equal(accepts("heroes", { ...twoForm, schema_id: undefined }), false); // hero-hero needs hero_name, role…
  });
});
