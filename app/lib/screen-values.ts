import { isReferenceField } from "./reference-labels";

import type { FieldOption } from "./screen-model";

// A field's value as the app shows it: with its unit, and as field_section shows it (zms FieldValue).

/** A record's own unit sits next to the value, in "<key>_suffix". */
const SUFFIX = "_suffix";

/** Fields whose value is a list of entries: a field_section shows them; as text the app reads "[object Object]". */
const ENTRY_LISTS = new Set(["object_array", "abilities", "weapon"]);

/** How the preview names references and enum values (ScreenEdit's lookups, the app's rules). */
export interface ValueNames {
  /** A reference's record label, and whether the section opens it; none when the app shows the id. */
  reference: (field: FieldOption, id: string) => { label: string; linked: boolean } | undefined;
  /** An enum value's option name; none when the app shows the value. */
  enumName: (field: FieldOption, value: unknown) => string | undefined;
}

/** The names, and what holds the value (the record or an entry), where its own unit sits. */
export interface ValueSource extends ValueNames {
  container?: unknown;
}

/** One entry of a list (zms ObjectList): its title, a kit entry's type and description, then a row per sub-field with a value. */
export interface EntryView {
  title?: string;
  subtitle?: string;
  text?: string;
  rows: { label: string; value: ValueView }[];
}

export type ValueView =
  | { kind: "text"; text: string; linked?: boolean }
  | { kind: "chips"; chips: { text: string; linked: boolean }[] }
  | { kind: "entries"; entries: EntryView[] }
  | { kind: "pairs"; pairs: string[] };

/** What the app leaves out of a screen (zms isEmptyValue): nothing, empty text, an empty list. */
export function isEmptyValue(value: unknown): boolean {
  const isEmptyList = Array.isArray(value) && value.length === 0;
  return isEmptyList || value === undefined || value === null || value === "";
}

export function isEntryList(field: { type: string } | undefined): boolean {
  return field !== undefined && ENTRY_LISTS.has(field.type);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** What the app leaves out (zms isEmptyValue): an empty object too. */
function isBlank(value: unknown): boolean {
  return isEmptyValue(value) || (isPlainObject(value) && Object.keys(value).length === 0);
}

/** A record's own unit for `key` ("cooldown_suffix"), which the app never shows as a value of its own. */
function isSuffixKey(entry: Record<string, unknown>, key: string): boolean {
  return key.endsWith(SUFFIX) && Object.hasOwn(entry, key.slice(0, -SUFFIX.length));
}

/** A value as text, the way String() writes it. */
function asText(value: unknown): string {
  return String(value);
}

function isScalar(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/** A field that shows with a unit: not an enum, nor a global enum's value. */
function takesUnit(field: FieldOption | undefined): field is FieldOption {
  return field !== undefined && field.type !== "enum" && !field.globalEnumId;
}

/** The record's own unit for a field, trimmed; empty when the field has none or the record leaves it blank. */
function ownSuffix(field: FieldOption, container: unknown): string {
  if (!field.hasCustomSuffix || !container || typeof container !== "object") {
    return "";
  }
  const own = field.key.split(".").pop() ?? "";
  const raw = (container as Record<string, unknown>)[`${own}${SUFFIX}`];
  return typeof raw === "string" ? raw.trim() : "";
}

function isNumeric(field: FieldOption, value: string | number): boolean {
  if (field.type !== "number") {
    return false;
  }
  return typeof value === "number" || (value.trim() !== "" && Number.isFinite(Number(value)));
}

/**
 * A record value as the app shows it: with the record's own suffix when the field
 * has hasCustomSuffix and "<key>_suffix" (next to the value in `container`) isn't
 * blank, else with the field's unit for numbers. Enums and other values are left
 * as they are. The app renders units by the same rule (F3).
 */
export function valueWithUnit(field: FieldOption | undefined, value: unknown, container: unknown): unknown {
  if (!takesUnit(field) || !isScalar(value) || value === "") {
    return value;
  }
  const suffix = ownSuffix(field, container);
  if (suffix && (field.type === "number" || field.type === "string")) {
    return `${String(value)} ${suffix}`;
  }
  return isNumeric(field, value) && field.unit ? `${String(value)} ${field.unit}` : value;
}

/** A number field's value stored as text, as the number it is. */
function numberOf(field: FieldOption, raw: unknown): unknown {
  if (field.type !== "number" || typeof raw !== "string") {
    return raw;
  }
  return raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
}

/** A scalar as the app writes it (zms formatScalar): Yes/No, numbers to two decimals, with the unit or the record's own. */
function scalarText(field: FieldOption, raw: unknown, container: unknown): string {
  const value = numberOf(field, raw);
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(valueWithUnit(field, Number.isInteger(value) ? value : Number(value.toFixed(2)), container));
  }
  if (typeof value === "string") {
    return String(valueWithUnit(field, value, container));
  }
  return JSON.stringify(value);
}

function referenceOf(field: FieldOption, id: unknown, names: ValueNames) {
  return isReferenceField(field) ? names.reference(field, String(id)) : undefined;
}

function chipOf(field: FieldOption, entry: unknown, names: ValueNames): { text: string; linked: boolean } {
  if (field.globalEnumId) {
    return { text: names.enumName(field, entry) ?? String(entry), linked: false };
  }
  const target = referenceOf(field, entry, names);
  return { text: target?.label ?? String(entry), linked: Boolean(target?.linked) };
}

function textAt(item: Record<string, unknown>, key: string): string | undefined {
  const value = item[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Rows for the sub-fields of `entry` that have a value (zms EntryRows). */
function entryRows(fields: FieldOption[], entry: Record<string, unknown>, names: ValueNames): EntryView["rows"] {
  return fields.flatMap((sub) => {
    const value = valueView(sub, entry[sub.key], { ...names, container: entry });
    return value ? [{ label: sub.label ?? sub.key, value }] : [];
  });
}

/** An ability or weapon: its name, type and description, then its sub-fields from params (zms KitEntry). */
function kitEntryView(item: Record<string, unknown>, subFields: FieldOption[], names: ValueNames): EntryView {
  const view: EntryView = { rows: [] };
  const title = textAt(item, "name");
  const subtitle = textAt(item, "type");
  const text = textAt(item, "description");
  if (title) {
    view.title = title;
  }
  if (subtitle) {
    view.subtitle = subtitle;
  }
  if (text) {
    view.text = text;
  }
  view.rows = entryRows(subFields, isPlainObject(item.params) ? item.params : {}, names);
  return view;
}

function entryView(field: FieldOption, item: unknown, names: ValueNames): EntryView {
  if (!isPlainObject(item)) {
    return { title: String(item), rows: [] };
  }
  const subFields = field.subFields ?? [];
  if (field.type === "abilities" || field.type === "weapon") {
    return kitEntryView(item, subFields, names);
  }
  // The first text sub-field reads as the entry's title (a tip, an alias…).
  const titleField = subFields.find((sub) => sub.type === "string");
  const title = titleField ? (item[titleField.key] ?? item.name) : item.name;
  const view: EntryView = { rows: [] };
  if (!isBlank(title)) {
    view.title = String(title);
  }
  view.rows = entryRows(
    subFields.filter((sub) => sub !== titleField),
    item,
    names,
  );
  return view;
}

function listView(field: FieldOption, value: unknown[], names: ValueNames): ValueView {
  if (value.every(isScalar)) {
    return { kind: "chips", chips: value.map((entry) => chipOf(field, entry, names)) };
  }
  return { kind: "entries", entries: value.map((item) => entryView(field, item, names)) };
}

function pairsView(value: Record<string, unknown>): ValueView {
  const pairs = Object.entries(value).filter(([key, entry]) => !isBlank(entry) && !isSuffixKey(value, key));
  return { kind: "pairs", pairs: pairs.map(([key, entry]) => `${key}: ${typeof entry === "object" ? JSON.stringify(entry) : asText(entry)}`) };
}

function singleView(field: FieldOption, value: unknown, names: ValueSource): ValueView {
  if (field.type === "enum") {
    return { kind: "chips", chips: [{ text: names.enumName(field, value) ?? String(value), linked: false }] };
  }
  if (isPlainObject(value)) {
    return pairsView(value);
  }
  if (isReferenceField(field)) {
    const target = referenceOf(field, value, names);
    return { kind: "text", text: target?.label ?? String(value), linked: Boolean(target?.linked) };
  }
  return { kind: "text", text: scalarText(field, value, names.container) };
}

/**
 * A field's value as the app's field_section shows it (zms FieldValue): a
 * reference by its record's label, an enum value by its option's name, a list
 * of scalars as chips, a list of entries as entries whose sub-fields show the
 * same way. Null when the app shows nothing. `names.container` holds the value
 * (the record or an entry), where its own unit sits.
 */
export function valueView(field: FieldOption, value: unknown, names: ValueSource): ValueView | null {
  if (isBlank(value)) {
    return null;
  }
  return Array.isArray(value) ? listView(field, value, names) : singleView(field, value, names);
}
