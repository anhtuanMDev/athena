// What a single file of the data repo can't show, for tools/validate-data.ts:
// pictures a file names must exist under public/assets (an error); references
// to records that don't exist, enum values that aren't options, record
// pictures on hosts the app won't load and a second detail screen of a
// category are warnings (the admin itself lets these happen, deleting a
// record or editing an enum, and the app shows them degraded); an action may
// open a detail screen only from a list of its records, and a source's
// category needs a schema in the game (errors).
//
// Imports no npm package: the data repo's CI runs it with Node alone.

import { fieldOptions, findEnumOption } from "../app/lib/enum-options";
import { isReferenceField, referenceFolder } from "../app/lib/reference-labels";
import { detailActionProblem, otherDetailScreens, secondDetailMessage, sourceCategory } from "../app/lib/screen-actions";
import { normalizeManifest } from "../app/lib/screen-model";

import { ROOT_PLACE, scanPictures } from "./data-picture-checks";

import type { PicturePolicy } from "../app/lib/app-pictures";
import type { Category } from "../app/lib/categories";
import type { ActionOrigin, ScreenRef } from "../app/lib/screen-actions";
import type { FieldOption, PrimitiveManifest, PrimitiveSpec } from "../app/lib/screen-model";
import type { Level, PictureScan, Report } from "./data-picture-checks";

export interface CrossProblem {
  /** Relative to the repo, with "/" separators. */
  path: string;
  message: string;
  level: Level;
}

/** What the checks read: every parsed data file, the files under public/assets, categories.json, the app's policy and its block manifest. */
export interface CrossFileInput {
  parsed: ReadonlyMap<string, unknown>;
  /** Paths relative to public/assets. */
  assets: ReadonlySet<string>;
  categories: readonly Category[];
  policy: PicturePolicy;
  manifest: unknown;
}

/** One game's files, as the checks need them. */
interface GameData {
  categories: readonly Category[];
  manifest: PrimitiveManifest | null;
  schemas: Record<string, unknown>[];
  /** Enum files by path, and their contents. */
  enumFiles: Map<string, unknown>;
  enums: unknown[];
  /** Each configured category folder's records, by folder. */
  records: Map<string, { path: string; record: unknown }[]>;
  /** Screen files by path. */
  screens: Map<string, unknown>;
}

const GAMES_PATH = "data/_meta/games.json";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The file's name without ".json". */
export const fileId = (path: string): string => path.slice(path.lastIndexOf("/") + 1, -".json".length);

/** The files directly in `folder`, with their parsed content, in the walk's order. */
function filesIn(parsed: ReadonlyMap<string, unknown>, folder: string): [string, unknown][] {
  return [...parsed].filter(([path]) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/"));
}

// ─── References and enum values ─────────────────────────────────────────

/** Where fieldProblems reports, and the game it reads other files of. */
interface FieldScan {
  game: GameData;
  report: (message: string) => void;
}

/** A field's value in a record, and where it is. */
interface FoundValue {
  value: unknown;
  at: string;
}

/** A field's non-empty text and number values, and where they are. */
interface FoundScalars {
  scalars: (string | number)[];
  at: string;
}

const isField = (value: unknown): value is FieldOption => isObject(value) && typeof value.key === "string" && typeof value.type === "string";

const scalarsOf = (value: unknown): (string | number)[] =>
  (Array.isArray(value) ? value : [value]).filter((entry): entry is string | number => (typeof entry === "string" && entry !== "") || typeof entry === "number");

/** A record's id as a reference gives it (zms referenceTargets). */
const idText = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value) : "");

/** Each record's id as references give it: its value key, else its id. */
function referenceIds(records: readonly { record: unknown }[], valueKey: string): Set<string> {
  return new Set(records.map(({ record }) => (isObject(record) ? idText([record[valueKey], record.id].find(Boolean)) : "")));
}

/** References to records that don't exist: the app shows the id. */
function checkReferences(field: FieldOption, found: FoundScalars, scan: FieldScan): void {
  const folder = referenceFolder(field, scan.game.categories);
  if (folder === undefined) {
    return;
  }
  const ids = referenceIds(scan.game.records.get(folder) ?? [], field.referenceValueKey ?? "id");
  for (const id of found.scalars.filter((value) => !ids.has(String(value)))) {
    scan.report(`${found.at}: "${String(id)}" isn't a record of ${folder}; the app shows the id instead.`);
  }
}

const hasListOptions = (field: FieldOption): boolean => field.type === "list" && Array.isArray(field.options) && field.options.length > 0;

/** Whether a field's values must be options: an enum, a global enum's, or a list with options. */
const takesOptions = (field: FieldOption): boolean => field.type === "enum" || Boolean(field.globalEnumId) || hasListOptions(field);

/** Enum values that aren't options: the app shows them as stored. A global enum this game doesn't have is the schema's problem, not the record's. */
function checkOptions(field: FieldOption, found: FoundScalars, scan: FieldScan): void {
  const enumId = field.globalEnumId ?? "";
  if (enumId !== "" && !scan.game.enums.some((entry) => isObject(entry) && entry.id === enumId)) {
    return;
  }
  const options = fieldOptions(field, scan.game.enums);
  const what = enumId === "" ? "one of the field's options" : `an option of the enum ${enumId}`;
  for (const value of found.scalars.filter((entry) => !findEnumOption(options, entry))) {
    scan.report(`${found.at}: "${String(value)}" isn't ${what}; the app shows it as stored.`);
  }
}

/** A field's entries, each with where it is. */
function entriesOf({ value, at }: FoundValue): [unknown, string][] {
  if (Array.isArray(value)) {
    return value.map((entry, index): [unknown, string] => [entry, `${at}[${String(index)}]`]);
  }
  return isObject(value) ? [[value, at]] : [];
}

/** Where a field's entries are checked by its sub-fields: each entry, an ability's or a weapon's under its params. */
function entryTargets(field: FieldOption, found: FoundValue): { record: unknown; prefix: string }[] {
  const isKit = field.type === "abilities" || field.type === "weapon";
  return entriesOf(found).map(([entry, where]) => ({
    record: isKit && isObject(entry) ? entry.params : entry,
    prefix: isKit ? `${where}.params.` : `${where}.`,
  }));
}

/** A record's (or an entry's) values, by its schema's fields, sub-fields included. */
function scanFields(fields: unknown, target: { record: unknown; prefix: string }, scan: FieldScan): void {
  const { record, prefix } = target;
  if (!Array.isArray(fields) || !isObject(record)) {
    return;
  }
  for (const field of fields.filter(isField)) {
    const value = record[field.key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const found = { value, at: `${prefix}${field.key}` };
    if (isReferenceField(field)) {
      checkReferences(field, { scalars: scalarsOf(value), at: found.at }, scan);
    } else if (takesOptions(field)) {
      checkOptions(field, { scalars: scalarsOf(value), at: found.at }, scan);
    }
    for (const entry of entryTargets(field, found)) {
      scanFields(field.subFields, entry, scan);
    }
  }
}

// ─── Screens ────────────────────────────────────────────────────────────

/** Where a screen's checks report, and the game's screens. */
interface ScreenScan {
  refs: readonly ScreenRef[];
  game: GameData;
  report: Report;
}

const isConfigured = (category: string, game: GameData): boolean => game.categories.some((entry) => entry.category === category);
const hasSchema = (category: string, game: GameData): boolean => game.schemas.some((schema) => schema.category === category);
/** A category of categories.json no schema of this game has: the app shows nothing for it. */
const lacksSchema = (category: string | undefined, game: GameData): category is string =>
  category !== undefined && isConfigured(category, game) && !hasSchema(category, game);

/** The actions of one prop that open a detail screen the block can't show what was tapped on. */
function propActionProblems(value: unknown, prop: { name: string; type: string }, context: { origin: Omit<ActionOrigin, "what">; refs: readonly ScreenRef[] }): string[] {
  if (prop.type === "action" && isObject(value)) {
    return [detailActionProblem(value.screen, context.refs, { ...context.origin, what: prop.name })].filter((problem) => problem !== undefined);
  }
  if (prop.type !== "shortcuts" || !Array.isArray(value)) {
    return [];
  }
  const tiles: unknown[] = value;
  return tiles
    .map((tile, index) => (isObject(tile) ? detailActionProblem(tile.screen, context.refs, { ...context.origin, what: `Tile ${String(index + 1)}` }) : undefined))
    .filter((problem) => problem !== undefined);
}

/** A block's actions that open a detail screen it can't show what was tapped on (F9); `category` is what it lists. */
function blockActionProblems(block: { type: unknown; props: Record<string, unknown> }, category: string | undefined, scan: ScreenScan): string[] {
  const spec: PrimitiveSpec | undefined = typeof block.type === "string" ? scan.game.manifest?.[block.type] : undefined;
  const { props } = block;
  const origin = { isList: Boolean(spec?.list), items: props.items, category };
  return Object.entries(spec?.props ?? {}).flatMap(([name, prop]) => propActionProblems(props[name], { name, type: prop.type }, { origin, refs: scan.refs }));
}

/** One block's source (C5) and actions (F9); a hidden block's problems are warnings. */
function scanBlock(block: unknown, place: { where: string; screenCategory?: string }, scan: ScreenScan): void {
  if (!isObject(block) || !isObject(block.props)) {
    return;
  }
  const level: Level = block.visible === false ? "warning" : "error";
  const listed = sourceCategory(block.props.source);
  if (lacksSchema(listed, scan.game)) {
    scan.report(level, `${place.where}: its source names the category "${listed}", which no schema of this game has: the app shows nothing for it.`);
  }
  for (const problem of blockActionProblems({ type: block.type, props: block.props }, listed ?? place.screenCategory, scan)) {
    scan.report(level, `${place.where}: ${problem}`);
  }
}

/** A screen's category (C5), a second detail screen of it (C9), and its blocks. */
function scanScreen(path: string, screen: unknown, scan: ScreenScan): void {
  if (!isObject(screen)) {
    return;
  }
  const own = sourceCategory(screen.source);
  if (lacksSchema(own, scan.game)) {
    scan.report("error", `No schema of this game has category "${own}": the app shows nothing for it.`);
  }
  if (screen.type === "detail" && own !== undefined) {
    for (const other of otherDetailScreens(fileId(path), scan.refs)) {
      scan.report("warning", secondDetailMessage(other, own));
    }
  }
  const blocks: unknown[] = Array.isArray(screen.blocks) ? screen.blocks : [];
  blocks.forEach((block, index) => {
    scanBlock(block, { where: `Block ${String(index + 1)}`, screenCategory: own }, scan);
  });
}

// ─── Games ──────────────────────────────────────────────────────────────

/** What a game's checks share: the input, and where each file's problems go. */
interface GameScan {
  input: CrossFileInput;
  reportAt: (path: string) => Report;
}

function pictureScan(scan: GameScan, target: { path: string; checksHosts: boolean }): PictureScan {
  return { assets: scan.input.assets, policy: scan.input.policy, checksHosts: target.checksHosts, report: scan.reportAt(target.path) };
}

function gameDataOf(input: CrossFileInput, game: { slug: string; manifest: PrimitiveManifest | null }): GameData {
  const files = (sub: string): [string, unknown][] => filesIn(input.parsed, `data/${game.slug}/${sub}`);
  return {
    categories: input.categories,
    manifest: game.manifest,
    schemas: files("schemas")
      .map(([, schema]) => schema)
      .filter(isObject),
    enumFiles: new Map(files("enums")),
    enums: files("enums").map(([, file]) => file),
    records: new Map(input.categories.map((category) => [category.folder, files(category.folder).map(([path, record]) => ({ path, record }))])),
    screens: new Map(files("screens")),
  };
}

/** A record's references and enum values (warnings), by the schema it follows (its schema_id, else its category's first), and its pictures. */
function scanRecord(file: { path: string; record: unknown }, schemas: Record<string, unknown>[], context: { game: GameData; scan: GameScan }): void {
  const report = context.scan.reportAt(file.path);
  const { record } = file;
  const schema = schemas.find((entry) => isObject(record) && entry.id === record.schema_id) ?? schemas.at(0);
  if (schema !== undefined) {
    scanFields(schema.fields, { record, prefix: "" }, { game: context.game, report: (message) => { report("warning", message); } });
  }
  scanPictures(record, ROOT_PLACE, pictureScan(context.scan, { path: file.path, checksHosts: true }));
}

/** One game: its records, its enums' pictures and its screens. */
function scanGame(game: GameData, scan: GameScan): void {
  for (const category of game.categories) {
    const schemas = game.schemas.filter((schema) => schema.category === category.category);
    for (const file of game.records.get(category.folder) ?? []) {
      scanRecord(file, schemas, { game, scan });
    }
  }
  for (const [path, file] of game.enumFiles) {
    scanPictures(file, ROOT_PLACE, pictureScan(scan, { path, checksHosts: true }));
  }
  const refs = [...game.screens].map(([path, screen]): ScreenRef => ({
    id: fileId(path),
    type: isObject(screen) ? screen.type : undefined,
    source: isObject(screen) ? screen.source : undefined,
  }));
  for (const [path, screen] of game.screens) {
    scanScreen(path, screen, { refs, game, report: scan.reportAt(path) });
    // A screen's literal pictures on other hosts are its own rule's errors (validateScreenFile).
    scanPictures(screen, ROOT_PLACE, pictureScan(scan, { path, checksHosts: false }));
  }
}

/** The problems across files of the games `slugs` names, and games.json's pictures, in the order they're found. */
export function crossFileProblems(input: CrossFileInput, slugs: readonly string[]): CrossProblem[] {
  const problems: CrossProblem[] = [];
  const scan: GameScan = {
    input,
    reportAt: (path) => (level, message) => {
      problems.push({ path, message, level });
    },
  };
  const manifest = normalizeManifest(input.manifest);
  for (const slug of new Set(slugs)) {
    scanGame(gameDataOf(input, { slug, manifest }), scan);
  }
  // games.json's pictures on other hosts are its own rule's errors (gamesFileProblems).
  const games = input.parsed.get(GAMES_PATH);
  if (isObject(games)) {
    scanPictures(games, ROOT_PLACE, pictureScan(scan, { path: GAMES_PATH, checksHosts: false }));
  }
  return problems;
}
