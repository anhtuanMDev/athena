import { computeDiff } from "./diff";
import { schemaOf } from "./record-schema";
import { formatImportedJson } from "./schema-utils";
import { slugify } from "./slug";

import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

// What the built-in record editors (modes, heroes) work out without React:
// an AI import as the form takes it, the id a form holds against its name,
// what a save writes, and the values a schema switch leaves behind.
// app/components/mode-editor and hero-editor use them.

/** Keys every record has whatever its schema: a schema switch never drops them. */
const RECORD_KEYS = new Set(["id", "name", "game", "description", "schema_id"]);

/**
 * An AI import as the form takes it, in the page's game whatever the import
 * says, and following the schema the form shows (`schemaId`, the one picked):
 * the import was checked against that schema's fields, and a save keeps it.
 * A new record (no `currentId`) gets an id from its name when the import has
 * none; the record being edited keeps its own, which is its file's name, so
 * an import needs none to pass its check.
 */
export function importedRecord({ json, fields, game, currentId, schemaId }: { json: Record<string, unknown>; fields: DynamicField[]; game: string; currentId?: string; schemaId: string }): Record<string, unknown> {
  const record = { ...formatImportedJson(json, fields, game, currentId === undefined), game, schema_id: schemaId };
  return currentId === undefined ? record : { ...record, id: currentId };
}

/**
 * The id a form holds whatever its name says (useAutoGenerateId): Edit's
 * file name, or the id an AI import gave a new record; none for a new record
 * typed in, whose id follows its name.
 */
export function heldId({ storedId, importedId }: { storedId?: string; importedId?: unknown }): string | undefined {
  return storedId ?? (typeof importedId === "string" && importedId !== "" ? importedId : undefined);
}

/**
 * Edit's values after an AI import: the import over the record's, keeping
 * its id. An import under another schema than the record's (one picked
 * before importing) leaves the values only the old schema's fields had
 * behind, as a switch does (fieldsLeftBehind).
 */
export function editedAfterImport({ current, imported, schemas }: { current: Record<string, unknown>; imported: Record<string, unknown>; schemas: DynamicSchemaFile[] }): Record<string, unknown> {
  const fieldsOf = (schemaId: unknown) => {
    const fields = schemaOf(schemas, schemaId)?.fields;
    return Array.isArray(fields) ? fields : [];
  };
  const dropped = new Set(fieldsLeftBehind(fieldsOf(current.schema_id), fieldsOf(imported.schema_id)));
  const kept = Object.fromEntries(Object.entries(current).filter(([key]) => !dropped.has(key)));
  return { ...kept, ...imported, id: current.id };
}

/**
 * The record to write: `saved`, or nothing when it says what `stored` (the
 * loaded record) already does, so an unchanged save makes no commit and
 * wakes no webhook. A new record (no `stored`) is always written.
 */
export function contentToSave(stored: unknown, saved: unknown): unknown {
  if (stored !== undefined && computeDiff(stored, saved).length === 0) {
    return undefined;
  }
  return saved;
}

/**
 * The form values a switch from one schema to another leaves behind: the
 * fields only the old one has. A strict schema refuses a record holding them,
 * so the form drops them rather than fail to save.
 */
export function fieldsLeftBehind(from: readonly DynamicField[], to: readonly DynamicField[]): string[] {
  const kept = new Set(to.map((entry) => entry.key));
  return from.map((entry) => entry.key).filter((key) => !kept.has(key) && !RECORD_KEYS.has(key));
}

/**
 * The id a new record's name gives it, or null while the id holds: once it's
 * typed (its field touched), or while the form keeps one (`keptId`: Edit's
 * file name, an id an AI import gave).
 */
export function idFromName({ name, isTouched, keptId }: { name: unknown; isTouched: boolean; keptId?: string }): string | null {
  const isKept = keptId !== undefined && keptId !== "";
  if (typeof name !== "string" || name === "" || isTouched || isKept) {
    return null;
  }
  return slugify(name);
}
