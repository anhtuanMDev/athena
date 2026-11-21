import {
  bindingPath,
  bindingScope,
  isBinding,
  toBinding,
  type FieldOption,
  type PropSpec,
  type RecordSource,
  type ScreenAction,
} from "~/lib/screen-model";
import { BOUND_LINK } from "~/lib/screen-policy";

import { ownEntry } from "./own-entry";

import type { InfoRow, PropContext, PropIds, Shortcut, SourceMode } from "../types";

// What PropControl's inputs show and send, kept apart from their markup.

const TYPE_LABELS: Partial<Record<string, string>> = {
  string: "Text",
  number: "Number",
  boolean: "true or false",
  array: "JSON array",
  data_binding: "Text, or a field",
};

/** The props that choose their own input, with the help shown under it. */
const SPECIAL_HELP: Partial<Record<string, string>> = {
  source: "Which records this block lists. Empty uses the screen's records.",
  action: "What tapping does.",
  shortcuts: "Tiles in order, each opening a screen, the app's settings or a link.",
  field_key: "The field whose values become the chips; they filter this screen's lists.",
  info_rows: "Rows in order: a label, an icon, and the field (or fixed text) shown as the value.",
};

/** An empty "item…" prop of a list block opens bound to a field of its entries. */
const ITEM_PROP = /^item[A-Z]/;

const SCREEN_CHOICE = "screen:";

const NOT_JSON = "This isn't valid JSON yet.";

const JSON_EXPECTED = {
  array: "Enter a JSON array, such as [1, 2].",
  object: 'Enter a JSON object, such as {"style": {}}.',
};

export type JsonShape = keyof typeof JSON_EXPECTED;

/** What a JSON box's text gives: a value to keep, or why it can't be kept yet. */
export type JsonResult = { value: unknown; error: null } | { error: string };

/** The kinds of input a prop that holds its own value gets. */
export type LiteralKind = "options" | "boolean" | "array" | "number" | "text";

const LITERAL_KINDS: Partial<Record<string, LiteralKind>> = { boolean: "boolean", array: "array", number: "number" };

export function isSpecialProp(type: string): boolean {
  return ownEntry(SPECIAL_HELP, type) !== undefined;
}

export function propIds(idBase: string, name: string, error: string | undefined): PropIds {
  const input = `${idBase}-${name}`;
  const help = `${input}-help`;
  const errorId = `${input}-error`;
  return { input, help, error: errorId, describedBy: [help, error ? errorId : null].filter(Boolean).join(" ") };
}

/** A manifest default as text, the way String() shows it. */
function defaultString(spec: PropSpec): string {
  const fallback: unknown = spec.default;
  return String(fallback);
}

function describeDefault(spec: PropSpec): string | null {
  if (spec.default === undefined || spec.default === "") {
    return null;
  }
  return `Default ${defaultString(spec)}`;
}

/** The text under a prop's input: what it takes, or where a bound value comes from. */
export function propHelp(spec: PropSpec, mode: SourceMode): string {
  const special = ownEntry(SPECIAL_HELP, spec.type);
  if (special !== undefined) {
    return special;
  }
  if (mode === "field") {
    return "Read from the data when the app renders.";
  }
  const kind = spec.options?.length ? "One of the app's values" : (TYPE_LABELS[spec.type] ?? spec.type);
  return [kind, describeDefault(spec)].filter(Boolean).join(" · ");
}

/** The empty choice of a select: the app's default when the manifest gives one. */
export function unsetLabel(spec: PropSpec): string {
  const text = describeDefault(spec);
  return text ? `${text} (app default)` : "Not set";
}

export function defaultPlaceholder(spec: PropSpec): string | undefined {
  return spec.default === undefined ? undefined : defaultString(spec);
}

/** A prop opens bound to a field when it is bound, or when it's an empty "item…" prop of a list block. */
export function initialMode(value: unknown, itemFields: FieldOption[] | null, name: string): SourceMode {
  const isEmptyItemProp = itemFields !== null && value === undefined && ITEM_PROP.test(name);
  return isBinding(value) || isEmptyItemProp ? "field" : "value";
}

export function literalKind(spec: PropSpec): LiteralKind {
  if (spec.options && spec.options.length > 0) {
    return "options";
  }
  return ownEntry(LITERAL_KINDS, spec.type) ?? "text";
}

/** A literal text prop's box: text as it is, anything else as JSON. */
export function textValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return value === undefined || value === null ? "" : JSON.stringify(value);
}

export function booleanChoice(value: unknown): string {
  return typeof value === "boolean" ? String(value) : "";
}

/** A bound value as the field select's choice: "item:<path>" or "data:<path>". */
export function bindingChoice(value: unknown): string {
  return isBinding(value) ? `${bindingScope(value)}:${bindingPath(value)}` : "";
}

export function knownChoices(itemFields: FieldOption[] | null, dataFields: FieldOption[]): string[] {
  return [...(itemFields ?? []).map((field) => `item:${field.key}`), ...dataFields.map((field) => `data:${field.key}`)];
}

export function bindingOf(choice: string): string | undefined {
  if (!choice) {
    return undefined;
  }
  const [scope, ...rest] = choice.split(":");
  return toBinding(scope === "item" ? "item" : "data", rest.join(":"));
}

/** A JSON box's first text: empty for nothing (or an empty object), else the value laid out. */
export function jsonText(value: unknown, expect: JsonShape): string {
  if (value === undefined) {
    return "";
  }
  const isEmptyObject = expect === "object" && Object.keys(value as object).length === 0;
  return isEmptyObject ? "" : JSON.stringify(value, null, 2);
}

function hasShape(parsed: unknown, expect: JsonShape): boolean {
  const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  return expect === "array" ? Array.isArray(parsed) : isObject;
}

/** A JSON box's text as a value: an empty box clears the prop; text that isn't the expected JSON is refused. */
export function parseJsonText(text: string, expect: JsonShape): JsonResult {
  if (text.trim() === "") {
    return { value: expect === "array" ? undefined : {}, error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: error instanceof SyntaxError ? NOT_JSON : String(error) };
  }
  return hasShape(parsed, expect) ? { value: parsed, error: null } : { error: JSON_EXPECTED[expect] };
}

function textBindings(fields: FieldOption[], scope: "data" | "item"): string[] {
  return fields.filter((field) => field.type === "string").map((field) => toBinding(scope, field.key));
}

/** Text fields an action can read a link from: each entry's in list blocks, then the screen's record. */
export function linkFields({ itemFields, dataFields }: Pick<PropContext, "itemFields" | "dataFields">): string[] {
  return [...textBindings(itemFields ?? [], "item"), ...textBindings(dataFields, "data")];
}

function objectOf(value: unknown): object {
  return value && typeof value === "object" ? value : {};
}

export function asAction(value: unknown): ScreenAction {
  return objectOf(value);
}

export function asSource(value: unknown): Partial<RecordSource> {
  return objectOf(value);
}

export function screenChoice(screen: string): string {
  return `${SCREEN_CHOICE}${screen}`;
}

/** A link read from a field ("item.url"), as opposed to a fixed one. */
export function boundUrlOf(action: ScreenAction): string | undefined {
  return action.url !== undefined && BOUND_LINK.test(action.url) ? action.url : undefined;
}

/** An action as its select's choice: a screen, a fixed link, a link from a field, or nothing. */
export function actionChoice(action: ScreenAction): string {
  if (boundUrlOf(action)) {
    return "field";
  }
  if (action.url !== undefined) {
    return "url";
  }
  return action.screen ? screenChoice(action.screen) : "";
}

export function actionFor(choice: string, fields: string[]): ScreenAction | undefined {
  if (choice === "") {
    return undefined;
  }
  if (choice === "url") {
    return { url: "" };
  }
  if (choice === "field") {
    return { url: fields[0] };
  }
  return { screen: choice.slice(SCREEN_CHOICE.length) };
}

/** A source with a change applied and its empty keys dropped; none without a category. */
export function updatedSource(source: Partial<RecordSource>, patch: Partial<RecordSource>): RecordSource | undefined {
  const next = Object.fromEntries(
    Object.entries<unknown>({ ...source, ...patch }).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<RecordSource>;
  return next.category ? (next as RecordSource) : undefined;
}

/** Fields a list can be sorted by. */
export function sortableFields(fields: FieldOption[]): FieldOption[] {
  return fields.filter((field) => field.type === "string" || field.type === "number" || field.type === "enum");
}

export function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A list with one entry swapped with its neighbour. */
export function moved<T>(items: readonly T[], index: number, step: -1 | 1): T[] {
  const next = [...items];
  [next[index], next[index + step]] = [next[index + step], next[index]];
  return next;
}

/** A tile with a change applied: a key the change clears goes away. */
export function patchedShortcut(item: Shortcut, patch: Partial<Shortcut>): Shortcut {
  return Object.fromEntries(
    Object.entries<unknown>({ ...item, ...patch }).filter(([key, value]) => value !== undefined || !Object.hasOwn(patch, key)),
  );
}

/** A tile's action: what its action input shows. */
export function tileAction(item: Shortcut): ScreenAction | undefined {
  return item.screen !== undefined || item.url !== undefined ? { screen: item.screen, url: item.url } : undefined;
}

/** The app opens a tile's screen if it has one, else its link (zms sanitize.ts), so a tile keeps one of them. */
export function tilePatch(value: unknown): Partial<Shortcut> {
  const action = asAction(value);
  return { screen: action.screen, url: action.screen ? undefined : action.url };
}

export function newInfoRow(icons: string[], fields: FieldOption[]): InfoRow {
  return { label: "", icon: icons[0], value: fields[0] ? `data.${fields[0].key}` : "" };
}
