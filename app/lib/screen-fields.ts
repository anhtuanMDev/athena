import { DEFAULT_CATEGORIES } from "./categories";

import type { Categories, FieldOption, RecordSource, SchemaInfo } from "./screen-model";

// Fields bindings can read: a category's records', and on home and list screens, the game's and each folder's.

// Fields the admin stores on every record of a category, outside its dynamic schema
// (app/schemas/hero.ts for heroes).
const BASE_FIELDS: Partial<Record<string, FieldOption[]>> = {
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
const HIDDEN_FIELDS: Partial<Record<string, string[]>> = { hero: ["kit"] };

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

/** Stages a route timeline fits on one row; past these the app staggers their labels (zms RouteTimeline.tsx ONE_ROW). */
const ROUTE_ONE_ROW = 4;

function inferType(value: unknown): string {
  if (Array.isArray(value)) {
    return "list";
  }
  const type = typeof value;
  if (type === "number" || type === "boolean") {
    return type;
  }
  return value && type === "object" ? "object" : "string";
}

/** The fields whose keys aren't taken yet, in order; their keys are taken from then on. */
function unseen(candidates: readonly FieldOption[], seen: Set<string>): FieldOption[] {
  return candidates.filter((field) => {
    if (seen.has(field.key)) {
      return false;
    }
    seen.add(field.key);
    return true;
  });
}

/** Fields of a category's records: id and name, base fields, the chosen schema's (or all) fields, then keys seen in records. */
export function sourceFields(schemas: SchemaInfo[], source: RecordSource | undefined, records: Record<string, unknown>[] = []): FieldOption[] {
  if (!source?.category) {
    return [];
  }
  const fields: FieldOption[] = [
    { key: "id", type: "string", label: "ID" },
    { key: "name", type: "string", label: "Name" },
  ];
  const seen = new Set([...fields.map((field) => field.key), ...(HIDDEN_FIELDS[source.category] ?? [])]);
  const chosen = schemas.filter((schema) => schema.category === source.category && (!source.schema || schema.id === source.schema));
  // The app knows a record's fields from its schema alone (zms sourceFields), so a
  // schema's definition wins over the form's: a hero's difficulty is the schema's enum.
  const inSchemas = new Set(chosen.flatMap((schema) => schema.fields.map((field) => field.key)));
  const base = (BASE_FIELDS[source.category] ?? []).filter((field) => !inSchemas.has(field.key));
  const fromRecords = records.flatMap((record) => Object.entries(record).map(([key, value]) => ({ key, type: inferType(value) })));
  return [
    ...fields,
    ...unseen(base, seen),
    ...unseen(
      chosen.flatMap((schema) => schema.fields),
      seen,
    ),
    ...unseen(fromRecords, seen),
  ];
}

/**
 * What "data.<path>" reads on home and list screens, as the app builds it (zms
 * model.ts homeData): the game's own games.json entry, then each folder's
 * records. Without an entry, "data.game…" reads nothing, as in the app.
 */
export function homeData(
  game: Record<string, unknown> | undefined,
  recordsByCategory: Partial<Record<string, Record<string, unknown>[]>>,
  categories: Categories = DEFAULT_CATEGORIES,
): Record<string, unknown> {
  const folders = Object.fromEntries(categories.map((category) => [category.folder, recordsByCategory[category.category] ?? []]));
  return game ? { game, ...folders } : folders;
}

/**
 * A route timeline's stages as the app lays them out (zms RouteTimeline.tsx):
 * the first `limit` (the app's routeStops), and past four, labels staggered
 * on two rows so long names never meet their neighbours.
 */
export function routeLayout<T>(entries: readonly T[], limit: number): { stops: T[]; staggered: boolean } {
  const stops = entries.slice(0, limit);
  return { stops, staggered: stops.length > ROUTE_ONE_ROW };
}

/** What "data.<path>" can bind to on home and list screens. */
export function homeFields(categories: Categories = DEFAULT_CATEGORIES): FieldOption[] {
  return [...GAME_FIELDS, ...categories.map((category) => ({ key: category.folder, type: "collection", label: category.label }))];
}

/** An enum or list field the app draws chips from: one with options, or a global enum. */
function hasOptions(field: FieldOption): boolean {
  return (field.options?.length ?? 0) > 0 || Boolean(field.globalEnumId);
}

/**
 * Fields filter chips can use: an enum or list with options or a global enum.
 * The app draws the chips from those options and compares each record's value
 * (or its list's values) with them; it shows nothing for any other field.
 */
export function filterFields(fields: FieldOption[]): FieldOption[] {
  return fields.filter((field) => (field.type === "enum" || field.type === "list") && hasOptions(field));
}

/** Fields of one entry of a list field: its sub-fields, plus name/type/description/icon for abilities and weapons. */
export function entryFields(field: FieldOption | undefined): FieldOption[] {
  if (!field) {
    return [];
  }
  const sub = field.subFields ?? [];
  // Both are lists of kit items, with their sub-fields under params (dynamic-schema.ts).
  if (field.type !== "abilities" && field.type !== "weapon") {
    return sub;
  }
  return [
    { key: "name", type: "string", label: "Name" },
    { key: "type", type: "string", label: "Type" },
    { key: "description", type: "string", label: "Description" },
    { key: "icon", type: "string", label: "Icon" },
    ...sub.map((entry) => ({ ...entry, key: `params.${entry.key}` })),
  ];
}
