import { asStored } from "./as-stored";
import { computeDiff } from "./diff";
import { keepUnknownKeys } from "./unknown-keys";

import type { DiffEntry } from "./diff";
import type { DynamicField } from "~/schemas/dynamic-schema";
import type { EnumOption, EnumParam, GlobalEnum } from "~/schemas/enum";

// A record as its form holds it the moment it opens. react-hook-form fills
// in what each registered input shows for a key the record leaves out (empty
// text, an unticked box, an empty list) and converts a value as its input
// does (a number field's text to a number). Taken as the form's starting
// values, an untouched record opens unchanged, so Review and Preview wait
// for an edit. The conversions a save then writes are listed apart from the
// user's edits (normalizedFields). The rules follow the form-field
// components: DynamicFieldsRenderer, AbilitiesField, ObjectArrayField and the
// enum editor's option and param rows.

/** Fields whose input is a Controller: it fills in no value, but the form then holds the key (undefined when missing). */
const CONTROLLED = new Set(["reference", "reference_list", "enum", "list"]);
const ABILITY_LISTS = new Set(["abilities", "weapon"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What a registered input holds: its value, or `blank` (empty text, an unticked box) for a missing one. */
const filled = (value: unknown, blank: unknown) => (value === undefined ? blank : value);

type Entry = [string, unknown];

/** A number field's value as its input holds it (react-hook-form's valueAsNumber): text read as a number. */
function asNumber(value: unknown): unknown {
  if (value === undefined || value === "") {
    return Number.NaN;
  }
  return value ? Number(value) : value;
}

/** A list field's value: an empty list for a missing one, and each entry as its row holds it. */
function listOf(value: unknown, entry: (item: unknown) => unknown): unknown {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value.map(entry) : value;
}

/** A field's unit, typed next to its value as <key>_suffix. */
const suffixEntries = (source: Record<string, unknown>, field: DynamicField): Entry[] =>
  field.hasCustomSuffix ? [[`${field.key}_suffix`, filled(source[`${field.key}_suffix`], "")]] : [];

/**
 * What a sub-field's input holds (a list entry's, an ability param's): a
 * picker (a Controller) the key as it is, a box ticked or not, otherwise text,
 * with its unit.
 */
function inputEntries(source: Record<string, unknown>, field: DynamicField): Entry[] {
  if (CONTROLLED.has(field.type)) {
    return [[field.key, source[field.key]]];
  }
  if (field.type === "boolean") {
    return [[field.key, filled(source[field.key], false)]];
  }
  return [[field.key, filled(source[field.key], "")], ...suffixEntries(source, field)];
}

/** An object list's entry as its row holds it (ObjectArrayField). */
function entryOf(item: unknown, subFields: readonly DynamicField[]): unknown {
  if (!isRecord(item)) {
    return item;
  }
  const entries = subFields.flatMap((sub): Entry[] =>
    sub.type === "object_array" ? [[sub.key, listOf(item[sub.key], (nested) => entryOf(nested, sub.subFields ?? []))]] : inputEntries(item, sub),
  );
  return { ...item, ...Object.fromEntries(entries) };
}

/** An ability's params as its row holds them: each sub-field's key. */
function paramsOf(params: unknown, subFields: readonly DynamicField[]): unknown {
  if (subFields.length === 0 || (params !== undefined && !isRecord(params))) {
    return params;
  }
  const source = params ?? {};
  return { ...source, ...Object.fromEntries(subFields.flatMap((sub) => inputEntries(source, sub))) };
}

/** An ability as its row holds it (AbilitiesField): its name, description, type (typed when it has no options) and params. */
function abilityOf(item: unknown, field: DynamicField): unknown {
  if (!isRecord(item)) {
    return item;
  }
  // A type picked from the schema's options is a Controller; otherwise it's typed.
  const type = (field.options?.length ?? 0) > 0 ? item.type : filled(item.type, "");
  const ability = { ...item, id: item.id, _clientId: filled(item._clientId, ""), name: filled(item.name, ""), description: filled(item.description, ""), type };
  const params = paramsOf(item.params, field.subFields ?? []);
  return params === undefined ? ability : { ...ability, params };
}

/** What one field of a record's form holds, as DynamicFieldsRenderer's input does. */
function fieldEntries(source: Record<string, unknown>, field: DynamicField): Entry[] {
  if (ABILITY_LISTS.has(field.type)) {
    return [[field.key, listOf(source[field.key], (item) => abilityOf(item, field))]];
  }
  if (field.type === "object_array") {
    return [[field.key, listOf(source[field.key], (item) => entryOf(item, field.subFields ?? []))]];
  }
  if (field.type === "number") {
    return [[field.key, asNumber(source[field.key])], ...suffixEntries(source, field)];
  }
  return inputEntries(source, field);
}

/**
 * A hero's or mode's values as its form holds them when it opens: `fields`
 * are those the dynamic fields show, `textKeys` the form's own text inputs
 * (a hero's name and real name).
 */
export function recordFormDefaults(record: Record<string, unknown>, fields: readonly DynamicField[], textKeys: readonly string[]): Record<string, unknown> {
  const texts = textKeys.map((key): Entry => [key, filled(record[key], "")]);
  return { ...record, ...Object.fromEntries([...texts, ...fields.flatMap((field) => fieldEntries(record, field))]) };
}

/** A mode's keys its form edits with inputs of its own, not as the schema's fields (DynamicFieldsRenderer skips them). */
export const MODE_OWN_KEYS = ["id", "name", "description"];

/** A stored mode as its Edit form holds it when it opens: the schema's fields it shows, and its own id, name and description. */
export function openedMode(values: Record<string, unknown>, fields: readonly DynamicField[]): Record<string, unknown> {
  return recordFormDefaults(values, fields.filter((field) => !MODE_OWN_KEYS.includes(field.key)), MODE_OWN_KEYS);
}

/** A param's value as its input holds it: a box for a boolean; a number param's text as a number. */
function paramValue(value: unknown, type: string): unknown {
  if (type === "boolean") {
    return filled(value, false);
  }
  if (value === undefined) {
    return "";
  }
  return type === "number" && value !== "" ? Number(value) : value;
}

/** A param as its row holds it: its type picker starts on text, its suffix as typed. */
function paramOf(param: EnumParam): EnumParam {
  const type = (param as Partial<EnumParam>).type ?? "string";
  return { ...param, value: paramValue(param.value, type), suffix: param.suffix ?? "", type };
}

/** An option as its row holds it: its icon picker (a Controller) holds the icon's key, missing or not. */
const optionOf = (option: EnumOption): EnumOption => ({ ...option, description: option.description ?? "", icon: option.icon, params: (option.params ?? []).map(paramOf) });

/** An enum as its form holds it when it opens. */
export function enumFormDefaults(data: GlobalEnum): GlobalEnum {
  return { ...data, description: data.description ?? "", options: data.options.map(optionOf) };
}

/** A value a save writes other than the record had it: converted, or filled in with a value. */
export interface NormalizedField {
  path: string;
  from: unknown;
  to: unknown;
}

const isContainer = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Each value `untouched` (what saving the form as it opened writes) holds other than `stored`, by where it is. */
export function normalizedFields(stored: unknown, untouched: unknown, path = ""): NormalizedField[] {
  if (Object.is(stored, untouched)) {
    return [];
  }
  if (isContainer(stored) && isContainer(untouched) && Array.isArray(stored) === Array.isArray(untouched)) {
    const keys = [...new Set([...Object.keys(stored), ...Object.keys(untouched)])];
    return keys.flatMap((key) => normalizedFields(stored[key], untouched[key], path === "" ? key : `${path}.${key}`));
  }
  return [{ path, from: stored, to: untouched }];
}

/** The check a record's save runs (its zod schema): its keys, and whether a record passes. */
interface SaveSchema {
  shape: Record<string, { safeParse: (value: unknown) => { success: boolean } }>;
  safeParse: (value: unknown) => { success: boolean; data?: unknown };
}

/** What saving the form as it opened writes: the stored record, normalized. The stored record itself when the form's values don't pass the check. */
function untouchedSave(stored: Record<string, unknown>, opened: unknown, schema: SaveSchema): unknown {
  const parsed = schema.safeParse(opened);
  if (!parsed.success || !isRecord(parsed.data)) {
    return stored;
  }
  return asStored(stored, keepUnknownKeys(stored, parsed.data, schema), schema);
}

/**
 * A save's review: the user's edits (`saved` against what saving the form as
 * it opened writes), and apart from them what the save normalizes (the stored
 * values the form converts), which an edit writes too.
 */
export function reviewOfSave({ stored, opened, saved, schema }: { stored: Record<string, unknown>; opened: unknown; saved: unknown; schema: SaveSchema }): { edits: DiffEntry[]; normalized: NormalizedField[] } {
  const untouched = untouchedSave(stored, opened, schema);
  return { edits: computeDiff(untouched, saved), normalized: normalizedFields(stored, untouched) };
}
