import { asStored } from "./as-stored";
import { recordFormDefaults } from "./form-defaults";
import { contentToSave } from "./record-form";
import { schemaOf } from "./record-schema";
import { keepUnknownKeys } from "./unknown-keys";

import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

// What the map editor (app/components/map-editor) works out without React:
// the values its form starts with, and what a save of a stored map writes.

/** A map's keys its form edits with inputs of its own, not as the schema's fields (DynamicFieldsRenderer skips them). */
export const MAP_OWN_KEYS = ["id", "name"];

/**
 * What a new map's form starts with: its game, a blank name and id, and the
 * schema it follows when there are several to pick from. With one, a new map
 * names none, as before the picker.
 */
export function newMap(game: string, schemas: DynamicSchemaFile[]): Record<string, unknown> {
  const picked = schemas.length > 1 ? { schema_id: schemaOf(schemas, undefined)?.id ?? "" } : {};
  return { game, id: "", name: "", ...picked };
}

/** What a map's form starts with: a new map (no `stored`), or the stored one as its form holds it, under the schema it follows. */
export function mapStartingValues(game: string, schemas: DynamicSchemaFile[], stored?: Record<string, unknown>): Record<string, unknown> {
  return stored ? openedMap(stored, schemaOf(schemas, stored.schema_id)?.fields ?? []) : newMap(game, schemas);
}

/** A stored map as its Edit form holds it when it opens (form-defaults.ts): the schema's fields it shows, and its name. */
export function openedMap(stored: Record<string, unknown>, fields: readonly DynamicField[]): Record<string, unknown> {
  return recordFormDefaults(
    stored,
    fields.filter((field) => !MAP_OWN_KEYS.includes(field.key)),
    ["name"],
  );
}

/**
 * The edited map to write over its file: changed only where it was edited
 * (asStored), keys the schema doesn't list kept as they were, in the file's
 * order; nothing when that's what the file says already.
 */
export function mapToSave(stored: Record<string, unknown>, parsed: Record<string, unknown>, schema: NonNullable<Parameters<typeof asStored>[2]>): unknown {
  return contentToSave(stored, asStored(stored, keepUnknownKeys(stored, parsed, schema), schema));
}
