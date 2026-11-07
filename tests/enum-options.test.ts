import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { enumOptions, enumParamText, fieldOptions, findEnumOption } from "../app/lib/enum-options";

// The role enum as zero-backend stores it: params typed as text and numbers, suffixes with spaces.
const ROLE = {
  id: "role",
  name: "role",
  options: [
    {
      id: "damage",
      name: "Damage",
      description: "Damaging an enemy temporarily reduces their healing received.",
      params: [
        { id: "healing_modification", label: "Healing modification", value: "-15", suffix: "% received ", type: "number" },
        { id: "duration", label: "Duration", value: 3, suffix: "seconds", type: "number" },
        { id: "blank", label: "Blank", value: "  ", type: "string" },
        { id: "unlabelled", label: "", value: 1, type: "number" },
        { id: "passive", label: "Passive", value: false, type: "boolean" },
      ],
    },
    { id: "support", name: "Support", description: "", params: [] },
    "Tank",
    { name: "Flex" },
    { description: "no id or name" },
    7,
  ],
};

describe("enum options, as the app reads them", () => {
  it("keeps each option's description, icon and the params that have something to show", () => {
    const options = enumOptions(ROLE);
    assert.deepEqual(options.map((o) => o.id), ["damage", "support", "Tank", "Flex"]);
    assert.deepEqual(options[0], {
      id: "damage",
      name: "Damage",
      description: "Damaging an enemy temporarily reduces their healing received.",
      params: [
        { id: "healing_modification", label: "Healing modification", value: "-15", suffix: "% received" },
        { id: "duration", label: "Duration", value: 3, suffix: "seconds" },
        { id: "passive", label: "Passive", value: false },
      ],
    });
    // A blank description and no params leave nothing to show.
    assert.deepEqual(options[1], { id: "support", name: "Support" });
    assert.deepEqual(options[2], { id: "Tank", name: "Tank" });
    assert.deepEqual(enumOptions(null), []);
    assert.deepEqual(enumOptions({ options: "damage" }), []);
  });

  it("shows a param's value with its suffix, and flags as Yes or No", () => {
    const [heal, duration, passive] = enumOptions(ROLE)[0].params!;
    assert.equal(enumParamText(heal), "-15 % received");
    assert.equal(enumParamText(duration), "3 seconds");
    assert.equal(enumParamText(passive), "No");
  });

  it("finds a value's option by id, else by name in any case", () => {
    const options = enumOptions(ROLE);
    assert.equal(findEnumOption(options, "damage")?.name, "Damage");
    assert.equal(findEnumOption(options, "SUPPORT")?.id, "support");
    assert.equal(findEnumOption(options, "healer"), undefined);
    assert.equal(findEnumOption(options, undefined), undefined);
    assert.equal(findEnumOption(enumOptions({ options: [{ id: "5", name: "Five" }] }), 5)?.name, "Five");
  });

  it("names the map types the Modes and Maps lists show", () => {
    const mapTypes = JSON.parse(readFileSync(new URL("./fixtures/overwatch/enums/map-types.json", import.meta.url), "utf8"));
    assert.equal(findEnumOption(enumOptions(mapTypes), "push")?.name, "Push");
    assert.equal(findEnumOption(enumOptions(mapTypes), "flashpoint")?.name, "Flashpoint");
  });

  it("gives a field its global enum's options, else its own, as the app does", () => {
    const enums = [ROLE, { id: "other", options: ["x"] }];
    assert.deepEqual(fieldOptions({ globalEnumId: "role" }, enums).map((o) => o.name), ["Damage", "Support", "Tank", "Flex"]);
    assert.deepEqual(fieldOptions({ options: ["Easy", "Hard"] }, enums), [{ id: "Easy", name: "Easy" }, { id: "Hard", name: "Hard" }]);
    // The enum isn't there (yet): no options, so the value shows as stored.
    assert.deepEqual(fieldOptions({ globalEnumId: "sub-role" }, enums), []);
    assert.deepEqual(fieldOptions({ globalEnumId: "role" }, []), []);
    assert.deepEqual(fieldOptions({}, enums), []);
  });
});
