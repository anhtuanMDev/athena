import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enumFormDefaults, normalizedFields, openedMode, recordFormDefaults, reviewOfSave } from "../app/lib/form-defaults";
import { EnumSchema } from "../app/schemas/enum";

import type { DynamicField } from "../app/schemas/dynamic-schema";
import type { GlobalEnum } from "../app/schemas/enum";

// A record as its form holds it the moment it opens (app/lib/form-defaults.ts):
// what the form's inputs fill in for keys the record leaves out, and the
// stored values they convert. Taken as the form's starting values, an
// untouched record opens unchanged; the conversions a save writes are listed
// apart from the user's edits.

const field = (key: string, type: DynamicField["type"], extra: Partial<DynamicField> = {}): DynamicField => ({ key, label: key, type, required: false, ...extra });

void describe("an enum's form, as it opens", () => {
  const role: GlobalEnum = {
    id: "role",
    name: "Role",
    options: [
      { id: "damage", name: "Damage", description: "Hits", params: [{ id: "bonus", label: "Bonus", value: "-30", suffix: "%", type: "number" }, { id: "note", label: "Note", value: "fast", type: "string" }] },
      { id: "support", name: "Support" },
    ],
  };

  void it("gives every option a params list, and the enum and its options a description", () => {
    const opened = enumFormDefaults(role);
    assert.equal(opened.description, "");
    assert.deepEqual(opened.options[1], { id: "support", name: "Support", description: "", icon: undefined, params: [] });
    assert.equal(Object.hasOwn(opened.options[1], "icon"), true);
  });

  void it("holds a number param's value as a number, as its field does, and fills in a param's missing suffix and type", () => {
    const [bonus, note] = enumFormDefaults(role).options[0].params ?? [];
    assert.equal(bonus.value, -30);
    assert.deepEqual(note, { id: "note", label: "Note", value: "fast", suffix: "", type: "string" });
    const untyped = enumFormDefaults({ ...role, options: [{ id: "a", name: "A", params: [{ id: "x", label: "X", value: 3 } as never] }] }).options[0].params?.[0];
    assert.deepEqual(untyped, { id: "x", label: "X", value: 3, suffix: "", type: "string" });
  });

  void it("leaves out nothing the enum had", () => {
    assert.equal(enumFormDefaults({ ...role, options: [{ id: "a", name: "A", icon: "/api/assets/x.png", params: [] }] }).options[0].icon, "/api/assets/x.png");
  });
});

void describe("a hero's or mode's form, as it opens", () => {
  const fields = [
    field("bio", "string"),
    field("health", "number"),
    field("armor", "number", { hasCustomSuffix: true }),
    field("playable", "boolean"),
    field("role", "enum", { globalEnumId: "role" }),
    field("aliases", "object_array", { subFields: [field("alias", "string"), field("main", "boolean")] }),
    field("abilities", "abilities", { subFields: [field("cooldown", "number", { hasCustomSuffix: true }), field("removed", "boolean"), field("kind", "enum", { options: ["a"] })] }),
  ];

  void it("fills in what the form's inputs show for missing keys: text empty, a number empty, a box unticked, a list empty", () => {
    const opened = recordFormDefaults({ id: "ana", name: "Ana" }, fields, ["name", "real_name"]);
    assert.deepEqual(Object.keys(opened).sort(), ["abilities", "aliases", "armor", "armor_suffix", "bio", "health", "id", "name", "playable", "real_name", "role"].sort());
    assert.deepEqual([opened.bio, opened.armor_suffix, opened.playable, opened.aliases, opened.abilities, opened.real_name], ["", "", false, [], [], ""]);
    assert.ok(Number.isNaN(opened.health) && Number.isNaN(opened.armor));
    // A picker (a Controller) fills in nothing, but the form holds its key.
    assert.equal(opened.role, undefined);
  });

  void it("holds a number stored as text as a number, as its field does", () => {
    assert.equal(recordFormDefaults({ health: "175" }, fields, []).health, 175);
    assert.equal(recordFormDefaults({ health: 0 }, fields, []).health, 0);
  });

  void it("fills in a list item's and an ability's inputs too", () => {
    const opened = recordFormDefaults({ aliases: [{ alias: "Lena" }], abilities: [{ id: "blink", name: "Blink", params: { cooldown: 3 } }] }, fields, []);
    assert.deepEqual(opened.aliases, [{ alias: "Lena", main: false }]);
    assert.deepEqual(opened.abilities, [{ id: "blink", name: "Blink", _clientId: "", description: "", type: "", params: { cooldown: 3, cooldown_suffix: "", removed: false, kind: undefined } }]);
    assert.equal(Object.hasOwn((opened.abilities as { params: object }[])[0].params, "kind"), true);
  });
});

void describe("a mode's form, as it opens", () => {
  const fields = [field("description", "string"), field("team_size", "number"), field("trivia", "string"), field("objective_type", "enum", { globalEnumId: "map-types" }), field("overtime_enabled", "boolean")];

  void it("holds what its inputs show for the optional fields the mode leaves out, so an untouched mode opens unchanged", () => {
    const opened = openedMode({ id: "push", name: "Push", description: "Push the robot.", team_size: 5, schema_id: "mode-base" }, fields);
    assert.deepEqual({ ...opened, objective_type: "picker" }, { id: "push", name: "Push", description: "Push the robot.", team_size: 5, schema_id: "mode-base", trivia: "", overtime_enabled: false, objective_type: "picker" });
    assert.equal(Object.hasOwn(opened, "objective_type"), true);
  });

  void it("fills in the mode's own text inputs, as its name and description fields show them", () => {
    assert.deepEqual(openedMode({ id: "push", team_size: 5 }, []), { id: "push", name: "", description: "", team_size: 5 });
  });
});

void describe("what a save normalizes", () => {
  void it("lists each stored value the form converted, by where it is", () => {
    const stored = { options: [{ id: "damage", params: [{ id: "bonus", value: "-30" }, { id: "x", value: 3 }] }], health: "175", name: "Ana" };
    const untouched = { options: [{ id: "damage", params: [{ id: "bonus", value: -30 }, { id: "x", value: 3, type: "string" }] }], health: 175, name: "Ana" };
    assert.deepEqual(normalizedFields(stored, untouched), [
      { path: "options.0.params.0.value", from: "-30", to: -30 },
      { path: "options.0.params.1.type", from: undefined, to: "string" },
      { path: "health", from: "175", to: 175 },
    ]);
  });

  void it("lists nothing for a record the form keeps as it is", () => {
    assert.deepEqual(normalizedFields({ a: [1, { b: "x" }] }, { a: [1, { b: "x" }] }), []);
  });
});

void describe("a review of a save", () => {
  const stored = { id: "role", name: "Role", options: [{ id: "damage", name: "Damage", params: [{ id: "bonus", label: "Bonus", value: "-30", type: "number" }] }] };
  const opened = enumFormDefaults(stored as GlobalEnum);

  void it("tells the user's edits apart from what the save normalizes", () => {
    const saved = { ...stored, name: "Roles", options: [{ ...stored.options[0], params: [{ ...stored.options[0].params[0], value: -30, suffix: undefined }] }] };
    const review = reviewOfSave({ stored, opened, saved, schema: EnumSchema });
    assert.deepEqual(review.edits.map((edit) => edit.path), ["name"]);
    assert.deepEqual(review.normalized, [{ path: "options.0.params.0.value", from: "-30", to: -30 }]);
  });

  void it("takes every change as an edit when the stored record doesn't pass its check", () => {
    const broken = { ...stored, id: "Not An Id" };
    const review = reviewOfSave({ stored: broken, opened: enumFormDefaults(broken as GlobalEnum), saved: { ...broken, name: "Roles" }, schema: EnumSchema });
    assert.deepEqual(review.edits.map((edit) => edit.path), ["name"]);
    assert.deepEqual(review.normalized, []);
  });
});
