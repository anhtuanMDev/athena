import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contentToSave, editedAfterImport, fieldsLeftBehind, heldId, importedRecord } from "../app/lib/record-form";
import { modeRecordSchema } from "../app/lib/record-schema";

import type { DynamicField, DynamicSchemaFile } from "../app/schemas/dynamic-schema";

// The built-in record editors' logic without React (app/lib/record-form.ts):
// an AI import as the form takes it, what a save writes, and what a schema
// switch leaves behind.

const field = (key: string, type: DynamicField["type"] = "string"): DynamicField => ({ key, label: key, type, required: false });
const MODE_FIELDS = [field("team_size", "number"), field("objective_type", "enum")];

void describe("an AI import", () => {
  void it("into a new record gets an id from its name when it has none", () => {
    const imported = importedRecord({ json: { name: "Flash Point" }, fields: MODE_FIELDS, game: "overwatch", schemaId: "mode-base" });
    assert.equal(imported.id, "flash-point");
    assert.equal(modeRecordSchema(MODE_FIELDS).safeParse(imported).success, true);
  });

  void it("into the record being edited takes its id, so one without an id passes the import's check", () => {
    const imported = importedRecord({ json: { name: "Push", team_size: 5 }, fields: MODE_FIELDS, game: "overwatch", currentId: "push", schemaId: "mode-base" });
    assert.equal(imported.id, "push");
    assert.equal(modeRecordSchema(MODE_FIELDS).safeParse(imported).success, true);
    const renamed = importedRecord({ json: { id: "escort", name: "Push" }, fields: MODE_FIELDS, game: "overwatch", currentId: "push", schemaId: "mode-base" });
    assert.equal(renamed.id, "push");
  });

  void it("keeps the id a new record's import gave", () => {
    const imported = importedRecord({ json: { id: "fp", name: "Flash Point" }, fields: MODE_FIELDS, game: "overwatch", schemaId: "mode-base" });
    assert.equal(imported.id, "fp");
  });

  void it("is in the page's game, whatever the import says", () => {
    assert.equal(importedRecord({ json: { name: "Flash Point", game: "valorant" }, fields: MODE_FIELDS, game: "overwatch", schemaId: "mode-base" }).game, "overwatch");
    assert.equal(importedRecord({ json: { name: "Push", game: "valorant" }, fields: MODE_FIELDS, game: "overwatch", currentId: "push", schemaId: "mode-base" }).game, "overwatch");
  });

  void it("follows the schema the form shows, the one picked rather than the one loaded", () => {
    assert.equal(importedRecord({ json: { name: "Flash Point" }, fields: MODE_FIELDS, game: "overwatch", schemaId: "mode-arena" }).schema_id, "mode-arena");
    const edited = importedRecord({ json: { name: "Push", schema_id: "mode-base" }, fields: MODE_FIELDS, game: "overwatch", currentId: "push", schemaId: "mode-arena" });
    assert.equal(edited.schema_id, "mode-arena");
  });
});

void describe("Edit's values after an AI import", () => {
  const schemas: DynamicSchemaFile[] = [
    { id: "mode-base", name: "Base", category: "mode", fields: MODE_FIELDS },
    { id: "mode-arena", name: "Arena", category: "mode", fields: [field("team_size", "number"), field("arena_size")] },
  ];
  const current = { id: "push", game: "overwatch", schema_id: "mode-base", name: "Push", team_size: 5, objective_type: "push" };

  void it("are the import over the mode's, keeping its id", () => {
    const imported = importedRecord({ json: { name: "Push 2", team_size: 6 }, fields: MODE_FIELDS, game: "overwatch", currentId: "push", schemaId: "mode-base" });
    assert.deepEqual(editedAfterImport({ current, imported, schemas }), { ...current, name: "Push 2", team_size: 6 });
  });

  void it("under a schema picked before the import, leave the old schema's values behind, so a save passes the check", () => {
    const imported = importedRecord({ json: { name: "Push", team_size: 3, arena_size: "small" }, fields: schemas[1].fields, game: "overwatch", currentId: "push", schemaId: "mode-arena" });
    const values = editedAfterImport({ current, imported, schemas });
    assert.equal(values.schema_id, "mode-arena");
    assert.equal("objective_type" in values, false);
    assert.equal(modeRecordSchema(schemas[1].fields).safeParse(values).success, true);
  });
});

void describe("the id a form holds against its name", () => {
  void it("is Edit's file name", () => {
    assert.equal(heldId({ storedId: "push" }), "push");
  });

  void it("is the id an AI import gave a new record, so the name never overwrites it", () => {
    assert.equal(heldId({ importedId: "fp" }), "fp");
  });

  void it("is none for a new record typed in: its id follows its name", () => {
    assert.equal(heldId({}), undefined);
  });
});

void describe("a save of a loaded record", () => {
  const stored = { id: "push", name: "Push", team_size: 5, schema_id: "mode-base" };

  void it("writes nothing when nothing changed, so no commit is made", () => {
    assert.equal(contentToSave(stored, { ...stored }), undefined);
    assert.equal(contentToSave(stored, { schema_id: "mode-base", team_size: 5, name: "Push", id: "push" }), undefined);
  });

  void it("writes the record when anything changed", () => {
    const edited = { ...stored, team_size: 6 };
    assert.deepEqual(contentToSave(stored, edited), edited);
  });

  void it("writes a new record whatever it holds", () => {
    assert.deepEqual(contentToSave(undefined, { id: "a", name: "A" }), { id: "a", name: "A" });
  });
});

void describe("a switch to another schema", () => {
  void it("leaves behind the values of the fields only the old schema had", () => {
    const from = [field("team_size", "number"), field("objective_type", "enum"), field("rounds", "number")];
    const to = [field("team_size", "number"), field("arena_size")];
    assert.deepEqual(fieldsLeftBehind(from, to), ["objective_type", "rounds"]);
  });

  void it("never drops what every record has: its id, name, game, description and schema", () => {
    const from = [field("name"), field("description"), field("game"), field("id"), field("schema_id"), field("rounds", "number")];
    assert.deepEqual(fieldsLeftBehind(from, []), ["rounds"]);
  });
});
