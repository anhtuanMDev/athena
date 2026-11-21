import { findEnumOption, type EnumOptionView } from "~/lib/enum-options";
import { isReferenceField } from "~/lib/reference-labels";
import {
  bindingPath,
  bindingScope,
  isBinding,
  normalizeSource,
  valueView,
  valueWithUnit,
  type FieldOption,
  type RecordSource,
  type ScreenBlock,
  type ValueView,
} from "~/lib/screen-model";

import { ownEntry } from "./own-entry";

import type { PreviewContext, PreviewProps } from "../types";

// What a block's preview reads from the screen's data, kept apart from its markup.

/** Entries a list shows before "N more": the preview is a sketch, as with other lists' first ones. */
export const PREVIEW_ENTRIES = 4;

/** Records a carousel's cards show. */
export const CAROUSEL_CARDS = 3;

/** Records a grid shows. */
export const GRID_RECORDS = 6;

/** Pictures a gallery shows. */
export const GALLERY_PICTURES = 3;

/** Props a block without a preview of its own lists. */
export const GENERIC_PROPS = 6;

/** The stats a stat row has: stat1Value … stat4Value. */
const STAT_COUNT = 4;

const STAT_SLOTS = Array.from({ length: STAT_COUNT }, (_, i) => i + 1);

/** The prop a list block's entries show, by block type. */
const ITEM_PROPS: Partial<Record<string, string>> = { route_timeline: "itemLabel", gallery: "itemImage", tips_card: "itemText" };

/** A field read from data: the fields it may be, the data, and its path there. */
interface BoundRead {
  fields: FieldOption[];
  data: unknown;
  path: string;
}

/** A field_section's field, value, and how the app shows it. */
export interface FieldSection {
  path: string | undefined;
  field: FieldOption | undefined;
  value: unknown;
  /** The enum option a single enum value is. */
  option: EnumOptionView | undefined;
  /** A reference's ids, or a list of them. */
  ids: string[] | null;
  /** Whether the app opens the references it shows (linkReferences). */
  isLinking: boolean;
  /** A list of entries, as cards. */
  entries: ValueView | null;
}

/** A label, or its stand-in when it has none. */
export function labelOr(label: string | null | undefined, fallback: string): string {
  if (label) {
    return label;
  }
  return fallback;
}

/** An info row's value: read from the screen's data when bound ("data.<path>"), else its own text. */
export function infoRowValue(ctx: PreviewContext, value: unknown): unknown {
  if (!isBinding(value)) {
    return value;
  }
  return boundValue(ctx, { fields: ctx.dataFields, data: ctx.data, path: bindingPath(value) });
}

export function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function textOf(value: unknown): string {
  return String(value);
}

export function resolvePath(data: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), data);
}

/** A bound value as the app's bindings resolve it: a reference by its record's label, an enum value by its option's name. */
export function named(ctx: PreviewContext, field: FieldOption | undefined, value: unknown): unknown {
  if (typeof value !== "string" && typeof value !== "number") {
    return value;
  }
  if (field && isReferenceField(field)) {
    return ctx.reference(field, String(value))?.label ?? value;
  }
  return findEnumOption(ctx.enumOptions(field), value)?.name ?? value;
}

/** A bound value with its unit or the record's custom suffix, as the app shows it (F3). */
function withUnit({ fields, data, path }: BoundRead, value: unknown): unknown {
  const parent = path.includes(".") ? resolvePath(data, path.slice(0, path.lastIndexOf("."))) : data;
  return valueWithUnit(
    fields.find((field) => field.key === path),
    value,
    parent,
  );
}

/** A bound value as the app shows it: named, then with its unit. */
export function boundValue(ctx: PreviewContext, read: BoundRead): unknown {
  const field = read.fields.find((option) => option.key === read.path);
  return withUnit(read, named(ctx, field, resolvePath(read.data, read.path)));
}

/** A prop's value as the block receives it: a bound one read from the data (or the list entry), else its own, else the manifest's default. */
export function propValue({ block, spec, ctx }: PreviewProps, name: string, item?: unknown): unknown {
  const prop = block.props[name];
  if (!isBinding(prop)) {
    return isPresent(prop) ? prop : spec?.props[name]?.default;
  }
  // "item.<path>" is a field of the list's entries, "data.<path>" one of the screen's data.
  const isItem = bindingScope(prop) === "item";
  const fields = isItem ? ctx.itemFieldsFor(block) : ctx.dataFields;
  const value = boundValue(ctx, { fields, data: isItem ? item : ctx.data, path: bindingPath(prop) });
  return isPresent(value) ? value : undefined;
}

/** A value as text: an object as JSON; nothing for no value. */
export function shownText(value: unknown): string | null {
  if (!isPresent(value)) {
    return null;
  }
  return typeof value === "object" ? JSON.stringify(value) : textOf(value);
}

function isScalar(entry: unknown): boolean {
  return typeof entry === "string" || typeof entry === "number";
}

/** A reference value's ids: one, or each of a list; null when it's neither (then it shows as any other value). */
export function referenceIds(value: unknown): string[] | null {
  if (isScalar(value)) {
    return [textOf(value)];
  }
  return Array.isArray(value) && value.every(isScalar) ? value.map(String) : null;
}

/** The records a list block shows: its own source's, else the screen's. */
export function listSourceOf({ block, ctx }: PreviewProps): RecordSource | undefined {
  return normalizeSource(block.props.source) ?? ctx.screenSource;
}

/** A stat row's stats: each set slot's label, and the prop holding its value. */
export function statSlots(block: ScreenBlock): { label: unknown; valueProp: string }[] {
  return STAT_SLOTS.flatMap((slot) => {
    const valueProp = `stat${String(slot)}Value`;
    return block.props[valueProp] === undefined ? [] : [{ label: block.props[`stat${String(slot)}Label`], valueProp }];
  });
}

/** The prop each entry of a route, gallery or tips list shows. */
export function itemPropOf(type: string): string {
  return ownEntry(ITEM_PROPS, type) ?? "itemText";
}

/** A tab bar's tabs, from its comma-separated text. */
export function tabsOf(value: unknown): string[] {
  return textOf(value ?? "")
    .split(",")
    .map((tab) => tab.trim())
    .filter(Boolean);
}

/** A list prop's entries, typed as the preview reads them. */
export function entriesOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A field_section as the app's FieldSection shows it: its field and value, and the enum option, references or entries it shows. */
export function fieldSectionOf(props: PreviewProps, isLinking: boolean): FieldSection {
  const { block, ctx } = props;
  const prop = block.props.field;
  const path = isBinding(prop) ? bindingPath(prop) : undefined;
  const field = path === undefined ? undefined : ctx.dataFields.find((option) => option.key === path);
  const value = path === undefined ? undefined : resolvePath(ctx.data, path);
  const option = field?.type === "enum" ? findEnumOption(ctx.enumOptions(field), value) : undefined;
  // A reference, or a list of them, by its records' labels (the id when there's none), as chips for a list.
  const ids = field && isReferenceField(field) ? referenceIds(value) : null;
  return { path, field, value, option, ids, isLinking, entries: field ? sectionEntries({ ctx, isLinking }, field, value) : null };
}

/** A list of entries (a patch's hero changes) as the app shows it, the references inside by their labels too. */
function sectionEntries({ ctx, isLinking }: { ctx: PreviewContext; isLinking: boolean }, field: FieldOption, value: unknown): ValueView | null {
  if (!Array.isArray(value) || referenceIds(value)) {
    return null;
  }
  return valueView(field, value, {
    reference: (entryField, id) => {
      const found = ctx.reference(entryField, id);
      return found && { label: found.label, linked: isLinking && found.linked };
    },
    enumName: (entryField, entryValue) => findEnumOption(ctx.enumOptions(entryField), entryValue)?.name,
  });
}

/** The manifest's default is the text "false"; a binding gives the record's own value. */
export function isLinkingValue(value: unknown): boolean {
  return value === true || value === "true";
}
