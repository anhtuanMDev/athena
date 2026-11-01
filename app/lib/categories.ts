// Record categories (heroes, maps, news…) come from one file in the data repo,
// data/_meta/categories.json. Its rules are code, mirrored in zms
// (src/content/categories.ts): whatever the file says, a category can never
// name an internal folder (_meta, cron_jobs, imports, schemas, screens…),
// leave the game's folder, or move the folders whose editors are built in.

export const CATEGORIES_PATH = "data/_meta/categories.json";

/** Icons a category may use: names both the admin and the app can draw (lucide's). */
export const CATEGORY_ICONS = [
  "users",
  "map",
  "crosshair",
  "swords",
  "box",
  "file-clock",
  "newspaper",
  "calendar",
  "trophy",
  "star",
  "flag",
  "shield",
  "book-open",
  "sparkles",
  "target",
  "zap",
  "globe",
  "lightbulb",
  "images",
  "list",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export interface Category {
  /** What schemas and screens name: "hero". */
  category: string;
  /** Where its records live, data/<game>/<folder>: "heroes". */
  folder: string;
  /** "Heroes" */
  label: string;
  /** "Hero" */
  singular: string;
  icon: CategoryIcon;
  /** Whether players can save its records as favorites in the app. */
  favoritable: boolean;
}

/** The categories before the file existed; also used when it's missing or has none that are usable. */
export const DEFAULT_CATEGORIES: readonly Category[] = [
  { category: "hero", folder: "heroes", label: "Heroes", singular: "Hero", icon: "users", favoritable: true },
  { category: "map", folder: "maps", label: "Maps", singular: "Map", icon: "map", favoritable: true },
  { category: "mode", folder: "modes", label: "Modes", singular: "Mode", icon: "crosshair", favoritable: true },
  { category: "item", folder: "items", label: "Items", singular: "Item", icon: "box", favoritable: true },
  { category: "patch", folder: "patches", label: "Patches", singular: "Patch", icon: "file-clock", favoritable: true },
  { category: "news", folder: "news", label: "News", singular: "Article", icon: "newspaper", favoritable: false },
];

export const MAX_CATEGORIES = 24;
const MAX_LABEL = 40;
const CATEGORY_NAME = /^[a-z][a-z0-9_]{0,39}$/;
// No "_", "." or "/": _meta, cron_jobs and ../x can't even be written.
const FOLDER_NAME = /^[a-z][a-z0-9-]{0,39}$/;
/** Folders of a game that aren't records, and the admin's own routes under a game. */
export const RESERVED_FOLDERS = ["imports", "syncs", "schemas", "screens", "enums", "assets", "navigation", "cron", "raw"];
/** Schema categories that aren't records: import job definitions. */
const RESERVED_CATEGORIES = ["cron_job"];
/** Categories whose editors are built into the admin, so their folders can't move. */
const FIXED_FOLDERS: Record<string, string> = { hero: "heroes", map: "maps", mode: "modes" };

/** Whether `folder` may hold records: the format, and not an internal folder. Says nothing about the config. */
export function isCategoryFolderFormat(folder: string): boolean {
  return FOLDER_NAME.test(folder) && !RESERVED_FOLDERS.includes(folder);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * The usable categories in a parsed categories.json, and what's wrong with
 * the rest. Readers use the list; the write API refuses a file with problems.
 * With no usable category, the list is DEFAULT_CATEGORIES.
 */
export function normalizeCategories(raw: unknown): { categories: Category[]; problems: string[] } {
  if (!isObject(raw) || !Array.isArray(raw.categories)) {
    return { categories: [...DEFAULT_CATEGORIES], problems: ['The file needs a "categories" list.'] };
  }
  const problems: string[] = [];
  const categories: Category[] = [];
  raw.categories.forEach((entry: unknown, i: number) => {
    const where = `Category ${i + 1}`;
    if (!isObject(entry)) return problems.push(`${where} isn't an object.`);
    const { category, folder } = entry;
    if (typeof category !== "string" || !CATEGORY_NAME.test(category) || RESERVED_CATEGORIES.includes(category)) {
      return problems.push(`${where}: "${String(category)}" can't be a category; use lowercase letters, digits and _, starting with a letter.`);
    }
    if (typeof folder !== "string" || !isCategoryFolderFormat(folder)) {
      return problems.push(`${where}: "${String(folder)}" can't be a folder; use lowercase letters, digits and -, starting with a letter, and not ${RESERVED_FOLDERS.join(", ")}.`);
    }
    const fixed = FIXED_FOLDERS[category];
    if ((fixed && fixed !== folder) || (!fixed && Object.values(FIXED_FOLDERS).includes(folder))) {
      return problems.push(`${where}: ${Object.entries(FIXED_FOLDERS).map(([c, f]) => `${c} uses ${f}`).join(", ")}; their editors are built in.`);
    }
    if (categories.some((c) => c.category === category || c.folder === folder)) {
      return problems.push(`${where}: "${category}" or "${folder}" is already used.`);
    }
    const label = text(entry.label);
    if (!label || label.length > MAX_LABEL) return problems.push(`${where}: the label must be 1 to ${MAX_LABEL} characters.`);
    if (categories.length >= MAX_CATEGORIES) return problems.push(`${where}: only ${MAX_CATEGORIES} categories are allowed.`);

    let singular = text(entry.singular);
    if (entry.singular !== undefined && (!singular || singular.length > MAX_LABEL)) {
      problems.push(`${where}: the singular must be 1 to ${MAX_LABEL} characters.`);
      singular = "";
    }
    let icon: CategoryIcon = "list";
    if ((CATEGORY_ICONS as readonly unknown[]).includes(entry.icon)) icon = entry.icon as CategoryIcon;
    else if (entry.icon !== undefined) problems.push(`${where}: "${String(entry.icon)}" isn't one of the icons (${CATEGORY_ICONS.join(", ")}).`);
    if (entry.favoritable !== undefined && typeof entry.favoritable !== "boolean") problems.push(`${where}: favoritable must be true or false.`);
    categories.push({ category, folder, label, singular: singular || label, icon, favoritable: entry.favoritable === true });
  });
  if (categories.length === 0) {
    problems.push("No usable category: the built-in ones are used.");
    return { categories: [...DEFAULT_CATEGORIES], problems };
  }
  return { categories, problems };
}

/** The categories in categories.json's text: the built-in ones when it's missing or isn't JSON. */
export function parseCategories(json: string | null | undefined): Category[] {
  if (json == null) return [...DEFAULT_CATEGORIES];
  try {
    return normalizeCategories(JSON.parse(json)).categories;
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

/**
 * The configured categories, read with `read` (which rejects with a `status`
 * of 404 for a missing file). Any failure gives the built-in ones, so the
 * existing six keep working whatever happens to the file.
 */
export async function readCategories(read: (path: string) => Promise<string>): Promise<Category[]> {
  try {
    return parseCategories(await read(CATEGORIES_PATH));
  } catch (err) {
    if ((err as { status?: number } | null)?.status !== 404) console.error("categories.json couldn't be read; using the built-in categories:", err);
    return [...DEFAULT_CATEGORIES];
  }
}

/** Whether checking a write to `path` needs the configured categories: a schema's references name them. */
export const needsCategories = (path: string) => /^data\/[^/]+\/schemas\/[^/]+\.json$/.test(path);

/** Where a reference field may read its options: a category folder of the record's own game. */
export function referenceEndpoints(categories: readonly Pick<Category, "folder">[]): string[] {
  return categories.map((c) => `/api/{game}/${c.folder}`);
}
