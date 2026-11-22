import { PICTURE_PROP, pictureAdvice, refusedPicture } from "./app-pictures";
import { DEFAULT_CATEGORIES, type Category } from "./categories";
import { colorProblem } from "./colors";
import { referenceFolders } from "./reference-labels";
import { detailActionProblem, otherDetailScreens, secondDetailMessage, sourceCategory } from "./screen-actions";
import { entryFields, sourceFields } from "./screen-fields";
import { APP_POLICY, BLOCKED_PROP, BOUND_LINK, isAllowedLink, isAppScreen, type AppLimits, type AppPolicy } from "./screen-policy";
import { normalizeSource } from "./screen-records";
import { isEmptyValue, isEntryList } from "./screen-values";

import type { ScreenRef } from "./screen-actions";

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
  /** reference / reference_list: where the ids point, and which keys are the id and the label (reference-labels.ts). */
  referenceApiEndpoint?: string;
  referenceValueKey?: string;
  referenceLabelKey?: string;
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
    | "empty-screen"
    | "list-as-text"
    | "foreign-picture"
    | "bad-color"
    | "wrong-record"
    | "second-detail";
  message: string;
}

export const SCREEN_TYPES: { value: ScreenType; label: string; hint: string }[] = [
  { value: "home", label: "Home", hint: "The game's first page; swiping on it changes the game." },
  { value: "list", label: "List", hint: "Records of one category, e.g. all heroes." },
  { value: "detail", label: "Detail", hint: "One record, opened from a list or another screen." },
  { value: "page", label: "Page", hint: "Free content such as news or lore." },
];

/** The record categories (data/_meta/categories.json; the admin gets them from useCategories()). */
export type Categories = readonly Pick<Category, "category" | "folder" | "label">[];

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

/**
 * A block type's entry in the manifest. Only the manifest's own entries count: a
 * layout's block type is data, and one named "constructor" or "__proto__" is an
 * unknown block, not a member every object has.
 */
export function blockSpec(manifest: PrimitiveManifest | null, type: string): PrimitiveSpec | undefined {
  return manifest && Object.hasOwn(manifest, type) ? manifest[type] : undefined;
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

/** Fields "item.<path>" can bind to in a list block: entries of its bound list field, else its records. */
/** Every binding ("data.<path>", "item.<path>") in a prop's value, nested ones (info_list rows) included, in order. */
function bindingsIn(value: unknown, out: string[] = []): string[] {
  if (isBinding(value)) out.push(value);
  else if (Array.isArray(value)) for (const entry of value) bindingsIn(entry, out);
  else if (value && typeof value === "object") for (const entry of Object.values(value)) bindingsIn(entry, out);
  return out;
}

/**
 * The folders a screen's references point into, whose records the app loads
 * to label them (zms: at most `max` a screen): blocks in file order, all tabs,
 * visible ones only; within a block, props in key order, arrays by index,
 * depth-first; each bound field gives its referenceFolders (sub-fields in
 * schema order); the first occurrence wins. "item." resolves as the app
 * resolves it, on any block (itemFieldsFor): a list's entries when its items
 * are "data.<list>", else the block's own source, else the screen's. The
 * golden fixtures shared with zms (tests/fixtures/reference-folders-golden*.json) pin this.
 */
export function screenReferenceFolders(
  screen: ScreenFile,
  dataFields: FieldOption[],
  schemas: SchemaInfo[],
  categories: readonly Pick<Category, "folder">[],
  max: number,
  recordsOf?: (category: string) => Record<string, unknown>[],
): string[] {
  const folders: string[] = [];
  for (const block of screen.blocks) {
    if (block.visible === false) continue;
    let itemFields: FieldOption[] | undefined;
    for (const binding of Object.values(block.props).flatMap((value) => bindingsIn(value))) {
      const fields = bindingScope(binding) === "item" ? (itemFields ??= itemFieldsFor(block, screen, dataFields, schemas, recordsOf)) : dataFields;
      const field = fields.find((f) => f.key === bindingPath(binding));
      if (!field) continue;
      for (const folder of referenceFolders(field, categories, max)) if (!folders.includes(folder)) folders.push(folder);
    }
  }
  return folders.slice(0, max);
}

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

/** What the app allows, for validateScreen: its policy, and which categories players can favorite. */
export interface AppContext {
  limits?: AppLimits;
  appScreens?: AppPolicy["appScreens"];
  imageHosts?: AppPolicy["imageHosts"];
  imageVariants?: AppPolicy["imageVariants"];
  /** categories.json. Without them, favorites sources aren't checked, nor whether a source's category is configured. */
  categories?: readonly Pick<Category, "category" | "favoritable">[];
  /** The game's screens, this one by `screenId`: where actions lead. Without them, only whether the screen exists is checked. */
  screens?: readonly ScreenRef[];
  /** This screen's id; its entry in `screens` is replaced by the screen being checked. */
  screenId?: string;
}

/** Every text value inside `value`, with the path to it. */
function textsIn(value: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((entry, i) => textsIn(entry, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) textsIn(nested, `${path}.${key}`, out);
  return out;
}

/** Why the app shows nothing for a source's `category` (C5), when categories.json is given and doesn't have it. */
function unconfiguredMessage(category: string, name: string, configured?: readonly Pick<Category, "category">[]): string | undefined {
  if (configured === undefined || configured.some((entry) => entry.category === category)) {
    return undefined;
  }
  return `${name} lists category "${category}", which isn't in categories.json: the app shows nothing for it.`;
}

/** The game's screens with this one as it's being edited, where actions lead (F9, C9); undefined without them. */
function editedScreens(screen: ScreenFile, app: AppContext): ScreenRef[] | undefined {
  if (!app.screens) {
    return undefined;
  }
  const others = app.screens.filter((ref) => ref.id !== app.screenId);
  return app.screenId === undefined ? others : [...others, { id: app.screenId, type: screen.type, source: screen.source }];
}

/** A warning for each other detail screen of this one's category: notifications and reference links then open neither (C9). */
function secondDetailIssues(screen: ScreenFile, screenId: string | undefined, screens: ScreenRef[] | undefined): ScreenIssue[] {
  const shows = screen.type === "detail" ? sourceCategory(screen.source) : undefined;
  if (screens === undefined || screenId === undefined || shows === undefined) {
    return [];
  }
  return otherDetailScreens(screenId, screens).map((other) => ({ sectionId: "", level: "warning", kind: "second-detail", message: secondDetailMessage(other, shows) }));
}

/** Why the app shows nothing for the category a block's source lists (C5): not in categories.json when it's given, else in no schema. */
function blockCategoryMessage(name: string, source: RecordSource | undefined, known: { configured: AppContext["categories"]; schemas: Set<string> }): string | undefined {
  if (source === undefined) {
    return undefined;
  }
  return unconfiguredMessage(source.category, name, known.configured) ?? (known.schemas.has(source.category) ? undefined : `${name} lists category "${source.category}", which no schema has.`);
}

/** A literal picture the app won't load, and a color that isn't hex (F3, C7); nothing for a binding, the record's. */
function literalIssues(name: string, value: unknown, policy: AppPolicy): Pick<ScreenIssue, "kind" | "message">[] {
  if (isBinding(value)) {
    return [];
  }
  const picture = PICTURE_PROP.test(name) ? refusedPicture(value, policy) : undefined;
  const color = colorProblem(name, value);
  return [
    ...(picture === undefined ? [] : [{ kind: "foreign-picture" as const, message: `The app won't load the picture ${picture}: ${pictureAdvice(policy)}.` }]),
    ...(color === undefined ? [] : [{ kind: "bad-color" as const, message: color }]),
  ];
}

/** A block rule's finding: its issue without the block, at the block's level unless it sets its own. */
type Finding = Omit<ScreenIssue, "sectionId" | "level"> & { level?: ScreenIssue["level"] };

/** What validateScreen checks a screen against, worked out once for its rules. */
interface ScreenCheck {
  screen: ScreenFile;
  manifest: PrimitiveManifest | null;
  dataFields: FieldOption[];
  schemas: SchemaInfo[];
  screenIds: string[];
  recordsOf?: (category: string) => Record<string, unknown>[];
  app: AppContext;
  policy: AppPolicy;
  /** The game's screens with this one as edited (editedScreens); undefined without them. */
  screenRefs: ScreenRef[] | undefined;
  /** The keys of this screen's data. */
  dataKnown: Set<string>;
  /** The categories some schema has. */
  categories: Set<string>;
}

/** The block a block rule checks: its place, its spec and, for a list block, the fields of its items. */
interface BlockCheck {
  block: ScreenBlock;
  index: number;
  spec: PrimitiveSpec | undefined;
  itemFields: FieldOption[] | null;
}

/** One prop of the block being checked. */
interface PropCheck {
  name: string;
  value: unknown;
}

type ScreenRule = (check: ScreenCheck) => ScreenIssue[];
type BlockRule = (check: ScreenCheck, target: BlockCheck) => Finding[];
type PropRule = (check: ScreenCheck, target: BlockCheck, prop: PropCheck) => Finding[];

/** The policy a screen is checked against: the app's, as far as `app` gives it. */
function policyOf(app: AppContext): AppPolicy {
  return {
    limits: app.limits ?? APP_POLICY.limits,
    appScreens: app.appScreens ?? APP_POLICY.appScreens,
    imageHosts: app.imageHosts ?? APP_POLICY.imageHosts,
    imageVariants: app.imageVariants ?? APP_POLICY.imageVariants,
  };
}

/** A prop's spec, looked up as the block's spec object has it (inherited names included, as before). */
function propSpecOf(spec: PrimitiveSpec | undefined, name: string): PropSpec | undefined {
  return spec?.props[name];
}

/** Whether the app has `target`: one of this game's screens, or one it provides itself. */
function opens({ policy, screenIds }: ScreenCheck, target: string): boolean {
  return target.startsWith("app:") ? isAppScreen(target, policy) : screenIds.includes(target);
}

/** Why the app can't show `source` as set, if it can't: a limit past its list size, or favorites nobody can save. */
function sourceProblems({ policy, app }: ScreenCheck, source: RecordSource, name: string): Pick<ScreenIssue, "kind" | "message">[] {
  const { listItems } = policy.limits;
  const category = app.categories?.find((entry) => entry.category === source.category);
  const isOverLimit = typeof source.limit === "number" && source.limit > listItems;
  const isUnfavoritable = source.favorites === true && category !== undefined && !category.favoritable;
  return [
    ...(isOverLimit ? [{ kind: "over-limit" as const, message: `${name} asks for ${String(source.limit)} records; the app shows at most ${String(listItems)}.` }] : []),
    ...(isUnfavoritable ? [{ kind: "not-favoritable" as const, message: `${name} lists the player's favorites of "${source.category}", which players can't favorite: the list would always be empty.` }] : []),
  ];
}

/** A binding to a field the screen's data or a list's records don't have. */
const UNKNOWN_FIELD = "unknown-field" satisfies ScreenIssue["kind"];

const screenIssue = (level: ScreenIssue["level"], kind: ScreenIssue["kind"], message: string): ScreenIssue => ({ sectionId: "", level, kind, message });

// ─── The screen's rules, in the order their issues are listed ─────────────────

/** No visible block: the app shows its placeholder. */
function emptyScreen({ screen }: ScreenCheck): ScreenIssue[] {
  return screen.blocks.some((block) => block.visible !== false) ? [] : [screenIssue("warning", "empty-screen", "No visible blocks: the app shows “Nothing to show here yet”.")];
}

/** More blocks than the app shows. */
function tooManyBlocks({ screen, policy }: ScreenCheck): ScreenIssue[] {
  const max = policy.limits.blocksPerScreen;
  return screen.blocks.length > max ? [screenIssue("error", "too-many-blocks", `A screen can have at most ${String(max)} blocks; the app ignores the rest.`)] : [];
}

/** The screen's category: not in categories.json when it's given, else in no schema (C5). */
function screenCategory({ screen, app, categories }: ScreenCheck): ScreenIssue[] {
  const category = screen.source?.category;
  if (category === undefined) {
    return [];
  }
  const message = unconfiguredMessage(category, "The screen", app.categories) ?? (categories.has(category) ? undefined : `No schema has category "${category}".`);
  return message === undefined ? [] : [screenIssue("error", "unknown-category", message)];
}

/** Another detail screen of the same category (C9). */
function secondDetail({ screen, app, screenRefs }: ScreenCheck): ScreenIssue[] {
  return secondDetailIssues(screen, app.screenId, screenRefs);
}

/** The screen's own source, as the app can show it. */
function screenSource(check: ScreenCheck): ScreenIssue[] {
  const { source } = check.screen;
  return source ? sourceProblems(check, source, "The screen").map((problem) => ({ sectionId: "", level: "error", ...problem })) : [];
}

/** The accent, which the app reads on every screen type: the record on detail screens, the game and lists elsewhere. */
function screenAccent({ screen, dataKnown }: ScreenCheck): ScreenIssue[] {
  const { accent } = screen;
  if (!isBinding(accent) || dataKnown.size === 0 || isKnownPath(bindingPath(accent), dataKnown)) {
    return [];
  }
  return [screenIssue("error", UNKNOWN_FIELD, `The accent is read from "${bindingPath(accent)}", which this screen's data doesn't have.`)];
}

const SCREEN_RULES: ScreenRule[] = [emptyScreen, tooManyBlocks, screenCategory, secondDetail, screenSource, screenAccent];

// ─── What a binding, a text or an action of a block leads to ──────────────────

/** Whether `binding` ("data.<path>", "item.<path>") names a field this block can read. */
function bindingFindings({ dataKnown }: ScreenCheck, { itemFields }: BlockCheck, { name, binding }: { name: string; binding: string }): Finding[] {
  const path = bindingPath(binding);
  if (bindingScope(binding) === "data") {
    return dataKnown.size > 0 && !isKnownPath(path, dataKnown) ? [{ prop: name, kind: UNKNOWN_FIELD, message: `${name} is bound to "${path}", which this screen's data doesn't have.` }] : [];
  }
  if (!itemFields) {
    return [{ prop: name, kind: UNKNOWN_FIELD, message: `${name} uses "item.", which only list blocks have.` }];
  }
  const itemKnown = new Set(itemFields.map((field) => field.key));
  return itemKnown.size > 0 && !isKnownPath(path, itemKnown) ? [{ prop: name, kind: UNKNOWN_FIELD, message: `${name} is bound to item "${path}", which these records don't have.` }] : [];
}

/**
 * A list of entries bound where the app shows it as text, which reads
 * "[object Object]": only a list block's items and a field section show one.
 */
function textFindings({ dataFields }: ScreenCheck, { block, itemFields }: BlockCheck, { name, binding, what }: { name: string; binding: string; what: string }): Finding[] {
  if (name === "items" || (block.type === "field_section" && name === "field")) {
    return [];
  }
  const path = bindingPath(binding);
  const field = (bindingScope(binding) === "item" ? itemFields ?? [] : dataFields).find((entry) => entry.key === path);
  return isEntryList(field) ? [{ prop: name, kind: "list-as-text", message: `${what} is bound to "${path}", a list of entries, which the app shows as "[object Object]": show it with a field_section block.`, level: "warning" }] : [];
}

/** An action to a detail screen from a block that can't show what was tapped (F9). */
function targetFindings({ screen, screenRefs }: ScreenCheck, { block, spec }: BlockCheck, { name, target, what }: { name: string; target: string; what: string }): Finding[] {
  if (!screenRefs) {
    return [];
  }
  const origin = { what, isList: Boolean(spec?.list), items: block.props.items, category: normalizeSource(block.props.source)?.category ?? screen.source?.category };
  const problem = detailActionProblem(target, screenRefs, origin);
  return problem === undefined ? [] : [{ prop: name, kind: "wrong-record", message: problem }];
}

/** Where `action` leads, if the app can't follow it: a screen it doesn't have, or a link it won't open. */
function actionFindings(check: ScreenCheck, target: BlockCheck, { name, action, what }: { name: string; action: ScreenAction; what: string }): Finding[] {
  if (action.screen) {
    const where = action.screen.startsWith("app:") ? "which the app doesn't have" : "which isn't a screen of this game";
    const unknown: Finding[] = opens(check, action.screen) ? [] : [{ prop: name, kind: "unknown-screen", message: `${what} opens "${action.screen}", ${where}.` }];
    return [...unknown, ...targetFindings(check, target, { name, target: action.screen, what })];
  }
  if (action.url === undefined) {
    return [];
  }
  // A link read from the record is checked by the app when tapped; here only its field is.
  if (BOUND_LINK.test(action.url)) {
    return bindingFindings(check, target, { name, binding: action.url });
  }
  return isAllowedLink(action.url) ? [] : [{ prop: name, kind: "unsafe-link", message: `${what} links to a site the app won't open: use https on an allowed site.`, level: "error" }];
}

/** A tile's or a row's findings: its label, and where a tile leads. */
function entryIssues(check: ScreenCheck, target: BlockCheck, { name, entry, place, isTile }: { name: string; entry: unknown; place: number; isTile: boolean }): Finding[] {
  const fields = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
  const { label } = fields;
  const unlabeled: Finding[] = typeof label !== "string" || !label.trim() ? [{ prop: name, kind: "required", message: `${isTile ? "Tile" : "Row"} ${String(place)} needs a label: the app leaves it out without one.` }] : [];
  if (!isTile) {
    return unlabeled;
  }
  const action = { screen: typeof fields.screen === "string" ? fields.screen : undefined, url: typeof fields.url === "string" ? fields.url : undefined };
  return [...unlabeled, ...actionFindings(check, target, { name, action, what: `Tile ${String(place)}` })];
}

/** A row of info_rows bound to a field this screen's data doesn't have, or to a list shown as text. */
function rowIssues(check: ScreenCheck, target: BlockCheck, { name, row }: { name: string; row: unknown }): Finding[] {
  // As the file has it: a row's label is text.
  const fields = (row !== null && typeof row === "object" ? row : {}) as { label?: string; value?: unknown };
  const bound = fields.value;
  if (!isBinding(bound)) {
    return [];
  }
  const what = `Row "${fields.label ?? ""}"`;
  const path = bindingPath(bound);
  const unknown: Finding[] = check.dataKnown.size > 0 && !isKnownPath(path, check.dataKnown) ? [{ prop: name, kind: UNKNOWN_FIELD, message: `${what} is bound to "${path}", which this screen's data doesn't have.` }] : [];
  return [...unknown, ...textFindings(check, target, { name, binding: bound, what })];
}

// ─── A prop's rules, in the order their issues are listed ─────────────────────

/** A binding: the field it names, and a list it would show as text. */
function boundProp(check: ScreenCheck, target: BlockCheck, { name, value }: PropCheck): Finding[] {
  if (!isBinding(value)) {
    return [];
  }
  return [...bindingFindings(check, target, { name, binding: value }), ...textFindings(check, target, { name, binding: value, what: name })];
}

/** A literal picture the app won't load, or a color that isn't hex (F3, C7). */
function literalProp({ policy }: ScreenCheck, _target: BlockCheck, { name, value }: PropCheck): Finding[] {
  return literalIssues(name, value, policy).map((issue) => ({ prop: name, ...issue }));
}

/** Text the app cuts short (zms policy.ts clampText). */
function longTexts({ policy }: ScreenCheck, _target: BlockCheck, { name, value }: PropCheck): Finding[] {
  const max = policy.limits.text;
  return textsIn(value, name)
    .filter(({ text }) => text.length > max)
    .map(({ path, text }) => ({ prop: name, kind: "long-text", message: `${path} is ${String(text.length)} characters long; the app cuts it at ${String(max)}.`, level: "warning" }));
}

/** Tiles and rows: the app shows the first ones, and leaves out entries without a label (zms sanitize.ts). */
function entryList(check: ScreenCheck, target: BlockCheck, { name, value }: PropCheck): Finding[] {
  const type = propSpecOf(target.spec, name)?.type;
  if (type !== "shortcuts" && type !== "info_rows") {
    return [];
  }
  const entries: unknown[] = Array.isArray(value) ? value : [];
  const isTile = type === "shortcuts";
  const max = check.policy.limits.smallList;
  const tooMany: Finding[] = entries.length > max ? [{ prop: name, kind: "too-many-entries", message: `${name} has ${String(entries.length)} ${isTile ? "tile" : "row"}s; the app shows the first ${String(max)}.` }] : [];
  return [...tooMany, ...entries.flatMap((entry, i) => entryIssues(check, target, { name, entry, place: i + 1, isTile }))];
}

/** Rows bound to the screen's data. */
function boundRows(check: ScreenCheck, target: BlockCheck, { name, value }: PropCheck): Finding[] {
  if (propSpecOf(target.spec, name)?.type !== "info_rows" || !Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).flatMap((row) => rowIssues(check, target, { name, row }));
}

/** An action prop: where it leads. */
function actionProp(check: ScreenCheck, target: BlockCheck, { name, value }: PropCheck): Finding[] {
  if (propSpecOf(target.spec, name)?.type !== "action" || !value || typeof value !== "object") {
    return [];
  }
  return actionFindings(check, target, { name, action: value, what: name });
}

/** A source's category the app shows nothing for (C5). */
function sourceCategoryProp(check: ScreenCheck, target: BlockCheck, { name, value }: PropCheck): Finding[] {
  if (propSpecOf(target.spec, name)?.type !== "source") {
    return [];
  }
  const message = blockCategoryMessage(name, normalizeSource(value), { configured: check.app.categories, schemas: check.categories });
  return message === undefined ? [] : [{ prop: name, kind: "unknown-category", message }];
}

/** A source the app can't show as set. */
function sourceLimitsProp(check: ScreenCheck, target: BlockCheck, { name, value }: PropCheck): Finding[] {
  const source = propSpecOf(target.spec, name)?.type === "source" ? normalizeSource(value) : undefined;
  return source ? sourceProblems(check, source, name).map((problem) => ({ prop: name, ...problem })) : [];
}

const PROP_RULES: PropRule[] = [boundProp, literalProp, longTexts, entryList, boundRows, actionProp, sourceCategoryProp, sourceLimitsProp];

// ─── A block's rules, in the order their issues are listed ────────────────────

/** An id an earlier block has. */
function duplicateId({ screen }: ScreenCheck, { block, index }: BlockCheck): Finding[] {
  const isTaken = screen.blocks.slice(0, index).some((earlier) => earlier.id === block.id);
  return isTaken ? [{ kind: "duplicate-id", message: `Block id "${block.id}" is used more than once.`, level: "error" }] : [];
}

/** A type the manifest doesn't have: the app skips the block. */
function unknownType({ manifest }: ScreenCheck, { block, spec }: BlockCheck): Finding[] {
  return manifest && !spec ? [{ kind: "unknown-type", message: `"${block.type}" is not in mobile_primitives.json, so the app skips this block.`, level: "warning" }] : [];
}

/** A required prop left empty. */
function requiredProps(_check: ScreenCheck, { block, spec }: BlockCheck): Finding[] {
  return Object.entries(spec?.props ?? {})
    .filter(([name, propSpec]) => propSpec.required && isConfigurable(propSpec) && isEmptyValue(block.props[name]))
    .map(([name]) => ({ prop: name, kind: "required", message: `${name} is required.` }));
}

/** Each prop: one the app never takes stops there; any other goes through the prop rules. */
function propFindings(check: ScreenCheck, target: BlockCheck): Finding[] {
  return Object.entries(target.block.props).flatMap(([name, value]): Finding[] =>
    BLOCKED_PROP.test(name)
      ? [{ prop: name, kind: "blocked-prop", message: `"${name}" isn't allowed: the app never takes styles or callbacks from a screen.`, level: "error" }]
      : PROP_RULES.flatMap((rule) => rule(check, target, { name, value })),
  );
}

/** Props the block's spec doesn't have (blocked ones aside): the app ignores them. */
function ignoredProps(_check: ScreenCheck, { block, spec }: BlockCheck): Finding[] {
  const ignored = Object.keys(block.props).filter((name) => !BLOCKED_PROP.test(name) && spec !== undefined && propSpecOf(spec, name) === undefined);
  return ignored.length > 0 ? [{ kind: "ignored-prop", message: `The app ignores ${ignored.join(", ")}: these aren't props of this block.`, level: "warning" }] : [];
}

const BLOCK_RULES: BlockRule[] = [duplicateId, unknownType, requiredProps, propFindings, ignoredProps];

/** A block's issues: its rules' findings, at the block's level (a hidden block's are warnings) unless a rule sets its own. */
function blockIssues(check: ScreenCheck, block: ScreenBlock, index: number): ScreenIssue[] {
  const spec = blockSpec(check.manifest, block.type);
  const itemFields = spec?.list ? itemFieldsFor(block, check.screen, check.dataFields, check.schemas, check.recordsOf) : null;
  const target: BlockCheck = { block, index, spec, itemFields };
  const level = block.visible === false ? "warning" : "error";
  return BLOCK_RULES.flatMap((rule) => rule(check, target)).map(({ level: own, ...finding }) => ({ sectionId: block.id, level: own ?? level, ...finding }));
}

/** What the app won't show of `screen` as set, as issues: the screen's rules first, then each block's, in the order of their tables above. */
export function validateScreen(
  screen: ScreenFile,
  manifest: PrimitiveManifest | null,
  dataFields: FieldOption[],
  schemas: SchemaInfo[],
  screenIds: string[],
  recordsOf?: (category: string) => Record<string, unknown>[],
  app: AppContext = {},
): ScreenIssue[] {
  const check: ScreenCheck = {
    screen,
    manifest,
    dataFields,
    schemas,
    screenIds,
    recordsOf,
    app,
    policy: policyOf(app),
    screenRefs: editedScreens(screen, app),
    dataKnown: new Set(dataFields.map((field) => field.key)),
    categories: new Set(schemas.map((schema) => schema.category)),
  };
  return [...SCREEN_RULES.flatMap((rule) => rule(check)), ...screen.blocks.flatMap((block, index) => blockIssues(check, block, index))];
}

export { SCREEN_ID } from "./contract";
