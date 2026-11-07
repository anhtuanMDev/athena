/**
 * A reference's record as the app shows it (zms src/content/model.ts:
 * isReferenceField, referenceFolder, referenceFolders, referenceLabels), so the
 * admin's screen preview names it as the app does, as enum-options.ts mirrors
 * the app's enum options. A reference holds the id of another record (a mode's
 * maps, a patch's hero); the admin's picker loads them from
 * "/api/{game}/<folder>", the only endpoint it lets a schema name.
 */
import { APP_POLICY } from "./screen-policy";

export interface ReferenceField {
  key: string;
  type: string;
  /** Where the ids point, as the admin saves it ("/api/{game}/heroes"). */
  referenceApiEndpoint?: string;
  /** Which keys of those records are the id and the label: "title", or a "{key}" template. */
  referenceValueKey?: string;
  referenceLabelKey?: string;
  subFields?: ReferenceField[];
}

type ContentRecord = Record<string, unknown>;

const REFERENCE_ENDPOINT = /^\/api\/\{game\}\/([a-z][a-z0-9-]*)$/;

export function isReferenceField(field: { type: string }): boolean {
  return field.type === "reference" || field.type === "reference_list";
}

/** The folder a reference field's ids point into, when it's a configured category's. */
export function referenceFolder(field: ReferenceField, categories: readonly { folder: string }[]): string | undefined {
  if (!isReferenceField(field)) return undefined;
  const folder = REFERENCE_ENDPOINT.exec(field.referenceApiEndpoint ?? "")?.[1];
  return folder && categories.some((c) => c.folder === folder) ? folder : undefined;
}

/** The folders a field's references point into, its entries' sub-fields included: each once, at most `max`. */
export function referenceFolders(field: ReferenceField, categories: readonly { folder: string }[], max: number): string[] {
  const folders: string[] = [];
  const walk = (f: ReferenceField) => {
    const folder = referenceFolder(f, categories);
    if (folder && !folders.includes(folder)) folders.push(folder);
    if (Array.isArray(f.subFields)) f.subFields.forEach(walk);
  };
  walk(field);
  return folders.slice(0, max);
}

/** The id a record is referenced by: the field's value key, else its id ("||" as the picker reads them: an empty value counts as none). */
const referencedId = (record: ContentRecord, field: ReferenceField) => String(record[field.referenceValueKey ?? "id"] || record.id || "");

/** The app cuts any text it shows (zms policy.ts clampText). */
const clampText = (value: string) => (value.length > APP_POLICY.limits.text ? `${value.slice(0, APP_POLICY.limits.text - 1)}…` : value);

/**
 * Each record's label by its id, as the admin's picker labels its options:
 * the label key ("title") or a "{key}" template ("{name} ({role})"), else
 * the record's name, else its id. Records without an id are left out.
 */
export function referenceLabels(records: readonly ContentRecord[], field: ReferenceField): Map<string, string> {
  const labelKey = field.referenceLabelKey ?? "name";
  const labels = new Map<string, string>();
  for (const record of records) {
    const id = referencedId(record, field);
    if (!id) continue;
    const label = labelKey.includes("{")
      ? labelKey.replace(/{([^}]+)}/g, (_, key: string) => String(record[key] || ""))
      : String(record[labelKey] || record.name || record.id || "");
    labels.set(id, clampText(label || id));
  }
  return labels;
}

/** Each record by the id it is referenced by, as referenceLabels finds it: the record a linked reference opens. */
export function referenceRecords(records: readonly ContentRecord[], field: ReferenceField): Map<string, ContentRecord> {
  const found = new Map<string, ContentRecord>();
  for (const record of records) {
    const id = referencedId(record, field);
    // The last of two with one id, as its label is.
    if (id) found.set(id, record);
  }
  return found;
}

/**
 * The screen a linked reference to a record of `category` opens: the game's
 * one detail screen of that category. None when it has none, or several (the
 * app wouldn't know which to open), so the reference isn't a link.
 */
export function detailScreenFor<T>(screens: readonly T[], category: string): T | undefined {
  const matches = screens.filter((screen) => {
    const s = screen as { type?: unknown; source?: { category?: unknown } } | null;
    return !!s && s.type === "detail" && s.source?.category === category;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

// ─── The admin's picker ─────────────────────────────────────────────────

/** The keys of a "{key}" template ("{name} ({role})": name, role). */
const templateKeys = (template: string) => [...template.matchAll(/{([^}]+)}/g)].map((m) => m[1]);

/**
 * The keys the admin's reference picker asks a folder listing for (keysOnly),
 * so it can label every option: the value key and id, then the label key and
 * name (its fallback), or each key of a "{key}" template. Asked for as written,
 * a template matched no key, and one with a comma was split in two, so every
 * option was labelled " ()". Null when a key holds a comma, which the list
 * can't carry: the picker then reads whole records.
 */
export function pickerKeys(valueKey = "id", labelKey = "name"): string[] | null {
  const keys = [...new Set([valueKey, "id", ...(labelKey.includes("{") ? templateKeys(labelKey) : [labelKey, "name"])])];
  return keys.some((key) => key.includes(",")) ? null : keys;
}

/** An option of the admin's reference picker: a record's id and label (referenceLabels is the app's same rule). */
export function pickerOption(record: ContentRecord, valueKey = "id", labelKey = "name"): { id: string; name: string } {
  const name = labelKey.includes("{")
    ? labelKey.replace(/{([^}]+)}/g, (_, key: string) => String(record[key] || ""))
    : String(record[labelKey] || record.name || record.id || "");
  return { id: String(record[valueKey] || record.id || ""), name };
}
