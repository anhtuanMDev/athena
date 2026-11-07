import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { cellText, keyColumns, schemaColumns, schemaForRecord, type ColumnSchema } from "../app/lib/record-columns";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}`, import.meta.url), "utf8"));
const HERO = fixture("schemas/hero-hero.json") as ColumnSchema;
const TWO_FORM: ColumnSchema = { id: "hero-two-form-hero", category: "hero", fields: [{ key: "form", label: "Form", type: "enum", options: ["Bastion", "Sentry"] }] };
const ANA = fixture("heroes/ana.json");
const BAPTISTE = fixture("heroes/baptiste.json");
// As zero-backend stores them (data/overwatch/enums).
const ENUMS = [
  { id: "role", options: [{ id: "damage", name: "Damage" }, { id: "support", name: "Support" }, { id: "tank", name: "Tank" }] },
  { id: "sub-role", options: [{ id: "tactician", name: "Tactician" }, { id: "medic", name: "Medic" }] },
];

describe("a records list's columns, from their schema", () => {
  it("are the first 3 top-level fields a cell can show, in schema order, but id, name and pictures", () => {
    const schema: ColumnSchema = {
      id: "s",
      category: "hero",
      fields: [
        { key: "id", type: "string" },
        { key: "name", type: "string" },
        { key: "portrait", type: "string" },
        { key: "background_image", type: "string" },
        { key: "kit", type: "abilities" },
        { key: "aliases", type: "object_array" },
        { key: "rivals", type: "reference_list" },
        { key: "role", label: "Role", type: "enum", globalEnumId: "role" },
        { key: "tags", label: "Tags", type: "list" },
        { key: "health", label: "Health", type: "number" },
        { key: "flies", label: "Flies", type: "boolean" },
      ],
    };
    assert.deepEqual(schemaColumns([schema], [{ id: "a" }])?.map((f) => f.key), ["role", "tags", "health"]);
    // The hero schema of the fixtures.
    assert.deepEqual(schemaColumns([HERO, TWO_FORM], [ANA, BAPTISTE])?.map((f) => f.key), ["hero_name", "real_name", "status"]);
  });

  it("follow the schemas the records follow: each record's schema_id, else the category's first", () => {
    assert.equal(schemaForRecord({ schema_id: "hero-two-form-hero" }, [HERO, TWO_FORM])?.id, "hero-two-form-hero");
    assert.equal(schemaForRecord({}, [HERO, TWO_FORM])?.id, "hero-hero");
    assert.equal(schemaForRecord({ schema_id: "gone" }, [TWO_FORM, HERO])?.id, "hero-two-form-hero");
    // A list of two-form heroes alone starts with that schema's fields.
    assert.deepEqual(schemaColumns([HERO, TWO_FORM], [{ id: "bastion", schema_id: "hero-two-form-hero" }, ANA])?.map((f) => f.key), ["form", "hero_name", "real_name"]);
  });

  it("are left to the records' own keys when there is no schema of theirs", () => {
    assert.equal(schemaColumns([], [ANA]), null);
    assert.equal(schemaColumns([{ ...HERO, fields: [] }], [ANA]), null);
  });
});

describe("a records list's columns without a schema", () => {
  it("are the first 3 keys holding a value a cell can show, never a list of objects", () => {
    const exclude = ["id", "name", "game", "kit", "weapon", "abilities", "schema_id", "real_name", "bio", "portrait"];
    assert.deepEqual(keyColumns([ANA, BAPTISTE], exclude), ["difficulty", "health", "hero_name"]);
    // aliases is a list of objects, which showed as "[object Object]".
    assert.deepEqual(keyColumns([{ id: "x", aliases: [{ alias: "A" }], tags: ["a", "b"], empty: [], n: 1 }], exclude), ["tags", "empty", "n"]);
  });
});

describe("a records list's cells", () => {
  it("name an enum's or options' value as the app does, and lists of them", () => {
    const field = (key: string) => HERO.fields.find((f) => f.key === key);
    assert.equal(cellText(field("role"), ANA.role, ENUMS), "Support");
    assert.equal(cellText(field("sub_role"), BAPTISTE.sub_role, ENUMS), "Tactician");
    assert.equal(cellText(field("difficulty"), "Hard", ENUMS), "Hard");
    assert.equal(cellText({ key: "roles", type: "list", globalEnumId: "role" }, ["tank", "healer"], ENUMS), "Tank, healer");
  });

  it("show the value as stored when there is nothing to name it by", () => {
    assert.equal(cellText({ key: "role", type: "enum", globalEnumId: "role" }, "support", []), "support");
    assert.equal(cellText(undefined, ["a", "b"], ENUMS), "a, b");
    assert.equal(cellText(undefined, true, ENUMS), "Yes");
    assert.equal(cellText({ key: "health", type: "number" }, 250, ENUMS), "250");
    assert.equal(cellText(undefined, undefined, ENUMS), "");
  });
});
