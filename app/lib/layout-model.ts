// Layout files under data/<game>/layouts/<schemaId>.json, rendered by the mobile app's
// SchemaRenderer (see .agents/context/MOBILE_API_CONTEXT.md). Block types and their props
// come from data/_meta/mobile_primitives.json, which is generated from the app's source.

export interface LayoutSection {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visible?: boolean;
}

export interface LayoutData {
  schemaVersion?: number;
  gameId?: string;
  category?: string;
  sections?: LayoutSection[];
  detailLayout?: LayoutSection[];
  cardLayout?: LayoutSection[];
  [key: string]: unknown;
}

export type LayoutVariant = "detail" | "card";

export interface PropSpec {
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface PrimitiveSpec {
  name: string;
  description?: string;
  props: Record<string, PropSpec>;
}

export type PrimitiveManifest = Record<string, PrimitiveSpec>;

export interface FieldOption {
  key: string;
  type: string;
}

export interface LayoutIssue {
  sectionId: string;
  prop?: string;
  level: "error" | "warning";
  kind: "duplicate-id" | "unknown-type" | "required" | "node-prop" | "unknown-field";
  message: string;
}

// A prop value of "data.<path>" is resolved against the entity record by the app;
// anything else is passed through as a literal.
export const BINDING_PREFIX = "data.";

export function isBinding(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(BINDING_PREFIX) && value.length > BINDING_PREFIX.length;
}

export function bindingPath(value: string): string {
  return value.slice(BINDING_PREFIX.length);
}

export function toBinding(path: string): string {
  return BINDING_PREFIX + path;
}

// React nodes and callbacks are supplied by the app, never by a layout file.
export function isConfigurable(spec: PropSpec): boolean {
  return spec.type !== "node";
}

// Raw React Native style objects stay in the JSON escape hatch rather than the form.
export const FORM_EXCLUDED_PROPS = new Set(["style"]);

export function formProps(spec: PrimitiveSpec | undefined): [string, PropSpec][] {
  if (!spec) return [];
  return Object.entries(spec.props).filter(([name]) => !FORM_EXCLUDED_PROPS.has(name));
}

export function extraProps(section: LayoutSection, spec: PrimitiveSpec | undefined): Record<string, unknown> {
  const known = new Set(formProps(spec).map(([name]) => name));
  return Object.fromEntries(Object.entries(section.props).filter(([name]) => !known.has(name)));
}

export function normalizeManifest(raw: unknown): PrimitiveManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([, value]) => value && typeof value === "object" && typeof (value as PrimitiveSpec).props === "object",
  ) as [string, PrimitiveSpec][];
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

const ARRAY_FIELD_TYPES = new Set(["list", "abilities", "object_array", "reference_list", "collection"]);
const OBJECT_FIELD_TYPES = new Set(["weapon", "object"]);

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

// Schema fields first, then keys every record carries (id, name) and any other keys
// found in the sample records, so bindings to real data never read as typos.
export function collectFields(
  schemaFields: FieldOption[],
  records: Record<string, unknown>[],
  withRecordKeys: boolean,
): FieldOption[] {
  const fields = [...schemaFields];
  const seen = new Set(fields.map((f) => f.key));
  if (!withRecordKeys) return fields;
  for (const key of ["id", "name"]) {
    if (!seen.has(key)) {
      fields.push({ key, type: "string" });
      seen.add(key);
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

export function resolvePath(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
    data,
  );
}

export function resolveProp(value: unknown, data: Record<string, unknown> | null): unknown {
  if (!isBinding(value)) return value;
  return data ? resolvePath(data, bindingPath(value)) : undefined;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

// A path is known when it, or one of its parents, is a field ("game.name" or "stats.health").
function isKnownPath(path: string, known: Set<string>): boolean {
  const parts = path.split(".");
  for (let i = 1; i <= parts.length; i++) {
    if (known.has(parts.slice(0, i).join("."))) return true;
  }
  return false;
}

export function validateSections(
  sections: LayoutSection[],
  manifest: PrimitiveManifest | null,
  fields: FieldOption[],
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const known = new Set(fields.map((f) => f.key));
  const seenIds = new Set<string>();

  for (const section of sections) {
    // Hidden blocks are skipped by the app, so their gaps only warn.
    const level = section.visible === false ? "warning" : "error";
    const add = (issue: Omit<LayoutIssue, "sectionId" | "level">, issueLevel: LayoutIssue["level"] = level) =>
      issues.push({ sectionId: section.id, level: issueLevel, ...issue });

    if (seenIds.has(section.id)) add({ kind: "duplicate-id", message: `Block id "${section.id}" is used more than once.` }, "error");
    seenIds.add(section.id);

    const spec = manifest?.[section.type];
    if (manifest && !spec) {
      add({ kind: "unknown-type", message: `"${section.type}" is not in mobile_primitives.json, so the app skips this block.` }, "warning");
    }

    for (const [name, propSpec] of Object.entries(spec?.props ?? {})) {
      if (!propSpec.required) continue;
      if (!isConfigurable(propSpec)) {
        add({ prop: name, kind: "node-prop", message: `${name} is a React node the app must supply; a layout file can't set it.` }, "warning");
      } else if (isEmptyValue(section.props[name])) {
        add({ prop: name, kind: "required", message: `${name} is required.` });
      }
    }

    for (const [name, value] of Object.entries(section.props)) {
      if (isBinding(value) && known.size > 0 && !isKnownPath(bindingPath(value), known)) {
        add({ prop: name, kind: "unknown-field", message: `${name} is bound to "${bindingPath(value)}", which this schema doesn't have.` });
      }
    }
  }
  return issues;
}

export function createSection(type: string): LayoutSection {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id: `sec_${suffix}`, type, props: {}, visible: true };
}

export function readLayouts(layout: LayoutData | null): Record<LayoutVariant, LayoutSection[]> {
  return {
    detail: layout?.detailLayout ?? layout?.sections ?? [],
    card: layout?.cardLayout ?? [],
  };
}

const CATEGORY_FOLDERS: Record<string, string> = {
  hero: "heroes",
  map: "maps",
  mode: "modes",
  patch: "patches",
  item: "items",
};

export function recordFolderFor(category: string): string | null {
  return CATEGORY_FOLDERS[category] ?? null;
}

export function recordLabel(record: Record<string, unknown>): string {
  for (const key of ["name", "title", "hero_name", "item_name", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return "Untitled record";
}
