/**
 * The columns a records list (HeroesList) shows besides its picture and name:
 * from the schemas the records follow when they can be read, the first fields
 * a cell can show, in schema order; else the records' own first keys, as the
 * list always chose them. Enum and option values show by their option's name,
 * as the app shows them.
 */
import { fieldOptions, findEnumOption } from "./enum-options";

export interface ColumnField {
  key: string;
  type: string;
  label?: string;
  globalEnumId?: string;
  options?: string[];
}

export interface ColumnSchema {
  id: string;
  category: string;
  fields: ColumnField[];
}

type Row = Record<string, unknown>;

/** The schema a record follows: its schema_id, else the category's first schema (zms schemaForRecord). */
export function schemaForRecord(record: Row, schemas: readonly ColumnSchema[]): ColumnSchema | undefined {
  return schemas.find((s) => s.id === record.schema_id) ?? schemas[0];
}

/** A schema's field by key; none for a schema whose fields aren't a list (a hand-edited file). */
export function fieldOf(schema: ColumnSchema | undefined, key: string): ColumnField | undefined {
  return Array.isArray(schema?.fields) ? schema.fields.find((f) => f?.key === key) : undefined;
}

/** Field types a cell shows in a line: text, a number, yes or no, an enum value, a list of text or enum values. */
const CELL_TYPES = new Set(["string", "number", "boolean", "enum", "list"]);
/** The list's own columns already show these: the record's id and name, and its pictures. */
const SHOWN = new Set(["id", "name"]);
const PICTURE_KEY = /(^|_)(image|portrait|icon|picture|photo|avatar|banner|thumbnail|logo)s?(_url)?$/i;
const isAsset = (value: unknown) => typeof value === "string" && (value.startsWith("/api/assets/") || value.startsWith("assets/"));

/**
 * Up to `max` columns from the schemas `records` follow (each record's, in
 * the order they first appear), their fields in schema order: top-level
 * fields a cell can show, but id, name and pictures. Null when the records
 * follow no schema with such a field: the list then chooses by keys.
 */
export function schemaColumns(schemas: readonly ColumnSchema[], records: readonly Row[], max = 3): ColumnField[] | null {
  const followed = [...new Set(records.map((r) => schemaForRecord(r, schemas)).filter((s): s is ColumnSchema => !!s))];
  const columns: ColumnField[] = [];
  for (const field of followed.flatMap((s) => (Array.isArray(s.fields) ? s.fields : []))) {
    if (columns.length >= max) break;
    if (!field || typeof field.key !== "string" || columns.some((c) => c.key === field.key)) continue;
    if (!CELL_TYPES.has(field.type) || SHOWN.has(field.key) || PICTURE_KEY.test(field.key)) continue;
    if (records.some((r) => isAsset(r[field.key]))) continue;
    columns.push(field);
  }
  return columns.length > 0 ? columns : null;
}

const isScalar = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

/**
 * Without a schema: the first `max` keys of the records, but `exclude`, that
 * hold a value a cell can show (a list of objects showed as "[object Object]").
 */
export function keyColumns(records: readonly Row[], exclude: readonly string[], max = 3): string[] {
  const keys = new Set<string>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (exclude.includes(key)) continue;
      if (isScalar(value) || (Array.isArray(value) && value.every(isScalar))) keys.add(key);
    }
  }
  return [...keys].slice(0, max);
}

/**
 * A record as a list needs it (data/directory's shape=summary): its top-level
 * values that a cell or a picture can show, which are the scalars, the lists
 * of scalars, and the maps of strings (a picture's variants, {"2d": url}).
 * Lists of objects and other nested values (abilities, balance logs) are
 * left out: most of a filled-in hero, and none of what schemaColumns,
 * keyColumns or a list's picture reads. Anything but an object is kept as is.
 */
export function listSummary(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const summary: Row = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null || typeof value !== "object") summary[key] = value;
    else if (Array.isArray(value) ? value.every((v) => v === null || typeof v !== "object") : Object.values(value).every((v) => typeof v === "string")) summary[key] = value;
  }
  return summary;
}

/** A cell's text: an enum's or options' value by its option's name (as stored when there's none), a list's items joined, a flag as Yes or No. */
export function cellText(field: ColumnField | undefined, value: unknown, enums: readonly unknown[]): string {
  const options = field ? fieldOptions(field, enums) : [];
  const one = (v: unknown) => (typeof v === "boolean" ? (v ? "Yes" : "No") : v == null ? "" : (findEnumOption(options, v)?.name ?? String(v)));
  return Array.isArray(value) ? value.map(one).join(", ") : one(value);
}
