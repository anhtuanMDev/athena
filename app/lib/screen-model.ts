import { DEFAULT_CATEGORIES, type Category } from "./categories";
import { APP_POLICY, BLOCKED_PROP, BOUND_LINK, isAllowedLink, isAppScreen, type AppLimits, type AppPolicy } from "./screen-policy";

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
  /** Each record may give its own unit, in "<key>_suffix" next to the value (see valueWithUnit). */
  hasCustomSuffix?: boolean;
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
    | "too-many-entries"
    | "over-limit"
    | "not-favoritable"
    | "long-text"
    | "empty-screen";
  message: string;
}

export const SCREEN_TYPES: { value: ScreenType; label: string; hint: string }[] = [
  { value: "home", label: "Home", hint: "The game's first page; swiping on it changes the game." },
  { value: "list", label: "List", hint: "Records of one category, e.g. all heroes." },
  { value: "detail", label: "Detail", hint: "One record, opened from a list or another screen." },
  { value: "page", label: "Page", hint: "Free content such as news or lore." },
];

/** The record categories (data/_meta/categories.json; the admin gets them from useCategories()). */
type Categories = readonly Pick<Category, "category" | "folder" | "label">[];

export function folderFor(category: string, categories: Categories = DEFAULT_CATEGORIES): string | null {
  return categories.find((c) => c.category === category)?.folder ?? null;
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
  ],
};

// Keys the hero form still stores (app/schemas/hero.ts) that bindings shouldn't
// offer: the app has no definition for them, so a field_section on data.kit lists
// bare names. The schema's abilities field replaced the kit.
const HIDDEN_FIELDS: Record<string, string[]> = { hero: ["kit"] };

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
  const seen = new Set([...fields.map((f) => f.key), ...(HIDDEN_FIELDS[source.category] ?? [])]);
  const chosen = schemas.filter((s) => s.category === source.category && (!source.schema || s.id === source.schema));
  // The app knows a record's fields from its schema alone (zms sourceFields), so a
  // schema's definition wins over the form's: a hero's difficulty is the schema's enum.
  const inSchemas = new Set(chosen.flatMap((s) => s.fields.map((f) => f.key)));
  for (const field of BASE_FIELDS[source.category] ?? []) {
    if (inSchemas.has(field.key)) continue;
    fields.push(field);
    seen.add(field.key);
  }
  for (const schema of chosen) {
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

// The game as the app gets it in /mobile/init (zms src/types/schema.ts gameSchema),
// less its light palette, an object.
const GAME_COLORS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "surface",
  "surfaceVariant",
  "onPrimary",
  "onSecondary",
  "onBackground",
  "onSurface",
  "error",
  "warning",
  "success",
  "border",
];
const GAME_FIELDS: FieldOption[] = [
  { key: "game.name", type: "string", label: "Game name" },
  { key: "game.slug", type: "string", label: "Game id" },
  { key: "game.developer", type: "string", label: "Game developer" },
  { key: "game.icon", type: "string", label: "Game icon" },
  { key: "game.banner", type: "string", label: "Game banner" },
  { key: "game.active", type: "boolean", label: "Game is active" },
  ...GAME_COLORS.map((color) => ({ key: `game.${color}`, type: "string", label: `Game color: ${color}` })),
];

/** What "data.<path>" can bind to on home and list screens. */
export function homeFields(categories: Categories = DEFAULT_CATEGORIES): FieldOption[] {
  return [...GAME_FIELDS, ...categories.map((c) => ({ key: c.folder, type: "collection", label: c.label }))];
}

/**
 * Fields filter chips can use: an enum or list with options or a global enum.
 * The app draws the chips from those options and compares each record's value
 * (or its list's values) with them; it shows nothing for any other field.
 */
export function filterFields(fields: FieldOption[]): FieldOption[] {
  return fields.filter((f) => (f.type === "enum" || f.type === "list") && ((f.options?.length ?? 0) > 0 || Boolean(f.globalEnumId)));
}

/** Fields of one entry of a list field: its sub-fields, plus name/type/description/icon for abilities and weapons. */
export function entryFields(field: FieldOption | undefined): FieldOption[] {
  if (!field) return [];
  const sub = field.subFields ?? [];
  // Both are lists of kit items, with their sub-fields under params (dynamic-schema.ts).
  if (field.type !== "abilities" && field.type !== "weapon") return sub;
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

// ─── Records as the app lists them (zms model.ts selectRecords) ─────────

/** A sort value the app treats as absent; forms save a cleared text field as "". */
const isMissing = (value: unknown) => value === undefined || value === null || value === "";

/** Two present values: numbers by value, anything else as text, numbers inside it by value and case aside. */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Records sorted by `key`. Records without it go last in both orders, and equal
 * values keep file order. The app sorts with this same rule (zms model.ts).
 */
export function sortByField<T extends Record<string, unknown>>(records: readonly T[], key: string, order: "asc" | "desc" = "asc"): T[] {
  const direction = order === "desc" ? -1 : 1;
  return [...records].sort((x, y) => {
    const a = x[key];
    const b = y[key];
    const aMissing = isMissing(a);
    const bMissing = isMissing(b);
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    return direction * compareValues(a, b);
  });
}

/**
 * The records a source shows in the app: its schema's (a record without a known
 * schema_id follows the category's first schema), sorted, and at most the app's
 * list size. `categorySchemas` are the category's schemas, in the app's order.
 */
export function previewRecords<T extends Record<string, unknown>>(
  records: readonly T[],
  source: RecordSource | undefined,
  categorySchemas: readonly { id: string }[],
  limits: AppLimits = APP_POLICY.limits,
): T[] {
  if (!source) return [];
  let result = [...records];
  if (source.schema && categorySchemas.length > 0) {
    const schemaOf = (r: T) => categorySchemas.find((s) => s.id === r.schema_id)?.id ?? categorySchemas[0].id;
    result = result.filter((r) => schemaOf(r) === source.schema);
  }
  if (source.sort) result = sortByField(result, source.sort, source.order);
  const limit = typeof source.limit === "number" && source.limit > 0 ? Math.min(source.limit, limits.listItems) : limits.listItems;
  return result.slice(0, limit);
}

/**
 * A record value as the app shows it: with the record's own suffix when the field
 * has hasCustomSuffix and "<key>_suffix" (next to the value in `container`) isn't
 * blank, else with the field's unit for numbers. Enums and other values are left
 * as they are. The app renders units by the same rule (F3).
 */
export function valueWithUnit(field: FieldOption | undefined, value: unknown, container: unknown): unknown {
  if (!field || field.type === "enum" || field.globalEnumId) return value;
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return value;
  const own = field.key.split(".").pop();
  const raw = field.hasCustomSuffix && container && typeof container === "object" ? (container as Record<string, unknown>)[`${own}_suffix`] : undefined;
  const suffix = typeof raw === "string" ? raw.trim() : "";
  if (suffix && (field.type === "number" || field.type === "string")) return `${value} ${suffix}`;
  const numeric = field.type === "number" && (typeof value === "number" || (value.trim() !== "" && Number.isFinite(Number(value))));
  return numeric && field.unit ? `${value} ${field.unit}` : value;
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

/** What the app allows, for validateScreen: its policy, and which categories players can favorite. */
export interface AppContext {
  limits?: AppLimits;
  appScreens?: AppPolicy["appScreens"];
  /** Without them, favorites sources aren't checked. */
  categories?: readonly Pick<Category, "category" | "favoritable">[];
}

/** Every text value inside `value`, with the path to it. */
function textsIn(value: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((entry, i) => textsIn(entry, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) textsIn(nested, `${path}.${key}`, out);
  return out;
}

export function validateScreen(
  screen: ScreenFile,
  manifest: PrimitiveManifest | null,
  dataFields: FieldOption[],
  schemas: SchemaInfo[],
  screenIds: string[],
  recordsOf?: (category: string) => Record<string, unknown>[],
  app: AppContext = {},
): ScreenIssue[] {
  const issues: ScreenIssue[] = [];
  const limits = app.limits ?? APP_POLICY.limits;
  const policy: AppPolicy = { limits, appScreens: app.appScreens ?? APP_POLICY.appScreens };
  const dataKnown = new Set(dataFields.map((f) => f.key));
  const seenIds = new Set<string>();
  const categories = new Set(schemas.map((s) => s.category));
  /** Why the app can't show `source` as set, if it can't: a limit past its list size, or favorites nobody can save. */
  const sourceProblems = (source: RecordSource, name: string): Pick<ScreenIssue, "kind" | "message">[] => {
    const problems: Pick<ScreenIssue, "kind" | "message">[] = [];
    if (typeof source.limit === "number" && source.limit > limits.listItems) {
      problems.push({ kind: "over-limit", message: `${name} asks for ${source.limit} records; the app shows at most ${limits.listItems}.` });
    }
    const category = app.categories?.find((c) => c.category === source.category);
    if (source.favorites && category && !category.favoritable) {
      problems.push({ kind: "not-favoritable", message: `${name} lists the player's favorites of "${source.category}", which players can't favorite: the list would always be empty.` });
    }
    return problems;
  };
  /** Whether the app has `screen`: one of this game's, or one it provides itself. */
  const opens = (screen: string) => (screen.startsWith("app:") ? isAppScreen(screen, policy) : screenIds.includes(screen));

  const shown = screen.blocks.filter((b) => b.visible !== false);
  if (shown.length === 0) {
    issues.push({ sectionId: "", level: "warning", kind: "empty-screen", message: "No visible blocks: the app shows “Nothing to show here yet”." });
  }
  if (screen.blocks.length > limits.blocksPerScreen) {
    issues.push({
      sectionId: "",
      level: "error",
      kind: "too-many-blocks",
      message: `A screen can have at most ${limits.blocksPerScreen} blocks; the app ignores the rest.`,
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
  if (screen.source) {
    for (const problem of sourceProblems(screen.source, "The screen")) issues.push({ sectionId: "", level: "error", ...problem });
  }
  // The app reads the accent on every screen type: the record on detail screens, the game and lists elsewhere.
  if (isBinding(screen.accent) && dataKnown.size > 0 && !isKnownPath(bindingPath(screen.accent), dataKnown)) {
    issues.push({
      sectionId: "",
      level: "error",
      kind: "unknown-field",
      message: `The accent is read from "${bindingPath(screen.accent)}", which this screen's data doesn't have.`,
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
    /** Where `action` leads, if the app can't follow it: a screen it doesn't have, or a link it won't open. */
    const checkAction = (name: string, action: ScreenAction, what: string) => {
      if (action.screen) {
        if (!opens(action.screen)) {
          add({
            prop: name,
            kind: "unknown-screen",
            message: action.screen.startsWith("app:")
              ? `${what} opens "${action.screen}", which the app doesn't have.`
              : `${what} opens "${action.screen}", which isn't a screen of this game.`,
          });
        }
        return;
      }
      if (action.url !== undefined) {
        // A link read from the record is checked by the app when tapped; here only its field is.
        if (BOUND_LINK.test(action.url)) checkBinding(name, action.url);
        else if (!isAllowedLink(action.url)) {
          add({ prop: name, kind: "unsafe-link", message: `${what} links to a site the app won't open: use https on an allowed site.` }, "error");
        }
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
      // The app cuts longer text short (zms policy.ts clampText).
      for (const { path, text } of textsIn(value, name)) {
        if (text.length > limits.text) {
          add({ prop: name, kind: "long-text", message: `${path} is ${text.length} characters long; the app cuts it at ${limits.text}.` }, "warning");
        }
      }
      const entries = spec?.props[name]?.type === "shortcuts" || spec?.props[name]?.type === "info_rows" ? (Array.isArray(value) ? value : []) : null;
      if (entries) {
        const noun = spec?.props[name]?.type === "shortcuts" ? "tile" : "row";
        // The app shows the first ones, and leaves out entries without a label (zms sanitize.ts).
        if (entries.length > limits.smallList) {
          add({ prop: name, kind: "too-many-entries", message: `${name} has ${entries.length} ${noun}s; the app shows the first ${limits.smallList}.` });
        }
        entries.forEach((entry: unknown, i: number) => {
          const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          if (typeof e.label !== "string" || !e.label.trim()) {
            add({ prop: name, kind: "required", message: `${noun === "tile" ? "Tile" : "Row"} ${i + 1} needs a label: the app leaves it out without one.` });
          }
          if (noun === "tile") checkAction(name, { screen: typeof e.screen === "string" ? e.screen : undefined, url: typeof e.url === "string" ? e.url : undefined }, `Tile ${i + 1}`);
        });
      }
      if (spec?.props[name]?.type === "info_rows" && Array.isArray(value)) {
        for (const row of value as { label?: string; value?: unknown }[]) {
          if (isBinding(row?.value) && dataKnown.size > 0 && !isKnownPath(bindingPath(row.value), dataKnown)) {
            add({ prop: name, kind: "unknown-field", message: `Row "${row.label ?? ""}" is bound to "${bindingPath(row.value)}", which this screen's data doesn't have.` });
          }
        }
      }
      const action = value && typeof value === "object" ? (value as ScreenAction) : undefined;
      if (spec?.props[name]?.type === "action" && action) checkAction(name, action, name);
      if (spec?.props[name]?.type === "source") {
        const source = normalizeSource(value);
        if (source && !categories.has(source.category)) {
          add({ prop: name, kind: "unknown-category", message: `${name} lists category "${source.category}", which no schema has.` });
        }
        if (source) for (const problem of sourceProblems(source, name)) add({ prop: name, ...problem });
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

/** How the editors name a screen the app provides itself. */
export function appScreenLabel(id: string): string {
  return id === "app:settings" ? "Settings (built into the app)" : `${id} (built into the app)`;
}

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
export function starterScreens(schema: SchemaInfo, categories: Categories = DEFAULT_CATEGORIES): { id: string; file: ScreenFile }[] {
  const folder = folderFor(schema.category, categories) ?? `${schema.category}s`;
  const label = categories.find((c) => c.category === schema.category)?.label ?? schema.name;
  const detailId = `${schema.category}-detail`;
  const fields = sourceFields([schema], { category: schema.category, schema: schema.id });
  const title = titleField(schema.fields);
  const image = imageField(fields);
  const enumField = schema.fields.find((f) => f.type === "enum");
  const numbers = schema.fields.filter((f) => f.type === "number").slice(0, 4);
  // References hold ids, which the app shows as they are, so starters leave them out.
  const lists = schema.fields.filter((f) => isListField(f) && f.type !== "reference_list").slice(0, 3);
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
