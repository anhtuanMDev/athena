import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { heroAiPrompt, modeOverrideProblem } from "../app/lib/hero-form";
import { fieldsLeftBehind, importedRecord } from "../app/lib/record-form";
import { heroRecordSchema } from "../app/lib/record-schema";

import type { DynamicField } from "../app/schemas/dynamic-schema";
import type { GlobalEnum } from "../app/schemas/enum";

// The hero editor's logic without React (app/lib/hero-form.ts), and its AI
// import (record-form.ts importedRecord) as a hero.

const field = (key: string, type: DynamicField["type"], extra: Partial<DynamicField> = {}): DynamicField => ({ key, label: key, type, required: false, ...extra });
const FIELDS = [field("role", "enum", { globalEnumId: "role" }), field("kit", "abilities", { subFields: [field("damage", "number")] })];
const ENUMS: GlobalEnum[] = [{ id: "role", name: "Role", options: [{ id: "tank", name: "Tank" }, { id: "support", name: "Support" }] }];

void describe("an AI import into the hero form", () => {
  void it("into a new hero takes the page's game, not the one in the import", () => {
    const imported = importedRecord({ json: { name: "Tracer", game: "valorant" }, fields: FIELDS, game: "overwatch", schemaId: "hero-hero" });
    assert.equal(imported.game, "overwatch");
    assert.equal(imported.id, "tracer");
  });

  void it("follows the schema the form shows, so a save keeps it", () => {
    const imported = importedRecord({ json: { name: "Tracer" }, fields: FIELDS, game: "overwatch", currentId: "tracer", schemaId: "hero-two-form-hero" });
    assert.equal(imported.schema_id, "hero-two-form-hero");
    const asked = importedRecord({ json: { name: "Tracer", schema_id: "hero-hero" }, fields: FIELDS, game: "overwatch", schemaId: "hero-two-form-hero" });
    assert.equal(asked.schema_id, "hero-two-form-hero");
  });

  void it("into the hero being edited keeps its id, and passes the hero check", () => {
    const imported = importedRecord({ json: { id: "lena", name: "Tracer" }, fields: FIELDS, game: "overwatch", currentId: "tracer", schemaId: "hero-hero" });
    assert.equal(imported.id, "tracer");
    assert.equal(heroRecordSchema(FIELDS).safeParse(imported).success, true);
  });
});

void describe("the hero AI prompt", () => {
  const prompt = heroAiPrompt(FIELDS, ENUMS);

  void it("lists the name, real name and each field, an enum field with its options", () => {
    assert.match(prompt, /"key": "real_name"/);
    assert.match(prompt, /"options": \[\n\s+"tank",\n\s+"support"\n\s+\]/);
  });

  void it("says what an ability's params hold, New's as Edit's", () => {
    assert.match(prompt, /The `params` object should contain the specific sub-fields mapped for that field \(if any\)\./);
  });
});

void describe("an ability's mode overrides", () => {
  const record = { kit: [{ id: "blink", name: "Blink", mode_overrides: { push: {}, arena: {} } }] };

  void it("may name only the game's modes: the save names the ability and the mode", () => {
    assert.equal(modeOverrideProblem(FIELDS, record, new Set(["push"])), "Ability 'Blink' references invalid mode override: 'arena'");
    assert.equal(modeOverrideProblem(FIELDS, record, new Set(["push", "arena"])), null);
  });
});

void describe("a hero switched to another schema", () => {
  // The old schema had health as a number; the hero contract's own health is a record of numbers.
  const BASE = [field("role", "enum", { globalEnumId: "role" }), field("health", "number")];
  const OTHER = [field("form", "string")];
  const hero = { id: "echo", game: "overwatch", name: "Echo", role: "damage", health: 200 };

  void it("passes the new schema's check once the old schema's fields are left behind, as a mode does", () => {
    assert.equal(heroRecordSchema(OTHER).safeParse(hero).success, false);
    const left = new Set(fieldsLeftBehind(BASE, OTHER));
    assert.deepEqual([...left], ["role", "health"]);
    const kept = Object.fromEntries(Object.entries(hero).filter(([key]) => !left.has(key)));
    assert.equal(heroRecordSchema(OTHER).safeParse(kept).success, true);
  });
});
