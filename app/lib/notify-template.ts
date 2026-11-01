// A category's push notification (categories.json `notify`) as players see it:
// its {field} templates filled from the published record. The server renders
// it (app/lib/push.ts) and the Categories page previews it with the same code.

import { PLACEHOLDER, type Category, type NotifyConfig } from "./categories";

/** What FCM shows without cutting, roughly, on a locked phone. */
export const TITLE_LIMIT = 65;
export const BODY_LIMIT = 240;

/** Field types that read as text; nested lists of entries (abilities, object_array…) don't. */
const TEXT_TYPES = ["string", "number", "enum", "reference", "list", "reference_list"];
/** Every record has its id; hero, map and mode records also have the name their built-in editors require. */
const BUILT_IN_FIELDS: Record<string, string[]> = { hero: ["name"], map: ["name"], mode: ["name"] };
// Control characters, and the bidi overrides and isolates that can reorder what's shown.
const UNSAFE_CHARS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The top-level text fields of parsed schema files, by category: what templates may use besides the built-ins. */
export function templateFieldsByCategory(schemas: readonly unknown[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const schema of schemas) {
    if (!isObject(schema) || typeof schema.category !== "string" || !Array.isArray(schema.fields)) continue;
    const keys = (fields[schema.category] ??= []);
    for (const field of schema.fields) {
      if (isObject(field) && typeof field.key === "string" && TEXT_TYPES.includes(String(field.type)) && !keys.includes(field.key)) keys.push(field.key);
    }
  }
  return fields;
}

/** The placeholders a category's templates may use. */
export function allowedFields(category: string, fields: Record<string, string[]>): string[] {
  return ["id", ...(BUILT_IN_FIELDS[category] ?? []), ...(fields[category] ?? [])];
}

/**
 * Placeholders that name no text field of the category in any game's schemas.
 * `fields` comes from templateFieldsByCategory; a category missing from it
 * allows only the built-ins.
 */
export function notifyTemplateProblems(categories: readonly Category[], fields: Record<string, string[]>): string[] {
  const problems: string[] = [];
  for (const { category, label, notify } of categories) {
    if (!notify) continue;
    const allowed = allowedFields(category, fields);
    const unknown = [...`${notify.title} ${notify.body}`.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((name) => !allowed.includes(name));
    for (const name of new Set(unknown)) {
      problems.push(`${label}: the notification uses {${name}}, which isn't a text field of its schemas; use ${allowed.map((f) => `{${f}}`).join(", ")}.`);
    }
  }
  return problems;
}

function fieldText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string" || typeof v === "number").join(", ");
  return "";
}

/** `template` filled from `record` as one line of at most `limit` characters; a missing field is empty. */
export function renderTemplate(template: string, record: Record<string, unknown>, limit: number): string {
  const filled = template.replace(PLACEHOLDER, (_, name: string) => fieldText(Object.hasOwn(record, name) ? record[name] : undefined));
  const line = filled.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  // By code point, so an emoji is never cut in half.
  const chars = Array.from(line);
  return chars.length <= limit ? line : `${chars.slice(0, limit - 1).join("").trimEnd()}…`;
}

export function renderNotification(notify: NotifyConfig, record: Record<string, unknown>): { title: string; body: string } {
  return { title: renderTemplate(notify.title, record, TITLE_LIMIT), body: renderTemplate(notify.body, record, BODY_LIMIT) };
}
