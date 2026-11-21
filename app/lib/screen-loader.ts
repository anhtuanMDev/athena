import { folderFor, normalizeManifest, normalizeSource, type PrimitiveManifest, type SchemaInfo } from "./screen-model";
import { MANIFEST_PATH, appPolicy, type AppPolicy } from "./screen-policy";
import { screenRefsOf } from "./screen-starters";

import type { ScreenRef } from "./screen-actions";

export interface EnumFile {
  id: string;
  /** Names, or { id, name, description, icon, params }: read through enum-options.ts. */
  options?: unknown[];
}

/** Where the editor reads a screen and its game's data: the admin API (github.ts), or stubs in tests. */
export interface ScreenSources {
  readFile: (path: string) => Promise<{ content: unknown; sha: string } | null>;
  /** A folder of the game: its file names, or with `withContent` the files themselves. */
  listFolder: <T>(folder: string, withContent: boolean) => Promise<T[]>;
  /** A folder's records as its list shows them (shape=summary). */
  listSummaries: (folder: string) => Promise<Records>;
  listGames: () => Promise<{ slug: string }[]>;
}

/** The screen to load: its game, id and file, and the configured categories. */
export interface ScreenRequest {
  game: string;
  id: string;
  path: string;
  categories: readonly { category: string; folder: string; label: string }[];
}

/** What the editor loads with a screen. */
export interface ScreenData {
  file: unknown;
  sha: string;
  schemas: SchemaInfo[];
  enums: EnumFile[];
  screenIds: string[];
  /** The game's other screens: where a linked reference opens (field_section linkReferences). */
  otherScreens: ScreenRef[];
  /** Every screen of the game by id (the listing names them), this one included. */
  screens: ScreenRef[];
  manifest: PrimitiveManifest | null;
  /** The app's limits and own screens; today's when the manifest has none. */
  policy: AppPolicy;
  records: Record<string, Records>;
  /** The category this screen shows whole; the others as their lists show them. */
  wholeCategory: string | undefined;
  /** The game as the app gets it, for "data.game…" on home and list screens. */
  game: Record<string, unknown> | undefined;
  /** The game's data that couldn't be read ("schemas", "heroes records"…): checks and the preview go without it. */
  failed: string[];
}

// The screen editor's data, read side by side. One source that fails leaves its part
// empty and is named in `failed`, so the page says what it couldn't read; only the
// screen's own file is needed to open the editor at all.

type Records = Record<string, unknown>[];

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

/** A schema file that names its category; the listing may hold anything. */
function isSchema(value: unknown): value is SchemaInfo {
  return typeof value === "object" && value !== null && Boolean((value as Partial<SchemaInfo>).category);
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * The game's records by category: the screen's own category whole (a detail screen
 * shows a record in full), the others as their lists show them (shape=summary), which
 * is all their labels and list previews read, and spares the page the bulk of every
 * other category's records.
 */
async function loadRecords(
  sources: ScreenSources,
  request: ScreenRequest,
  { categories, wholeCategory }: { categories: string[]; wholeCategory: string | undefined },
): Promise<{ records: Record<string, Records>; failed: string[] }> {
  const folders = categories.map((category) => folderFor(category, request.categories));
  const reads = await Promise.allSettled(
    categories.map(async (category, i) => {
      const folder = folders[i];
      if (!folder) {
        return [];
      }
      const records = category === wholeCategory ? await sources.listFolder<Record<string, unknown>>(folder, true) : await sources.listSummaries(folder);
      return Array.isArray(records) ? records : [];
    }),
  );
  const failed = categories.flatMap((category, i) => (reads[i].status === "rejected" ? [`${folders[i] ?? category} records`] : []));
  return { records: Object.fromEntries(categories.map((category, i) => [category, settledValue(reads[i], [])])), failed };
}

function readAll(sources: ScreenSources, path: string) {
  return Promise.allSettled([
    sources.readFile(path),
    sources.listFolder<SchemaInfo>("schemas", true),
    sources.listFolder<EnumFile>("enums", true),
    sources.listFolder<string>("screens", false),
    // The screens themselves: which detail screen a linked reference opens (field_section linkReferences).
    sources.listFolder<unknown>("screens", true),
    sources.readFile(MANIFEST_PATH),
    sources.listGames(),
  ] as const);
}

/** A screen and what its editor checks and previews it against. A missing manifest shows as its own note, so it isn't in `failed`. */
export async function loadScreenData(sources: ScreenSources, request: ScreenRequest): Promise<ScreenData> {
  const [fileRead, schemasRead, enumsRead, namesRead, filesRead, manifestRead, gamesRead] = await readAll(sources, request.path);
  if (fileRead.status === "rejected") {
    throw asError(fileRead.reason);
  }
  const file = fileRead.value;
  if (!file) {
    throw new Error(`Screen "${request.id}" was not found in data/${request.game}/screens.`);
  }
  const sourcesRead = { schemas: schemasRead, enums: enumsRead, "screen list": namesRead, screens: filesRead, games: gamesRead };
  const schemas = settledValue(schemasRead, []);
  const screenFiles = settledValue(filesRead, []);
  const manifest = settledValue(manifestRead, null)?.content;
  const wholeCategory = normalizeSource((file.content as { source?: unknown } | null)?.source)?.category;
  const loaded = await loadRecords(sources, request, { categories: [...new Set(schemas.map((schema) => schema.category))], wholeCategory });
  return {
    file: file.content,
    sha: file.sha,
    schemas: schemas.filter(isSchema),
    enums: settledValue(enumsRead, []),
    screenIds: settledValue(namesRead, []).filter((name) => typeof name === "string"),
    otherScreens: screenRefsOf(screenFiles).filter((ref) => ref.id !== request.id),
    screens: screenRefsOf(screenFiles),
    manifest: normalizeManifest(manifest),
    policy: appPolicy(manifest),
    records: loaded.records,
    wholeCategory,
    game: settledValue(gamesRead, []).find((game) => game.slug === request.game) as Record<string, unknown> | undefined,
    failed: [...Object.entries(sourcesRead).flatMap(([name, read]) => (read.status === "rejected" ? [name] : [])), ...loaded.failed],
  };
}
