import { BLOCKED_PROP, BOUND_LINK, LIMITS, isAllowedLink } from "./screen-policy";

// App screens under data/<game>/screens/<id>.json and the tab list in
// data/<game>/navigation.json, rendered by the mobile app (zms). Schemas only
// say which fields records have; screens say what the app shows and where.
// Block types and their props come from data/_meta/mobile_primitives.json,
// which is generated from the app's source (`npm run primitives` in zms).

export type ScreenType = "home" | "list" | "detail" | "page";

export interface ScreenBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visible?: boolean;
  /** Shown only while this tab of the screen's tab_bar is selected. */
  tab?: string;
}

export interface RecordSource {
  category: string;
  schema?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  /** Only the signed-in player's favorites; nothing for signed-out players. */
  favorites?: boolean;
}

export interface ScreenAction {
  screen?: string;
  url?: string;
}

export interface ScreenFile {
  type: ScreenType;
  title?: string;
  appearance?: "light" | "dark";
  source?: RecordSource;
  accent?: string;
  blocks: ScreenBlock[];
  [key: string]: unknown;
}

export interface NavTab {
  screen: string;
  label: string;
  icon?: string;
}

export interface NavigationFile {
  tabs: NavTab[];
}

export interface PropSpec {
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  /** Allowed values, when the app's prop type is a union of strings. */
  options?: string[];
}

export interface PrimitiveSpec {
  name: string;
  description?: string;
  /** Repeats over records or a list field; "item.<field>" props apply per entry. */
  list?: boolean;
  props: Record<string, PropSpec>;
}

export type PrimitiveManifest = Record<string, PrimitiveSpec>;

export interface FieldOption {
  key: string;
  type: string;
  label?: string;
  unit?: string;
  globalEnumId?: string;
  options?: string[];
  subFields?: FieldOption[];
}

export interface SchemaInfo {
  id: string;
  name: string;
  category: string;
  fields: FieldOption[];
}

export interface ScreenIssue {
  sectionId: string;
  prop?: string;
  level: "error" | "warning";
  kind:
    | "duplicate-id"
    | "unknown-type"
    | "required"
    | "unknown-field"
    | "unknown-screen"
    | "unknown-category"
    | "unsafe-link"
    | "blocked-prop"
    | "ignored-prop"
    | "too-many-blocks"
    | "empty-screen";
  message: string;
}

export const SCREEN_TYPES: { value: ScreenType; label: string; hint: string }[] = [
  { value: "home", label: "Home", hint: "The game's first page; swiping on it changes the game." },
  { value: "list", label: "List", hint: "Records of one category, e.g. all heroes." },
  { value: "detail", label: "Detail", hint: "One record, opened from a list or another screen." },
  { value: "page", label: "Page", hint: "Free content such as news or lore." },
];

export const CATEGORIES: { category: string; folder: string; label: string }[] = [
  { category: "hero", folder: "heroes", label: "Heroes" },
  { category: "map", folder: "maps", label: "Maps" },
  { category: "mode", folder: "modes", label: "Modes" },
  { category: "item", folder: "items", label: "Items" },
  { category: "patch", folder: "patches", label: "Patches" },
  { category: "news", folder: "news", label: "News" },
];

export function folderFor(category: string): string | null {
  return CATEGORIES.find((c) => c.category === category)?.folder ?? null;
}

// "data.<path>" reads the screen's record (detail) or { game, heroes, maps… } (home, list);
// "item.<path>" reads each entry of a list block. Anything else is a literal.
export const DATA_PREFIX = "data.";
export const ITEM_PREFIX = "item.";

export function isBinding(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ((value.startsWith(DATA_PREFIX) && value.length > DATA_PREFIX.length) ||
      (value.startsWith(ITEM_PREFIX) && value.length > ITEM_PREFIX.length))
  );
}

export function bindingScope(value: string): "data" | "item" {
  return value.startsWith(ITEM_PREFIX) ? "item" : "data";
}

export function bindingPath(value: string): string {
  return value.slice(value.indexOf(".") + 1);
}

export function toBinding(scope: "data" | "item", path: string): string {
  return `${scope}.${path}`;
}

export function isConfigurable(spec: PropSpec): boolean {
  return spec.type !== "node";
}

// Raw React Native style objects stay in the JSON escape hatch rather than the form.
export const FORM_EXCLUDED_PROPS = new Set(["style"]);

export function formProps(spec: PrimitiveSpec | undefined): [string, PropSpec][] {
  if (!spec) return [];
  return Object.entries(spec.props).filter(([name]) => !FORM_EXCLUDED_PROPS.has(name));
}

export function normalizeManifest(raw: unknown): PrimitiveManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([, value]) => value && typeof value === "object" && typeof (value as PrimitiveSpec).props === "object",
  ) as [string, PrimitiveSpec][];
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/** Icon names the app knows, read from any icon prop in the manifest. */
export function iconOptions(manifest: PrimitiveManifest | null): string[] {
  for (const spec of Object.values(manifest ?? {})) {
    for (const [name, prop] of Object.entries(spec.props)) {
      if (/icon$/i.test(name) && prop.options && prop.options.length > 0) return prop.options;
    }
  }
  return ["house", "users", "user", "crosshair", "map", "book-open", "play", "star"];
}

// ─── Fields that bindings can use ─────────────────────────────────────

const ARRAY_FIELD_TYPES = new Set(["list", "abilities", "object_array", "reference_list", "collection"]);
const OBJECT_FIELD_TYPES = new Set(["weapon", "object"]);

export function isListField(field: FieldOption): boolean {
  return ARRAY_FIELD_TYPES.has(field.type);
}

export function fieldsForProp(fields: FieldOption[], spec: PropSpec): FieldOption[] {
  switch (spec.type) {
    case "array":
      return fields.filter((f) => ARRAY_FIELD_TYPES.has(f.type));
    case "number":
      return fields.filter((f) => f.type === "number");
    case "boolean":
      return fields.filter((f) => f.type === "boolean");
    case "string":
      return fields.filter((f) => !ARRAY_FIELD_TYPES.has(f.type) && !OBJECT_FIELD_TYPES.has(f.type));
    default:
      return fields;
  }
}

function inferType(value: unknown): string {
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value && typeof value === "object") return "object";
  return "string";
}

// Fields the admin stores on every record of a category, outside its dynamic schema
// (app/schemas/hero.ts for heroes).
const BASE_FIELDS: Record<string, FieldOption[]> = {
  hero: [
    { key: "portrait", type: "string", label: "Portrait" },
    { key: "real_name", type: "string", label: "Real name" },
    { key: "bio", type: "string", label: "Bio" },
    { key: "roles", type: "list", label: "Roles" },
    { key: "difficulty", type: "number", label: "Difficulty (1-5)" },
    { key: "released", type: "string", label: "Released" },
    { key: "tags", type: "list", label: "Tags" },
    { key: "kit", type: "abilities", label: "Kit" },
  ],
};

/** Fields of a category's records: id and name, base fields, the chosen schema's (or all) fields, then keys seen in records. */
export function sourceFields(
  schemas: SchemaInfo[],
  source: RecordSource | undefined,
  records: Record<string, unknown>[] = [],
): FieldOption[] {
  if (!source?.category) return [];
  const fields: FieldOption[] = [
    { key: "id", type: "string", label: "ID" },
    { key: "name", type: "string", label: "Name" },
  ];
  const seen = new Set(fields.map((f) => f.key));
  for (const field of BASE_FIELDS[source.category] ?? []) {
    fields.push(field);
    seen.add(field.key);
  }
  for (const schema of schemas.filter((s) => s.category === source.category && (!source.schema || s.id === source.schema))) {
    for (const field of schema.fields) {
      if (!seen.has(field.key)) {
        fields.push(field);
        seen.add(field.key);
      }
    }
  }
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (seen.has(key)) continue;
      fields.push({ key, type: inferType(value) });
      seen.add(key);
    }
  }
  return fields;
}

/** What "data.<path>" can bind to on home and list screens. */
export function homeFields(): FieldOption[] {
  return [
    { key: "game.name", type: "string", label: "Game name" },
    ...CATEGORIES.map((c) => ({ key: c.folder, type: "collection", label: c.label })),
  ];
}

/** Fields of one entry of a list field: its sub-fields, plus name/type/description/icon for abilities. */
export function entryFields(field: FieldOption | undefined): FieldOption[] {
  if (!field) return [];
  const sub = field.subFields ?? [];
  if (field.type !== "abilities") return sub;
  return [
    { key: "name", type: "string", label: "Name" },
    { key: "type", type: "string", label: "Type" },
    { key: "description", type: "string", label: "Description" },
    { key: "icon", type: "string", label: "Icon" },
    ...sub.map((f) => ({ ...f, key: `params.${f.key}` })),
  ];
}

export function normalizeSource(raw: unknown): RecordSource | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return typeof r.category === "string" && r.category ? (r as unknown as RecordSource) : undefined;
}

/** Fields "item.<path>" can bind to in a list block: entries of its bound list field, else its records. */
export function itemFieldsFor(
  block: ScreenBlock,
  screen: ScreenFile,
  dataFields: FieldOption[],
  schemas: SchemaInfo[],
  recordsOf: (category: string) => Record<string, unknown>[] = () => [],
): FieldOption[] {
  const items = block.props.items;
  if (isBinding(items) && bindingScope(items) === "data") {
    return entryFields(dataFields.find((f) => f.key === bindingPath(items)));
  }
  const source = normalizeSource(block.props.source) ?? screen.source;
  return sourceFields(schemas, source, source ? recordsOf(source.category) : []);
}

function isKnownPath(path: string, known: Set<string>): boolean {
  const parts = path.split(".");
  for (let i = 1; i <= parts.length; i++) {
    if (known.has(parts.slice(0, i).join("."))) return true;
  }
  // Numeric segments index into lists ("patches.0.title").
  return parts.length > 1 && /^\d+$/.test(parts[1]) && known.has(parts[0]);
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function validateScreen(
  screen: ScreenFile,
  manifest: PrimitiveManifest | null,
  dataFields: FieldOption[],
  schemas: SchemaInfo[],
  screenIds: string[],
  recordsOf?: (category: string) => Record<string, unknown>[],
): ScreenIssue[] {
  const issues: ScreenIssue[] = [];
  const dataKnown = new Set(dataFields.map((f) => f.key));
  const seenIds = new Set<string>();
  const categories = new Set(schemas.map((s) => s.category));

  const shown = screen.blocks.filter((b) => b.visible !== false);
  if (shown.length === 0) {
    issues.push({ sectionId: "", level: "warning", kind: "empty-screen", message: "No visible blocks: the app shows “Nothing to show here yet”." });
  }
  if (screen.blocks.length > LIMITS.blocksPerScreen) {
    issues.push({
      sectionId: "",
      level: "error",
      kind: "too-many-blocks",
      message: `A screen can have at most ${LIMITS.blocksPerScreen} blocks; the app ignores the rest.`,
    });
  }
  if (screen.source && !categories.has(screen.source.category)) {
    issues.push({
      sectionId: "",
      level: "error",
      kind: "unknown-category",
      message: `No schema has category "${screen.source.category}".`,
    });
  }

  for (const block of screen.blocks) {
    const level = block.visible === false ? "warning" : "error";
    const add = (issue: Omit<ScreenIssue, "sectionId" | "level">, issueLevel: ScreenIssue["level"] = level) =>
      issues.push({ sectionId: block.id, level: issueLevel, ...issue });

    if (seenIds.has(block.id)) add({ kind: "duplicate-id", message: `Block id "${block.id}" is used more than once.` }, "error");
    seenIds.add(block.id);

    const spec = manifest?.[block.type];
    if (manifest && !spec) {
      add({ kind: "unknown-type", message: `"${block.type}" is not in mobile_primitives.json, so the app skips this block.` }, "warning");
    }

    for (const [name, propSpec] of Object.entries(spec?.props ?? {})) {
      if (propSpec.required && isConfigurable(propSpec) && isEmptyValue(block.props[name])) {
        add({ prop: name, kind: "required", message: `${name} is required.` });
      }
    }

    const itemKnown = spec?.list ? new Set(itemFieldsFor(block, screen, dataFields, schemas, recordsOf).map((f) => f.key)) : null;
    /** Whether `binding` ("data.<path>", "item.<path>") names a field this block can read. */
    const checkBinding = (name: string, binding: string) => {
      const path = bindingPath(binding);
      if (bindingScope(binding) === "item") {
        if (!itemKnown) {
          add({ prop: name, kind: "unknown-field", message: `${name} uses "item.", which only list blocks have.` });
        } else if (itemKnown.size > 0 && !isKnownPath(path, itemKnown)) {
          add({ prop: name, kind: "unknown-field", message: `${name} is bound to item "${path}", which these records don't have.` });
        }
      } else if (dataKnown.size > 0 && !isKnownPath(path, dataKnown)) {
        add({ prop: name, kind: "unknown-field", message: `${name} is bound to "${path}", which this screen's data doesn't have.` });
      }
    };
    const ignored: string[] = [];
    for (const [name, value] of Object.entries(block.props)) {
      if (BLOCKED_PROP.test(name)) {
        add({ prop: name, kind: "blocked-prop", message: `"${name}" isn't allowed: the app never takes styles or callbacks from a screen.` }, "error");
        continue;
      }
      if (spec && !spec.props[name]) ignored.push(name);
      if (isBinding(value)) checkBinding(name, value);
      if (spec?.props[name]?.type === "info_rows" && Array.isArray(value)) {
        for (const row of value as { label?: string; value?: unknown }[]) {
          if (isBinding(row?.value) && dataKnown.size > 0 && !isKnownPath(bindingPath(row.value), dataKnown)) {
            add({ prop: name, kind: "unknown-field", message: `Row "${row.label ?? ""}" is bound to "${bindingPath(row.value)}", which this screen's data doesn't have.` });
          }
        }
      }
      const action = value && typeof value === "object" ? (value as ScreenAction) : undefined;
      if (spec?.props[name]?.type === "action" && action?.screen && !action.screen.startsWith("app:") && !screenIds.includes(action.screen)) {
        add({ prop: name, kind: "unknown-screen", message: `${name} opens "${action.screen}", which isn't a screen of this game.` });
      }
      if (spec?.props[name]?.type === "action" && action?.url !== undefined) {
        // A link read from the record is checked by the app when tapped; here only its field is.
        if (BOUND_LINK.test(action.url)) checkBinding(name, action.url);
        else if (!isAllowedLink(action.url)) {
          add({ prop: name, kind: "unsafe-link", message: `${name} links to a site the app won't open: use https on an allowed site.` }, "error");
        }
      }
      if (spec?.props[name]?.type === "source") {
        const source = normalizeSource(value);
        if (source && !categories.has(source.category)) {
          add({ prop: name, kind: "unknown-category", message: `${name} lists category "${source.category}", which no schema has.` });
        }
      }
    }
    if (ignored.length > 0) {
      add({ kind: "ignored-prop", message: `The app ignores ${ignored.join(", ")}: these aren't props of this block.` }, "warning");
    }
  }
  return issues;
}

export function createBlock(type: string): ScreenBlock {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id: `sec_${suffix}`, type, props: {}, visible: true };
}

export function readScreen(raw: unknown): ScreenFile {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const type = SCREEN_TYPES.some((t) => t.value === r.type) ? (r.type as ScreenType) : "page";
  return {
    ...r,
    type,
    title: typeof r.title === "string" ? r.title : undefined,
    appearance: r.appearance === "dark" ? "dark" : "light",
    source: normalizeSource(r.source),
    accent: typeof r.accent === "string" ? r.accent : undefined,
    blocks: Array.isArray(r.blocks) ? (r.blocks as ScreenBlock[]) : [],
  };
}

export function recordLabel(record: Record<string, unknown>): string {
  for (const key of ["name", "title", "hero_name", "item_name", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return "Untitled record";
}

export const SCREEN_ID = /^[a-z0-9][a-z0-9-]*$/;

// ─── A record's main fields ───────────────────────────────────────────

const IMAGE_KEY = /(^|_)(image|portrait|picture|photo|thumbnail|banner|icon|art)(_|$)/;
const DATE_KEY = /(^|_)(date|at)$/;

/** The field that names a record: the schema's title or name field, else the "name" every form stores. */
export function titleField(fields: FieldOption[]): string {
  const text = fields.filter((f) => f.type === "string");
  return (
    text.find((f) => f.key === "title" || f.key === "name") ??
    text.find((f) => /_(title|name)$/.test(f.key))
  )?.key ?? "name";
}

/** The record's picture, if its fields have one (a hero's portrait, a map's background_image…). */
export function imageField(fields: FieldOption[]): string | undefined {
  return fields.find((f) => f.type === "string" && IMAGE_KEY.test(f.key))?.key;
}

/** The date a record is ordered by, newest first (a patch's release_date, an article's published_at). */
export function dateField(fields: FieldOption[]): string | undefined {
  return fields.find((f) => f.type === "string" && DATE_KEY.test(f.key))?.key;
}

/** A short text about the record (a description, bio or summary). */
export function summaryField(fields: FieldOption[]): string | undefined {
  return fields.find((f) => f.type === "string" && /description|bio|summary|lore/.test(f.key))?.key;
}

/** Records for a list: newest first by their date field (undated last), else by title. */
export function recordListOrder<T extends Record<string, unknown>>(records: T[], fields: FieldOption[]): T[] {
  const date = dateField(fields);
  const title = titleField(fields);
  const text = (record: T, key: string | undefined) => (key && typeof record[key] === "string" ? (record[key] as string) : "");
  return [...records].sort(
    (a, b) =>
      text(b, date).localeCompare(text(a, date)) ||
      (text(a, title) || String(a.id)).localeCompare(text(b, title) || String(b.id), undefined, { numeric: true }),
  );
}

/**
 * Starter screens for a category: a list (picture grid, role chips when the
 * schema has an enum) and a detail screen with the schema's main fields.
 * They are a starting point to edit, not something the app derives itself.
 */
export function starterScreens(schema: SchemaInfo): { id: string; file: ScreenFile }[] {
  const folder = folderFor(schema.category) ?? `${schema.category}s`;
  const label = CATEGORIES.find((c) => c.category === schema.category)?.label ?? schema.name;
  const detailId = `${schema.category}-detail`;
  const fields = sourceFields([schema], { category: schema.category, schema: schema.id });
  const title = titleField(schema.fields);
  const image = imageField(fields);
  const enumField = schema.fields.find((f) => f.type === "enum");
  const numbers = schema.fields.filter((f) => f.type === "number").slice(0, 4);
  const lists = schema.fields.filter((f) => isListField(f)).slice(0, 3);
  const text = summaryField(schema.fields);
  const block = (type: string, props: Record<string, unknown>, extra: Partial<ScreenBlock> = {}): ScreenBlock => ({
    ...createBlock(type),
    ...extra,
    props,
  });

  const list: ScreenFile = {
    type: "list",
    title: label,
    appearance: "light",
    source: { category: schema.category, sort: title },
    blocks: [
      block("screen_header", { showLogo: true, title: label }),
      ...(enumField ? [block("filter_chips", { field: enumField.key, allLabel: "All" })] : []),
      block("record_grid", {
        itemLabel: `item.${title}`,
        ...(image ? { itemImage: `item.${image}` } : {}),
        ...(enumField ? { itemBadge: `item.${enumField.key}` } : {}),
        action: { screen: detailId },
      }),
    ],
  };

  const stats: Record<string, unknown> = {};
  numbers.forEach((f, i) => {
    stats[`stat${i + 1}Label`] = f.label ?? f.key;
    stats[`stat${i + 1}Value`] = `data.${f.key}`;
  });

  const detail: ScreenFile = {
    type: "detail",
    title: schema.name,
    appearance: "dark",
    source: { category: schema.category },
    blocks: [
      block("detail_header", {
        title: `data.${title}`,
        ...(enumField ? { eyebrow: `data.${enumField.key}` } : {}),
        ...(text ? { quote: `data.${text}` } : {}),
        ...(image ? { image: `data.${image}` } : {}),
      }),
      ...(numbers.length > 0 ? [block("stat_row", stats)] : []),
      ...lists.map((f) =>
        f.type === "abilities"
          ? block("item_list", {
              title: f.label ?? f.key,
              items: `data.${f.key}`,
              itemTitle: "item.name",
              itemSubtitle: "item.type",
              itemText: "item.description",
              itemImage: "item.icon",
            })
          : block("field_section", { field: `data.${f.key}` }),
      ),
    ],
  };

  return [
    { id: folder, file: list },
    { id: detailId, file: detail },
  ];
}
