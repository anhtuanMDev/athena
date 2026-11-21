import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatImportedJson } from "../app/lib/schema-utils";

import type { DynamicField } from "../app/schemas/dynamic-schema";

// An AI's answer as the record forms take it (schema-utils.ts formatImportedJson):
// a list field's values as text, a blank as an empty list, one entry as a list of one.

const field = (key: string, type: DynamicField["type"]): DynamicField => ({ key, label: key, type, required: false });
const FIELDS = [field("tags", "list"), field("maps", "reference_list"), field("rounds", "object_array"), field("kit", "abilities"), field("size", "number")];
const format = (json: Record<string, unknown>) => formatImportedJson(json, FIELDS, "overwatch", false);

void describe("an AI's answer as the form takes it", () => {
  void it("writes a list field's values as text, as String() does", () => {
    assert.deepEqual(format({ tags: ["a", 1, true, null, [2, 3], { x: 1 }] }).tags, ["a", "1", "true", "null", "2,3", "[object Object]"]);
    assert.deepEqual(format({ maps: "colosseo" }).maps, ["colosseo"]);
    assert.deepEqual(format({ maps: 7 }).maps, ["7"]);
  });

  void it("takes a blank as an empty list, and one entry as a list of one", () => {
    for (const blank of ["", null, false, 0]) {
      assert.deepEqual(format({ tags: blank, rounds: blank }), { game: "overwatch", tags: [], rounds: [] });
    }
    assert.deepEqual(format({ rounds: { label: "Final" } }).rounds, [{ label: "Final" }]);
  });

  void it("leaves other fields' values as they are", () => {
    assert.equal(format({ size: "5" }).size, "5");
  });
});
