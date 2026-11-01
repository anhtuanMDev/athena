/**
 * Turns a fetched JSON or HTML document into records shaped by a dynamic
 * schema, following an import job's field mappings.
 *
 * A mapping rule is one of:
 *   "=Live"          a constant
 *   "stats.health"   JSON: a dot path inside the item; "tags[0]" picks one
 *                    element, and arrays are read element by element
 *   "h3.title"       HTML: the text of matches inside the item ("." is the
 *                    item itself); scalar fields take the first match
 *   "a@href", "@id"  HTML: an attribute of the matches, or of the item
 *   "time | date"    transforms, applied in order: date, slug, number,
 *                    lower, upper, and url (a link made absolute against
 *                    the source's address)
 * Object-array fields take { each, fields }: one object per match of `each`,
 * its sub-fields mapped by the same rules relative to that match.
 *
 * Nothing here throws on bad input: problems are collected per item so a
 * preview can show them and a reviewer can fix the draft.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { FieldRule } from "../../schemas/cron";
import type { DynamicField } from "../../schemas/dynamic-schema";

export type SourceFormat = "json" | "html";

const TRANSFORMS = ["date", "slug", "number", "lower", "upper", "url"] as const;
type Transform = (typeof TRANSFORMS)[number];

interface ParsedRule {
  constant?: string;
  path: string;
  attr?: string;
  transforms: Transform[];
}

/**
 * A rule string, parsed; an error message when it can't be. "@attr" only
 * means an attribute on HTML sources; JSON keys may contain "@" ("@id").
 */
export function parseRule(rule: string, attributes = true): ParsedRule | { error: string } {
  const trimmed = rule.trim();
  if (trimmed.startsWith("=")) return { constant: trimmed.slice(1).trim(), path: "", transforms: [] };
  const [source, ...pipes] = trimmed.split("|").map((part) => part.trim());
  const transforms: Transform[] = [];
  for (const name of pipes) {
    if (!(TRANSFORMS as readonly string[]).includes(name)) {
      return { error: `Unknown transform "${name}" (use ${TRANSFORMS.join(", ")}).` };
    }
    transforms.push(name as Transform);
  }
  const at = attributes ? source.lastIndexOf("@") : -1;
  if (at === -1) return { path: source, transforms };
  return { path: source.slice(0, at).trim(), attr: source.slice(at + 1).trim(), transforms };
}

// ─── Documents ─────────────────────────────────────────────────────────

/** A parsed source, read the same way whatever its format. */
interface Doc {
  /** Whether rules can read attributes ("a@href"). */
  attributes: boolean;
  /** The source's address, which relative links resolve against. */
  base?: string;
  /** The items to import, at `path` (a JSON path or CSS selector). */
  items(path: string): unknown[];
  /** The nodes at `path` inside `node`. */
  select(node: unknown, path: string): unknown[];
  /** The values `rule` reads inside `node`: text, attributes or JSON values. */
  read(node: unknown, rule: ParsedRule): unknown[];
}

const MAX_PATH_SEGMENTS = 10;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Every value at a dot path ("a.b[0].c"); arrays along the way are read element by element. */
function jsonAt(value: unknown, path: string): unknown[] {
  const segments = path.trim() === "" || path.trim() === "." ? [] : path.trim().split(".");
  if (segments.length > MAX_PATH_SEGMENTS) throw new Error("Path is too deep.");
  let current: unknown[] = [value];
  for (const segment of segments) {
    const match = /^([^[\]]*)((?:\[\d*\])*)$/.exec(segment);
    if (!match) throw new Error(`Can't read the path segment "${segment}".`);
    const [, key, indexes] = match;
    const next: unknown[] = [];
    for (const item of current.flatMap(spread)) {
      if (key === "") {
        next.push(item);
      } else if (item && typeof item === "object" && !UNSAFE_KEYS.has(key) && Object.hasOwn(item, key)) {
        next.push((item as Record<string, unknown>)[key]);
      }
    }
    current = next;
    for (const index of indexes.match(/\[\d*\]/g) ?? []) {
      const n = index.slice(1, -1);
      current = current.flatMap((item) =>
        Array.isArray(item) ? (n === "" ? item : item.length > Number(n) ? [item[Number(n)]] : []) : [],
      );
    }
  }
  return current.flatMap(spread).filter((v) => v !== undefined && v !== null);
}

const spread = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

function jsonDoc(body: string, base?: string): Doc {
  const root: unknown = JSON.parse(body);
  return {
    attributes: false,
    base,
    items: (path) => jsonAt(root, path),
    select: (node, path) => jsonAt(node, path),
    read: (node, rule) => jsonAt(node, rule.path),
  };
}

/** Text as a reader sees it: entities decoded, whitespace collapsed. */
const textOf = (element: HTMLElement) => element.textContent.replace(/\s+/g, " ").trim();

function htmlDoc(body: string, base?: string): Doc {
  const root = parse(body, { comment: false, blockTextElements: { script: false, style: false, pre: true } });
  const select = (node: unknown, path: string): HTMLElement[] => {
    const scope = node as HTMLElement;
    if (path.trim() === "" || path.trim() === ".") return [scope];
    try {
      return scope.querySelectorAll(path);
    } catch {
      throw new Error(`Invalid CSS selector "${path}".`);
    }
  };
  return {
    attributes: true,
    base,
    items: (path) => (path.trim() === "" ? [root] : select(root, path)),
    select,
    read: (node, rule) =>
      select(node, rule.path)
        .map((element) => (rule.attr ? element.getAttribute(rule.attr) : textOf(element)))
        .filter((value): value is string => typeof value === "string"),
  };
}

export function parseDocument(body: string, format: SourceFormat, base?: string): Doc {
  if (format === "html") return htmlDoc(body, base);
  try {
    return jsonDoc(body, base);
  } catch {
    throw new Error("The source didn't return valid JSON.");
  }
}

// ─── Transforms and coercion ───────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A date as YYYY-MM-DD: ISO strings, "October 20, 2026", "20 Oct 2026", or epoch seconds/ms. */
export function toIsoDate(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const words = text.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const month = words.findIndex((w) => MONTHS.includes(w.slice(0, 3)) && /^[a-z]+\.?$/.test(w));
  const numbers = words.filter((w) => /^\d{1,4}(st|nd|rd|th)?$/.test(w)).map((w) => parseInt(w, 10));
  const year = numbers.find((n) => n >= 1000);
  const day = numbers.find((n) => n >= 1 && n <= 31);
  if (month === -1 || year === undefined || day === undefined) return undefined;
  return `${year}-${pad(MONTHS.indexOf(words[month].slice(0, 3)) + 1)}-${pad(day)}`;
}

/** A record-id-safe slug: lowercase ASCII letters, digits and dashes, at most 80 characters. */
export function slugify(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}

function applyTransform(value: unknown, transform: Transform, base?: string): unknown {
  switch (transform) {
    case "date":
      return toIsoDate(value);
    case "slug":
      return slugify(value) || undefined;
    case "number": {
      const found = /-?\d+(?:\.\d+)?/.exec(String(value ?? "").replace(/,/g, ""));
      return found ? Number(found[0]) : undefined;
    }
    case "lower":
      return String(value).toLowerCase();
    case "upper":
      return String(value).toUpperCase();
    case "url":
      try {
        const url = new URL(String(value).trim(), base);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
      } catch {
        return undefined;
      }
  }
}

/** The option `value` names, ignoring case and spacing, or undefined. */
function matchOption(value: string, options: string[]): string | undefined {
  const key = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  return options.find((option) => key(option) === key(value));
}

const isText = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

/** `values` as `field`'s type; problems are reported, and the value left out. */
export function coerce(field: DynamicField, values: unknown[], problems: string[]): unknown {
  const present = values.filter((v) => v !== undefined && v !== null && v !== "");
  const label = field.label || field.key;
  const first = present[0];
  switch (field.type) {
    case "string":
    case "reference":
      if (first === undefined) return undefined;
      if (!isText(first)) {
        problems.push(`${label}: expected text.`);
        return undefined;
      }
      return String(first);
    case "enum": {
      if (first === undefined) return undefined;
      const options = field.options ?? [];
      if (options.length === 0) return String(first);
      const option = matchOption(String(first), options);
      if (!option) problems.push(`${label}: "${String(first)}" is not one of ${options.join(", ")}.`);
      return option;
    }
    case "number": {
      if (first === undefined) return undefined;
      const n = typeof first === "number" ? first : Number(String(first).trim());
      if (!Number.isFinite(n)) {
        problems.push(`${label}: "${String(first)}" is not a number.`);
        return undefined;
      }
      return n;
    }
    case "boolean": {
      if (first === undefined) return undefined;
      const text = String(first).trim().toLowerCase();
      if (["true", "yes", "1"].includes(text)) return true;
      if (["false", "no", "0"].includes(text)) return false;
      problems.push(`${label}: "${String(first)}" is not yes or no.`);
      return undefined;
    }
    case "list":
    case "reference_list": {
      const texts = present.filter(isText).map(String);
      const options = field.options ?? [];
      if (options.length === 0) return texts;
      const matched = texts.map((t) => matchOption(t, options));
      texts.forEach((t, i) => {
        if (!matched[i]) problems.push(`${label}: "${t}" is not one of ${options.join(", ")}.`);
      });
      return [...new Set(matched.filter((m): m is string => !!m))];
    }
    default:
      if (present.length > 0) problems.push(`${label}: ${field.type} fields can't be imported yet.`);
      return undefined;
  }
}

// ─── Mapping ───────────────────────────────────────────────────────────

/** One imported item: its record, and what a reviewer should look at. */
export interface MappedItem {
  /** The record id, when `id_from` gave a usable one. */
  id?: string;
  record: Record<string, unknown>;
  problems: string[];
}

interface MappingConfig {
  /** The source's address; "| url" resolves relative links against it. */
  api_endpoint?: string;
  source_format: SourceFormat;
  items_path: string;
  id_from: string;
  field_mappings: Record<string, FieldRule>;
}

/** Same shape as the record ids the admin and the app accept. */
export const RECORD_ID = /^(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/;

function readRule(doc: Doc, node: unknown, rule: string): unknown[] | { error: string } {
  const parsed = parseRule(rule, doc.attributes);
  if ("error" in parsed) return parsed;
  if (parsed.constant !== undefined) return [parsed.constant];
  try {
    return doc
      .read(node, parsed)
      .map((value) => parsed.transforms.reduce<unknown>((v, t) => (v === undefined ? v : applyTransform(v, t, doc.base)), value))
      .filter((value) => value !== undefined);
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function mapFields(
  doc: Doc,
  node: unknown,
  fields: DynamicField[],
  rules: Record<string, FieldRule>,
  problems: string[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of fields) {
    const rule = rules[field.key];
    if (rule === undefined || (typeof rule === "string" && rule.trim() === "")) continue;
    const label = field.label || field.key;
    if (typeof rule !== "string") {
      if (field.type !== "object_array") {
        problems.push(`${label}: only list-of-objects fields take a repeated mapping.`);
        continue;
      }
      if (rule.each.trim() === "") continue;
      let matches: unknown[];
      try {
        matches = doc.select(node, rule.each);
      } catch (err) {
        problems.push(`${label}: ${(err as Error).message}`);
        continue;
      }
      const rows = matches
        .map((match) => mapFields(doc, match, field.subFields ?? [], rule.fields, problems))
        .filter((row) => Object.keys(row).length > 0);
      if (rows.length > 0) record[field.key] = rows;
      continue;
    }
    if (field.type === "object_array") {
      problems.push(`${label}: map each item and its fields, not a single value.`);
      continue;
    }
    const values = readRule(doc, node, rule);
    if ("error" in values) {
      problems.push(`${label}: ${values.error}`);
      continue;
    }
    const value = coerce(field, values, problems);
    if (value !== undefined && !(Array.isArray(value) && value.length === 0)) record[field.key] = value;
  }
  return record;
}

/** Required fields a record is missing, as problems. */
export function missingRequired(fields: DynamicField[], record: Record<string, unknown>): string[] {
  return fields
    .filter((f) => f.required)
    .filter((f) => {
      const value = record[f.key];
      return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    })
    .map((f) => `${f.label || f.key} is required.`);
}

/**
 * Every item in `body` as a record of `fields`. Throws only when the source
 * itself can't be read (bad JSON, a bad item selector).
 */
export function mapDocument(body: string, config: MappingConfig, fields: DynamicField[]): MappedItem[] {
  const doc = parseDocument(body, config.source_format, config.api_endpoint);
  if (config.source_format === "html" && config.items_path.trim() === "") {
    throw new Error("HTML sources need an item selector.");
  }
  const items = doc.items(config.items_path);
  return items.map((node) => {
    const problems: string[] = [];
    const record = mapFields(doc, node, fields, config.field_mappings, problems);
    const idSource = config.id_from ? record[config.id_from] : undefined;
    const id = slugify(idSource);
    if (!config.id_from) problems.push("Pick the field the record id comes from.");
    else if (!id || !RECORD_ID.test(id)) problems.push("No record id: the id field came out empty.");
    problems.push(...missingRequired(fields, record));
    return id && RECORD_ID.test(id) ? { id, record: { id, ...record }, problems } : { record, problems };
  });
}
