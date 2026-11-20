import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addField,
  addSubFieldAt,
  cleanOptions,
  defaultCategory,
  fieldKeysOf,
  importedSchema,
  mergeFields,
  newSchemaExport,
  newSchemaId,
  referenceListPath,
  removeFieldAt,
  savedKeysOf,
  savedSchemaExport,
  setCustomSuffixAt,
  setGlobalEnumAt,
  updateFieldAt,
  validationMessages,
} from "../app/lib/schema-fields";

import type { DynamicField, DynamicSchemaFile } from "../app/schemas/dynamic-schema";

// The schema editor's changes to a schema's fields (app/lib/schema-fields.ts),
// shared by New and Edit. A key names where every record stores the field's
// value, so the editor may move it with the label only while nothing can have
// stored a value under it yet.

const NONE = new Set<string>();
const field = (key: string, label: string, extra: Partial<DynamicField> = {}): DynamicField => ({ key, label, type: "string", required: false, ...extra });
const labelled = (fields: DynamicField[], path: number[], label: string) => updateFieldAt(fields, path, { setting: "label", value: label, savedKeys: NONE });
const labelledSaved = (fields: DynamicField[], path: number[], label: string) => updateFieldAt(fields, path, { setting: "label", value: label, savedKeys: savedKeysOf(fields) });

void describe("a field's key, as its label is typed", () => {
  void it("follows the label while it is blank, the old label's slug, or a generated default", () => {
    assert.equal(labelled([field("", "")], [0], "Max Health")[0]?.key, "max_health");
    assert.equal(labelled([field("max_health", "Max Health")], [0], "Max HP")[0]?.key, "max_hp");
    assert.equal(labelled([field("sub_field_1", "New Sub-Field")], [0], "Stage Name")[0]?.key, "stage_name");
    const nested = [field("stages", "Stages", { type: "object_array", subFields: [field("x", "X", { type: "object_array", subFields: [field("sub_sub_field_2", "New Sub-Field")] })] })];
    assert.equal(labelled(nested, [0, 0, 0], "Wave")[0]?.subFields?.[0]?.subFields?.[0]?.key, "wave");
  });

  void it("stays when it was typed by hand", () => {
    assert.equal(labelled([field("hp", "Max Health")], [0], "Health")[0]?.key, "hp");
  });

  void it("stays when it only looks like a generated one", () => {
    assert.equal(labelled([field("battlefield_role", "Role")], [0], "Main Role")[0]?.key, "battlefield_role");
    assert.equal(labelled([field("sub_role", "Second Role")], [0], "Secondary Role")[0]?.key, "sub_role");
  });

  void it("never moves for a field the saved schema has: records store values under it (hero-hero's sub_role)", () => {
    const saved = [field("role", "Role"), field("sub_role", "Sub Role"), field("health", "Health")];
    assert.equal(labelledSaved(saved, [1], "Secondary Role")[1]?.key, "sub_role");
    assert.equal(labelledSaved(saved, [2], "Base Health")[2]?.key, "health");
    // A field added since still follows.
    const added = updateFieldAt([...saved, field("", "")], [3], { setting: "label", value: "Armor", savedKeys: savedKeysOf(saved) });
    assert.equal(added[3]?.key, "armor");
  });
});

void describe("a field's settings", () => {
  void it("take options one per line, kept as typed until saved, and none for an empty box", () => {
    const [typed] = updateFieldAt([field("role", "Role", { type: "enum" })], [0], { setting: "options", value: "Tank\n Damage \n", savedKeys: NONE });
    assert.deepEqual(typed.options, ["Tank", "Damage", ""]);
    const [cleared] = updateFieldAt([field("role", "Role", { type: "enum", options: ["Tank"] })], [0], { setting: "options", value: "", savedKeys: NONE });
    assert.equal(cleared.options, undefined);
  });

  void it("use a global enum in place of their own options, or their own again", () => {
    const [global] = setGlobalEnumAt([field("role", "Role", { type: "enum", options: ["Tank"] })], [0], "role");
    assert.deepEqual([global.globalEnumId, global.options], ["role", undefined]);
    const [own] = setGlobalEnumAt([field("role", "Role", { type: "enum", options: ["Tank"], globalEnumId: "role" })], [0], "");
    assert.deepEqual([own.globalEnumId, own.options], [undefined, ["Tank"]]);
  });

  void it("keep the field's unit when each record gets its own (the unit shows when a record's is blank)", () => {
    const [custom] = setCustomSuffixAt([field("range", "Range", { type: "number", unit: "m" })], [0], true);
    assert.deepEqual([custom.hasCustomSuffix, custom.unit], [true, "m"]);
  });

  void it("change a copy, never the lists they were given", () => {
    const original = [field("stages", "Stages", { type: "object_array", subFields: [field("name", "Name")] })];
    const before = structuredClone(original);
    updateFieldAt(original, [0, 0], { setting: "label", value: "Title", savedKeys: NONE });
    addSubFieldAt(original, [0, 0]);
    removeFieldAt(original, [0, 0]);
    assert.deepEqual(original, before);
  });
});

void describe("adding and removing fields", () => {
  void it("adds a blank field, and sub-fields keyed by their depth and count", () => {
    assert.deepEqual(addField([]), [field("", "")]);
    const stages = addSubFieldAt(addSubFieldAt([field("stages", "Stages", { type: "object_array" })], [0]), [0]);
    assert.deepEqual(stages[0]?.subFields?.map((sub) => [sub.key, sub.label]), [
      ["sub_field_1", "New Sub-Field"],
      ["sub_field_2", "New Sub-Field"],
    ]);
    const deeper = addSubFieldAt(updateFieldAt(stages, [0, 1], { setting: "type", value: "object_array", savedKeys: NONE }), [0, 1]);
    assert.equal(deeper[0]?.subFields?.[1]?.subFields?.[0]?.key, "sub_sub_field_1");
  });

  void it("removes a field at any depth", () => {
    const fields = [field("a", "A"), field("stages", "Stages", { type: "object_array", subFields: [field("x", "X"), field("y", "Y")] })];
    assert.deepEqual(removeFieldAt(fields, [0]).map((kept) => kept.key), ["stages"]);
    assert.deepEqual(removeFieldAt(fields, [1, 0])[1]?.subFields?.map((kept) => kept.key), ["y"]);
  });
});

void describe("a schema's fields as saved", () => {
  void it("have their options trimmed and blank ones dropped, at any depth", () => {
    const deep = [
      field("role", "Role", { type: "enum", options: [" Tank ", "", "Damage"] }),
      field("stages", "Stages", {
        type: "object_array",
        subFields: [
          field("kind", "Kind", { type: "enum", options: ["a ", ""] }),
          field("waves", "Waves", { type: "object_array", subFields: [field("tier", "Tier", { type: "list", options: [" low", "", "high "] })] }),
        ],
      }),
    ];
    const cleaned = cleanOptions(deep);
    assert.deepEqual(cleaned[0]?.options, ["Tank", "Damage"]);
    assert.deepEqual(cleaned[1]?.subFields?.[0]?.options, ["a"]);
    assert.deepEqual(cleaned[1]?.subFields?.[1]?.subFields?.[0]?.options, ["low", "high"]);
  });
});

void describe("importing fields", () => {
  void it("replaces a field with the same key, and adds the others at the end", () => {
    const merged = mergeFields([field("a", "A"), field("b", "B")], [field("b", "B2"), field("c", "C")]);
    assert.deepEqual(merged.map((kept) => [kept.key, kept.label]), [
      ["a", "A"],
      ["b", "B2"],
      ["c", "C"],
    ]);
  });

  void it("reads a pasted or uploaded schema: null when it isn't JSON, no fields when it has no list of them", () => {
    assert.equal(importedSchema("{ not json"), null);
    assert.equal(importedSchema("null"), null);
    assert.deepEqual(importedSchema("5"), {});
    assert.deepEqual(importedSchema('{"name":"Gear","category":"item","fields":"none"}'), { name: "Gear", category: "item" });
    assert.deepEqual(importedSchema('{"fields":[{"key":"a"}]}'), { fields: [{ key: "a" }], name: undefined, category: undefined });
  });
});

void describe("a new schema", () => {
  const categories = [{ category: "hero" }, { category: "map" }, { category: "news" }];

  void it("is made in the first configured category that has a schema", () => {
    assert.equal(defaultCategory(categories, [{ category: "news" }, { category: "map" }]), "map");
    assert.equal(defaultCategory([{ category: "patch" }, { category: "news" }], [{ category: "news" }]), "news");
  });

  void it("is made in the first configured category when none has a schema yet", () => {
    assert.equal(defaultCategory([{ category: "patch" }, { category: "news" }], []), "patch");
  });

  void it("takes its id from its category and name", () => {
    assert.equal(newSchemaId("hero", "Base Hero Attributes"), "hero-base-hero-attributes");
  });

  void it("exports its name, category and fields as they are, named after it", () => {
    assert.deepEqual(newSchemaExport({ name: "  Base Gear ", category: "item", fields: [field("a", "A")] }), {
      json: { name: "Base Gear", category: "item", fields: [field("a", "A")] },
      fileName: "base-gear.json",
    });
    assert.equal(newSchemaExport({ name: " ", category: "item", fields: [] }).fileName, "-untitled-.json");
  });
});

void describe("a saved schema's export", () => {
  void it("has the edits made since it was loaded, and keeps the keys the editor doesn't show", () => {
    const saved = { id: "hero-hero", name: "Hero", category: "hero", fields: [field("role", "Role")], cronConfig: { every: "day" } } as DynamicSchemaFile;
    const edited = [field("role", "Role"), field("armor", "Armor")];
    assert.deepEqual(savedSchemaExport(saved, edited), { json: { ...saved, fields: edited }, fileName: "hero-hero.json" });
  });
});

void describe("Fetch Fields", () => {
  void it("reads a category's records through the directory listing, and an enum as it is", () => {
    assert.equal(referenceListPath("/api/{game}/heroes", "overwatch"), "data/directory?game=overwatch&subpath=heroes&includeContent=true");
    assert.equal(referenceListPath("/api/overwatch/enums/role", "overwatch"), "overwatch/enums/role");
    assert.equal(referenceListPath("https://example.com/heroes", "overwatch"), null);
  });

  void it("lists the keys of the first record, from a list or a { data } or { items } answer", () => {
    assert.deepEqual(fieldKeysOf([{ id: "ana", name: "Ana" }]), ["id", "name"]);
    assert.deepEqual(fieldKeysOf({ data: [{ id: "a" }] }), ["id"]);
    assert.deepEqual(fieldKeysOf({ items: [{ slug: "b" }] }), ["slug"]);
    assert.equal(fieldKeysOf([]), null);
    assert.equal(fieldKeysOf(["ana"]), null);
    assert.equal(fieldKeysOf({ id: "role", options: [] }), null);
  });
});

void describe("a schema that fails its check", () => {
  void it("says every issue on the page, and the first in a toast", () => {
    const issues = [
      { path: ["fields", 0, "key"], message: "Keys must be lowercase alphanumeric and underscores" },
      { path: ["name"], message: "Too small" },
    ];
    assert.deepEqual(validationMessages(issues), {
      detail: "Validation failed: fields.0.key: Keys must be lowercase alphanumeric and underscores, name: Too small",
      first: "Validation failed: Keys must be lowercase alphanumeric and underscores",
    });
  });
});
