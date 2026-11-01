import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { z } from "zod";

import { buildDynamicZodSchema, type DynamicField } from "../app/schemas/dynamic-schema";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}`, import.meta.url), "utf8"));
const base = z.object({ id: z.string() });

describe("list entries", () => {
  it("store numbers typed into a form, or saved as text, as numbers (ana's ages and perk XP)", () => {
    const heroSchema = fixture("schemas/hero-hero.json");
    const fields = heroSchema.fields.filter((f: DynamicField) => ["ages", "perk_level_xp"].includes(f.key));
    const ana = fixture("heroes/ana.json");
    const parsed = buildDynamicZodSchema(fields, base).parse({ id: "ana", ages: ana.ages, perk_level_xp: ana.perk_level_xp }) as Record<string, any>;
    assert.deepEqual(parsed.ages, [
      { context: "Overwatch", age: 60 },
      { context: "Overwatch 2", age: 62 },
    ]);
    assert.equal(parsed.perk_level_xp[0].xp_required, 2025);
    assert.equal(parsed.perk_level_xp[0].perk_type, "Minpr"); // other values untouched
  });

  it("drop empty numbers from ability params and keep everything else (mauga's Overrun)", () => {
    const fields: DynamicField[] = [
      {
        key: "abilities",
        label: "Abilities",
        type: "abilities",
        required: true,
        subFields: [
          { key: "cooldown", label: "Cooldown", type: "number", required: false, hasCustomSuffix: true },
          { key: "healing", label: "Healing", type: "number", required: false },
          { key: "keybind", label: "Keybind", type: "string", required: false },
        ],
      },
    ];
    const overrun = {
      id: "overrun",
      name: "Overrun",
      type: "Ability",
      params: { keybind: "LSHIFT", cooldown: "5", cooldown_suffix: "s", healing: "", effect_type: "Movement", keywords: [{ keyword: "Movement" }] },
    };
    const parsed = buildDynamicZodSchema(fields, base).parse({ id: "mauga", abilities: [overrun] }) as Record<string, any>;
    // As saved: JSON leaves out the emptied number.
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.abilities[0].params)), {
      keybind: "LSHIFT",
      cooldown: 5,
      cooldown_suffix: "s",
      effect_type: "Movement",
      keywords: [{ keyword: "Movement" }],
    });
  });

  it("coerce numbers in nested entries", () => {
    const fields: DynamicField[] = [
      {
        key: "settings",
        label: "Settings",
        type: "object_array",
        required: false,
        subFields: [{ key: "options", label: "Options", type: "object_array", required: false, subFields: [{ key: "weight", label: "Weight", type: "number", required: false }] }],
      },
    ];
    const parsed = buildDynamicZodSchema(fields, base).parse({ id: "x", settings: [{ options: [{ weight: "1.5" }, { weight: 2 }] }] });
    assert.deepEqual(parsed.settings, [{ options: [{ weight: 1.5 }, { weight: 2 }] }]);
  });

  it("report text that isn't a number instead of saving it, or dropping the whole list", () => {
    const fields: DynamicField[] = [
      { key: "checkpoints", label: "Checkpoints", type: "object_array", required: false, subFields: [{ key: "distance", label: "Distance", type: "number", required: false }] },
    ];
    const result = buildDynamicZodSchema(fields, base).safeParse({ id: "push", checkpoints: [{ distance: "60" }, { distance: "far" }] });
    assert.equal(result.success, false);
    assert.deepEqual(result.error!.issues[0].path, ["checkpoints", 1, "distance"]);
    assert.equal(result.error!.issues[0].message, "Must be a number");
  });

  it("treat a missing optional list as empty, and still require required ones", () => {
    const optional: DynamicField[] = [{ key: "tips", label: "Tips", type: "object_array", required: false, subFields: [{ key: "tip", label: "Tip", type: "string", required: true }] }];
    for (const tips of [undefined, null, ""]) {
      assert.equal(buildDynamicZodSchema(optional, base).parse({ id: "x", tips }).tips, undefined);
    }
    // Required sub-fields stay unenforced in the editors; the importer checks them on publish.
    assert.deepEqual(buildDynamicZodSchema(optional, base).parse({ id: "x", tips: [{}] }).tips, [{}]);
    const required: DynamicField[] = [{ ...optional[0], required: true }];
    assert.equal(buildDynamicZodSchema(required, base).safeParse({ id: "x", tips: [] }).success, false);
  });
});
