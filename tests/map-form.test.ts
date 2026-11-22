import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAP_OWN_KEYS, mapToSave, newMap, openedMap } from "../app/lib/map-form";
import { mapRecordSchema } from "../app/lib/record-schema";

import type { DynamicField, DynamicSchemaFile } from "../app/schemas/dynamic-schema";

const FIELDS: DynamicField[] = [
  { key: "description", label: "Description", type: "string", required: false },
  { key: "map_type", label: "Map Type", type: "enum", required: true, globalEnumId: "map-types" },
  { key: "location", label: "Location", type: "string", required: false },
  { key: "route", label: "Route", type: "object_array", required: false, subFields: [{ key: "label", label: "Stage", type: "string", required: true }] },
];
const BASE: DynamicSchemaFile = { id: "map-base", name: "Base", category: "map", fields: FIELDS };
const OTHER: DynamicSchemaFile = { id: "map-other", name: "Other", category: "map", fields: [] };

const STORED = { id: "kings-row", game: "overwatch", name: "King's Row", game_modes: ["hybrid"], map_type: "hybrid", legacy_note: "kept", location: "London" };

/** What the form gives a save for `values`: the strict schema's output, as useMapSave parses it. */
const parsedOf = (values: Record<string, unknown>) => mapRecordSchema(FIELDS).parse(values) as Record<string, unknown>;

void describe("a new map's form", () => {
  void it("starts blank in the page's game, naming no schema while there's only one", () => {
    assert.deepEqual(newMap("overwatch", [BASE]), { game: "overwatch", id: "", name: "" });
    assert.deepEqual(newMap("overwatch", []), { game: "overwatch", id: "", name: "" });
  });

  void it("starts on the first schema when there are several to pick from", () => {
    assert.deepEqual(newMap("overwatch", [BASE, OTHER]), { game: "overwatch", id: "", name: "", schema_id: "map-base" });
  });
});

void describe("a stored map's form", () => {
  void it("holds the map as its inputs do, keeping the keys it has no input for", () => {
    const opened = openedMap(STORED, FIELDS);
    assert.deepEqual(opened, { ...STORED, description: "", route: [] });
    assert.deepEqual(MAP_OWN_KEYS, ["id", "name"]);
  });
});

void describe("saving a stored map", () => {
  const schema = mapRecordSchema(FIELDS);
  // The form refuses a map with keys the schema doesn't list (UnknownKeysNotice): one it can save has none.
  const stored = Object.fromEntries(Object.entries(STORED).filter(([key]) => key !== "legacy_note"));
  const listed = openedMap(stored, FIELDS);

  void it("writes nothing when nothing changed", () => {
    assert.equal(mapToSave(stored, parsedOf(listed), schema), undefined);
  });

  void it("changes only what was edited: the file's key order and its legacy game_modes stay", () => {
    const saved = mapToSave(stored, parsedOf({ ...listed, name: "King's Row (Night)" }), schema);
    assert.equal(JSON.stringify(saved), JSON.stringify({ ...stored, name: "King's Row (Night)" }));
  });

  void it("keeps a cleared value's key, blank, in its place, and adds a new value after the file's keys", () => {
    const saved = mapToSave(stored, parsedOf({ ...listed, location: "", description: "Rainy" }), schema);
    assert.equal(JSON.stringify(saved), JSON.stringify({ ...stored, location: "", description: "Rainy" }));
  });
});
