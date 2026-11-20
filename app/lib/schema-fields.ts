import { slugify } from "./slug";

import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

// A schema's fields as the schema editor changes them (app/components/schema-editor).
// A field is found by its path: its index, then each sub-field's index below it.
// Every change returns new lists and leaves the old ones as they were.

/** Where a field is: [index], or [index, subIndex, …] for a sub-field at any depth. */
export type FieldPath = readonly number[];

/** What a field's input can set. */
export type FieldValue = string | boolean | string[] | undefined;

/** A label as a key: lowercase letters, digits and underscores ("Max Health" → "max_health"). */
function slugKey(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/(?:^_|_$)/gu, "");
}

/** A key the editor made up for a new sub-field: field_2, sub_field_1, sub_sub_field_3… */
const GENERATED_KEY = /^(?:sub_)*field_\d+$/u;

/**
 * Whether a field's key still follows its label as the label is typed: while
 * it is blank, the old label's slug, or a key the editor made up. Never for a
 * key the saved schema has (`savedKeys`): records store values under it, and
 * renaming it would leave them behind (hero-hero's sub_role).
 */
function keyFollowsLabel(field: DynamicField, savedKeys: ReadonlySet<string>): boolean {
  if (savedKeys.has(field.key)) {
    return false;
  }
  return field.key === "" || field.key === slugKey(field.label) || GENERATED_KEY.test(field.key);
}

/** One setting of a field, changed: which, to what, and the keys of the saved schema (never renamed). */
export interface FieldChange {
  setting: keyof DynamicField;
  value: FieldValue;
  savedKeys: ReadonlySet<string>;
}

/** `field` with one of its settings changed: options from the textarea's lines, a label that its key may follow. */
function editedField(field: DynamicField, { setting, value, savedKeys }: FieldChange): DynamicField {
  if (setting === "options") {
    return { ...field, options: typeof value === "string" && value !== "" ? value.split("\n").map((line) => line.trim()) : undefined };
  }
  if (setting === "label") {
    const label = typeof value === "string" ? value : "";
    return { ...field, label, ...(keyFollowsLabel(field, savedKeys) && { key: slugKey(label) }) };
  }
  return { ...field, [setting]: value };
}

/** `fields` with the field at `path` replaced by `change(field)`. */
function changeFieldAt(fields: readonly DynamicField[], path: FieldPath, change: (field: DynamicField) => DynamicField): DynamicField[] {
  const [index, ...rest] = path;
  return fields.map((field, at) => {
    if (at !== index) {
      return field;
    }
    return rest.length === 0 ? change(field) : { ...field, subFields: changeFieldAt(field.subFields ?? [], rest, change) };
  });
}

/** `fields` with one setting of the field at `path` changed. */
export function updateFieldAt(fields: readonly DynamicField[], path: FieldPath, change: FieldChange): DynamicField[] {
  return changeFieldAt(fields, path, (field) => editedField(field, change));
}

/** `fields` and a new, blank field at the end. */
export function addField(fields: readonly DynamicField[]): DynamicField[] {
  return [...fields, { key: "", label: "", type: "string", required: false }];
}

/** `fields` with a new sub-field under the field at `path`, keyed sub_field_N (sub_sub_field_N a level down, …). */
export function addSubFieldAt(fields: readonly DynamicField[], path: FieldPath): DynamicField[] {
  return changeFieldAt(fields, path, (parent) => {
    const subFields = parent.subFields ?? [];
    const key = `${"sub_".repeat(path.length)}field_${String(subFields.length + 1)}`;
    return { ...parent, subFields: [...subFields, { key, label: "New Sub-Field", type: "string", required: false }] };
  });
}

/** `fields` without the field at `path`. */
export function removeFieldAt(fields: readonly DynamicField[], path: FieldPath): DynamicField[] {
  const parentPath = path.slice(0, -1);
  const index = path.at(-1);
  if (parentPath.length === 0) {
    return fields.filter((_field, at) => at !== index);
  }
  return changeFieldAt(fields, parentPath, (parent) => ({ ...parent, subFields: (parent.subFields ?? []).filter((_field, at) => at !== index) }));
}

/**
 * `fields` with the field at `path` taking a unit typed in each record
 * (hasCustomSuffix). Its own unit stays: it shows when a record's is blank.
 */
export function setCustomSuffixAt(fields: readonly DynamicField[], path: FieldPath, checked: boolean): DynamicField[] {
  return changeFieldAt(fields, path, (field) => ({ ...field, hasCustomSuffix: checked }));
}

/** `fields` with the field at `path` reading its options from a global enum, or from its own list (""). */
export function setGlobalEnumAt(fields: readonly DynamicField[], path: FieldPath, enumId: string): DynamicField[] {
  return changeFieldAt(fields, path, (field) => (enumId === "" ? { ...field, globalEnumId: undefined } : { ...field, globalEnumId: enumId, options: undefined }));
}

/** Options as saved: each trimmed, blank ones dropped. */
function trimmedOptions(field: DynamicField): DynamicField {
  return field.options ? { ...field, options: field.options.map((option) => option.trim()).filter(Boolean) } : field;
}

/** `fields` as saved: options trimmed and blank ones dropped, at any depth. */
export function cleanOptions(fields: readonly DynamicField[]): DynamicField[] {
  return fields.map((field) => {
    const cleaned = trimmedOptions(field);
    return cleaned.subFields ? { ...cleaned, subFields: cleanOptions(cleaned.subFields) } : cleaned;
  });
}

/** `current` with `incoming` merged in: a field with a key already there replaces it, the others are added at the end. */
export function mergeFields(current: readonly DynamicField[], incoming: readonly DynamicField[]): DynamicField[] {
  const merged = [...current];
  for (const field of incoming) {
    const at = merged.findIndex((existing) => existing.key === field.key);
    if (at >= 0) {
      merged[at] = field;
    } else {
      merged.push(field);
    }
  }
  return merged;
}

/** Every key a schema's fields use, at any depth: those a record may already store a value under. */
export function savedKeysOf(fields: readonly DynamicField[]): Set<string> {
  return new Set(fields.flatMap((field) => [field.key, ...savedKeysOf(field.subFields ?? [])]));
}

/** A new schema's id: its category, then its name as a slug ("hero-base-hero-attributes"). */
export function newSchemaId(category: string, name: string): string {
  return `${category}-${slugify(name)}`;
}

/**
 * The category a new schema starts in: the first configured one that has a
 * schema already, else the first configured one ("hero" with none at all).
 */
export function defaultCategory(categories: readonly { category: string }[], schemas: readonly Pick<DynamicSchemaFile, "category">[]): string {
  const withSchema = categories.find((entry) => schemas.some((schema) => schema.category === entry.category));
  if (withSchema) {
    return withSchema.category;
  }
  return categories.length > 0 ? categories[0].category : "hero";
}

/** What Export gives for a schema being made: its name ("(untitled)" without one), category and fields; named after its name. */
export function newSchemaExport(draft: { name: string; category: string; fields: readonly DynamicField[] }): { json: unknown; fileName: string } {
  const name = draft.name.trim() || "(untitled)";
  return { json: { name, category: draft.category, fields: draft.fields }, fileName: `${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}.json` };
}

/** What Export gives for a saved schema being edited: the file with the fields as they are now, named after its id. */
export function savedSchemaExport(schema: DynamicSchemaFile, fields: readonly DynamicField[]): { json: unknown; fileName: string } {
  return { json: { ...schema, fields }, fileName: `${schema.id}.json` };
}

/** `text` as JSON, or null when it isn't. */
function parsedJson(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    // Not JSON: the caller says so.
  }
  return null;
}

/** A schema pasted or uploaded for import: its fields, name and category when it has them; null when it isn't JSON. */
export function importedSchema(text: string): { fields?: DynamicField[]; name?: unknown; category?: unknown } | null {
  const parsed = parsedJson(text);
  if (parsed === null || parsed.value === null) {
    return null;
  }
  const json = parsed.value;
  if (typeof json !== "object") {
    return {};
  }
  const { fields, name, category } = json as Record<string, unknown>;
  return { ...(Array.isArray(fields) && { fields: fields as DynamicField[] }), name, category };
}

/**
 * Where "Fetch Fields" reads a reference's records, as an api() path: a
 * category's folder through the directory listing (records with content), or
 * an enum as it is. Null for an endpoint that isn't the admin API's.
 */
export function referenceListPath(endpoint: string, game: string): string | null {
  const resolved = endpoint.replace("{game}", game);
  const match = /^\/api\/([^/]+)\/(.+)$/u.exec(resolved);
  if (!match) {
    return null;
  }
  const [, owner, subpath] = match;
  if (resolved.includes("data/directory") || resolved.includes("enums/")) {
    return resolved.slice("/api/".length);
  }
  return `data/directory?game=${encodeURIComponent(owner)}&subpath=${encodeURIComponent(subpath)}&includeContent=true`;
}

/** The keys of a reference list's first record, from a list or a { data } / { items } answer; null when it has none. */
export function fieldKeysOf(answer: unknown): string[] | null {
  const box = typeof answer === "object" && answer !== null && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};
  const list = [answer, box.data, box.items].find(Array.isArray) as unknown[] | undefined;
  const first: unknown = list?.[0];
  return typeof first === "object" && first !== null ? Object.keys(first) : null;
}

/** Why a schema didn't pass its check, as the editor says it: every issue on the page, the first in a toast. */
export function validationMessages(issues: readonly { path: readonly PropertyKey[]; message: string }[]): { detail: string; first: string } {
  const detail = issues.map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`).join(", ");
  return { detail: `Validation failed: ${detail}`, first: `Validation failed: ${issues.length > 0 ? issues[0].message : "undefined"}` };
}
