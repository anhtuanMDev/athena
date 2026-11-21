import { DEFAULT_CATEGORIES, type Category } from "./categories";
import { homeFields, sourceFields } from "./screen-fields";
import {
  SCREEN_TYPES,
  folderFor,
  isListField,
  normalizeSource,
  type Categories,
  type FieldOption,
  type SchemaInfo,
  type ScreenBlock,
  type ScreenFile,
  type ScreenType,
} from "./screen-model";
import { isPlainObject } from "./screen-values";

import type { ScreenRef } from "./screen-actions";

// New blocks and screens, how the editors name records and screens, and the starter screens for a category.

/** A new block's id: the time and a few random characters, in base 36. */
const ID_RADIX = 36;
const ID_RANDOM_END = 6;

/** The keys that name a record, in the order the editors try them. */
const LABEL_KEYS = ["name", "title", "hero_name", "item_name", "id"];

const IMAGE_KEY = /(^|_)(image|portrait|picture|photo|thumbnail|banner|icon|art)(_|$)/;
const DATE_KEY = /(^|_)(date|at)$/;
const TITLE_KEY = /_(title|name)$/;
const SUMMARY_KEY = /description|bio|summary|lore/;

/** Stats a starter detail screen shows: the stat row's four slots. */
const STARTER_STATS = 4;

/** List fields a starter detail screen shows. */
const STARTER_LISTS = 3;

export function createBlock(type: string): ScreenBlock {
  const suffix = `${Date.now().toString(ID_RADIX)}${Math.random().toString(ID_RADIX).slice(2, ID_RANDOM_END)}`;
  return { id: `sec_${suffix}`, type, props: {}, visible: true };
}

export function readScreen(raw: unknown): ScreenFile {
  const file = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const type = SCREEN_TYPES.some((option) => option.value === file.type) ? (file.type as ScreenType) : "page";
  return {
    ...file,
    type,
    title: typeof file.title === "string" ? file.title : undefined,
    appearance: file.appearance === "dark" ? "dark" : "light",
    source: normalizeSource(file.source),
    accent: typeof file.accent === "string" ? file.accent : undefined,
    blocks: Array.isArray(file.blocks) ? (file.blocks as ScreenBlock[]) : [],
  };
}

export function recordLabel(record: Record<string, unknown>): string {
  const label = LABEL_KEYS.map((key) => record[key]).find((value): value is string => typeof value === "string" && value !== "");
  return label ?? "Untitled record";
}

/** The game's screens as the listing gives them (each with its file name as id), where actions lead. */
export function screenRefsOf(files: readonly unknown[]): ScreenRef[] {
  return files.flatMap((file): ScreenRef[] => (isPlainObject(file) && typeof file.id === "string" ? [{ id: file.id, type: file.type, source: file.source }] : []));
}

/** The schemas the starters may use: those of categories in categories.json (the app shows no others). */
export function starterSchemas(schemas: SchemaInfo[], categories: readonly Pick<Category, "category">[]): SchemaInfo[] {
  return schemas.filter((schema) => categories.some((entry) => entry.category === schema.category));
}

/**
 * What "data.<path>" can read on a screen, as the app gives it (zms
 * ScreenView), and the fields the filter chips pick from. Detail screens read
 * their record; home, list and page screens read { game, <folder>… } only, so
 * their source's fields feed the filter chips, never "data.".
 */
export function screenDataFields(
  screen: ScreenFile,
  { schemas, categories = DEFAULT_CATEGORIES, records = [] }: { schemas: SchemaInfo[]; categories?: Categories; records?: Record<string, unknown>[] },
): { data: FieldOption[]; filter: FieldOption[] } {
  if (screen.type === "detail") {
    const fields = sourceFields(schemas, screen.source, records);
    return { data: fields, filter: fields };
  }
  return { data: homeFields(categories), filter: screen.source ? sourceFields(schemas, screen.source) : [] };
}

/** How the editors name a screen the app provides itself. */
export function appScreenLabel(id: string): string {
  return id === "app:settings" ? "Settings (built into the app)" : `${id} (built into the app)`;
}

// ─── A record's main fields ───────────────────────────────────────────

/** The field that names a record: the schema's title or name field, else the "name" every form stores. */
export function titleField(fields: FieldOption[]): string {
  const text = fields.filter((field) => field.type === "string");
  const named = text.find((field) => field.key === "title" || field.key === "name") ?? text.find((field) => TITLE_KEY.test(field.key));
  return named?.key ?? "name";
}

/** The record's picture, if its fields have one (a hero's portrait, a map's background_image…). */
export function imageField(fields: FieldOption[]): string | undefined {
  return fields.find((field) => field.type === "string" && IMAGE_KEY.test(field.key))?.key;
}

/** The date a record is ordered by, newest first (a patch's release_date, an article's published_at). */
export function dateField(fields: FieldOption[]): string | undefined {
  return fields.find((field) => field.type === "string" && DATE_KEY.test(field.key))?.key;
}

/** A short text about the record (a description, bio or summary). */
export function summaryField(fields: FieldOption[]): string | undefined {
  return fields.find((field) => field.type === "string" && SUMMARY_KEY.test(field.key))?.key;
}

/** A record's text at `key`; empty without one. */
function textAt(record: Record<string, unknown>, key: string | undefined): string {
  const value = key ? record[key] : undefined;
  return typeof value === "string" ? value : "";
}

function idText(record: Record<string, unknown>): string {
  const id: unknown = record.id;
  return String(id);
}

/** Records for a list: newest first by their date field (undated last), else by title. */
export function recordListOrder<T extends Record<string, unknown>>(records: T[], fields: FieldOption[]): T[] {
  const date = dateField(fields);
  const title = titleField(fields);
  const nameOf = (record: T) => textAt(record, title) || idText(record);
  return [...records].sort(
    (first, second) =>
      textAt(second, date).localeCompare(textAt(first, date)) || nameOf(first).localeCompare(nameOf(second), undefined, { numeric: true }),
  );
}

/** A block of a starter screen: a new block with its props. */
function starterBlock(type: string, props: Record<string, unknown>): ScreenBlock {
  return { ...createBlock(type), props };
}

/** The fields a starter screen shows of a schema's records: its title, picture, enum and summary. */
function starterFields(schema: SchemaInfo) {
  const fields = sourceFields([schema], { category: schema.category, schema: schema.id });
  return {
    title: titleField(schema.fields),
    image: imageField(fields),
    enumField: schema.fields.find((field) => field.type === "enum"),
    text: summaryField(schema.fields),
  };
}

/** A list starter: a picture grid, with role chips when the schema has an enum. */
function listStarter(schema: SchemaInfo, label: string, detailId: string): ScreenFile {
  const { title, image, enumField } = starterFields(schema);
  return {
    type: "list",
    title: label,
    appearance: "light",
    source: { category: schema.category, sort: title },
    blocks: [
      starterBlock("screen_header", { showLogo: true, title: label }),
      ...(enumField ? [starterBlock("filter_chips", { field: enumField.key, allLabel: "All" })] : []),
      starterBlock("record_grid", {
        itemLabel: `item.${title}`,
        ...(image ? { itemImage: `item.${image}` } : {}),
        ...(enumField ? { itemBadge: `item.${enumField.key}` } : {}),
        action: { screen: detailId },
      }),
    ],
  };
}

/** A stat row's props: each number field's label and binding, in its slot. */
function statProps(numbers: FieldOption[]): Record<string, unknown> {
  return Object.fromEntries(
    numbers.flatMap((field, i) => [
      [`stat${String(i + 1)}Label`, field.label ?? field.key],
      [`stat${String(i + 1)}Value`, `data.${field.key}`],
    ]),
  );
}

/** A list field on a starter detail screen: abilities as an item list, any other list as a field section. */
function listFieldBlock(field: FieldOption): ScreenBlock {
  if (field.type !== "abilities") {
    return starterBlock("field_section", { field: `data.${field.key}` });
  }
  return starterBlock("item_list", {
    title: field.label ?? field.key,
    items: `data.${field.key}`,
    itemTitle: "item.name",
    itemSubtitle: "item.type",
    itemText: "item.description",
    itemImage: "item.icon",
  });
}

/** A detail starter: the schema's main fields as a header, a stat row and its first lists. */
function detailStarter(schema: SchemaInfo): ScreenFile {
  const { title, image, enumField, text } = starterFields(schema);
  const numbers = schema.fields.filter((field) => field.type === "number").slice(0, STARTER_STATS);
  // Lists of references stay out of starters: the app shows them by their records' labels,
  // but labels at most 3 reference folders a screen (screenReferenceFolders), so which to add is the author's choice.
  const lists = schema.fields.filter((field) => isListField(field) && field.type !== "reference_list").slice(0, STARTER_LISTS);
  return {
    type: "detail",
    title: schema.name,
    appearance: "dark",
    source: { category: schema.category },
    blocks: [
      starterBlock("detail_header", {
        title: `data.${title}`,
        ...(enumField ? { eyebrow: `data.${enumField.key}` } : {}),
        ...(text ? { quote: `data.${text}` } : {}),
        ...(image ? { image: `data.${image}` } : {}),
      }),
      ...(numbers.length > 0 ? [starterBlock("stat_row", statProps(numbers))] : []),
      ...lists.map(listFieldBlock),
    ],
  };
}

/**
 * Starter screens for a category: a list (picture grid, role chips when the
 * schema has an enum) and a detail screen with the schema's main fields.
 * They are a starting point to edit, not something the app derives itself.
 */
export function starterScreens(schema: SchemaInfo, categories: Categories = DEFAULT_CATEGORIES): { id: string; file: ScreenFile }[] {
  const folder = folderFor(schema.category, categories) ?? `${schema.category}s`;
  const label = categories.find((category) => category.category === schema.category)?.label ?? schema.name;
  const detailId = `${schema.category}-detail`;
  return [
    { id: folder, file: listStarter(schema, label, detailId) },
    { id: detailId, file: detailStarter(schema) },
  ];
}
