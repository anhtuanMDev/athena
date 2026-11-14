// Checks a checkout of the data repo (zero-backend) with this admin's own
// rules, for that repo's CI. Every data/**/*.json must parse. Screens,
// navigation, schemas, categories.json, games.json and records must pass
// validateDataFile, given what the write API gives it: the categories, the
// schemas' template fields and the app's policy from the block manifest. Tabs
// are also checked against the game's screens, as the screen editor does. The
// manifest must have the shape the admin and the app rely on
// (manifestProblems). Every game folder (data/{slug}/) must be a game
// games.json lists. What a single file can't show (pictures that don't
// exist, references, enum values, actions to detail screens) is checked
// across files (data-cross-checks.ts, data-picture-checks.ts); some of it as
// warnings.
//
//   node --import ./tests/resolve-ts.mjs tools/validate-data.ts <data-repo>
//
// It imports no npm package, so the data repo's CI runs it with Node alone.
// Exits 0 when there's no error (warnings don't fail it), 1 with errors, 2
// without a folder.

import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES_PATH, isCategoryFolderFormat, parseCategories } from "../app/lib/categories";
import { GAME_SLUG } from "../app/lib/contract";
import { gameSlugs } from "../app/lib/games-guard";
import { templateFieldsByCategory } from "../app/lib/notify-template";
import { APP_POLICY, MANIFEST_PATH, appPolicy, manifestProblems, validateDataFile, validateNavigationFile } from "../app/lib/screen-policy";

import { crossFileProblems } from "./data-cross-checks";
import { assetFiles } from "./data-picture-checks";

export interface Problem {
  /** Relative to the repo, with "/" separators. */
  path: string;
  message: string;
  /** An error fails the check; a warning is reported and doesn't. Without one, an error. */
  level?: "error" | "warning";
}

const GAMES_PATH = "data/_meta/games.json";
/** The files the admin's rules cover by their path alone; every other JSON file only has to parse. */
const RULED = /^data\/(_meta\/(categories|games)\.json|[^/]+\/(navigation\.json|screens\/[^/]+\.json|schemas\/[^/]+\.json))$/;
/** A file of a game's folder: data/{game}/{folder}/{id}.json. */
const RECORD_FILE = /^data\/([^/_][^/]*)\/([^/]+)\/[^/]+\.json$/;

/** Whether `path` is a record's file: one of a record folder, whose own rules validateDataFile has (its id). */
function isRecordFile(path: string): boolean {
  const folder = RECORD_FILE.exec(path)?.[2];
  return folder !== undefined && isCategoryFolderFormat(folder);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The JSON files directly in `folder` (no deeper), of `paths`. */
const inFolder = (paths: Iterable<string>, folder: string) =>
  [...paths].filter((path) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/"));

/** The problems in the data repo checked out at `root`. */
export function validateDataRepo(root: string): { files: number; checked: number; problems: Problem[] } {
  if (!lstatSync(join(root, "data"), { throwIfNoEntry: false })?.isDirectory()) {
    return { files: 0, checked: 0, problems: [{ path: "data", message: "not found; run this on a checkout of the data repo." }] };
  }
  const problems: Problem[] = [];
  const texts = new Map<string, string>();
  const parsed = new Map<string, unknown>();

  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`;
      // A link could point outside the checkout; the admin never writes one.
      if (entry.isSymbolicLink()) problems.push({ path, message: "is a symbolic link; the data repo holds plain files only." });
      else if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        const text = readFileSync(join(root, path), "utf8");
        texts.set(path, text);
        try {
          parsed.set(path, JSON.parse(text));
        } catch (err) {
          problems.push({ path, message: `isn't valid JSON (${(err as Error).message}).` });
        }
      }
    }
  };
  walk("data");

  // The inputs the write API reads before it checks a file (functions/api).
  const manifest = parsed.get(MANIFEST_PATH);
  if (!texts.has(MANIFEST_PATH)) problems.push({ path: MANIFEST_PATH, message: "is missing; the admin and the app read the block manifest from it." });
  else if (parsed.has(MANIFEST_PATH)) for (const message of manifestProblems(manifest)) problems.push({ path: MANIFEST_PATH, message });
  const policy = parsed.has(MANIFEST_PATH) ? appPolicy(manifest) : APP_POLICY;
  const categories = parseCategories(texts.get(CATEGORIES_PATH));
  const games = parsed.get(GAMES_PATH);
  const slugs = (isObject(games) && Array.isArray(games.games) ? games.games : [])
    .map((game) => (isObject(game) ? game.slug : undefined))
    .filter((slug): slug is string => typeof slug === "string" && GAME_SLUG.test(slug));
  const schemas = slugs.flatMap((slug) => inFolder(parsed.keys(), `data/${slug}/schemas`).map((path) => parsed.get(path)));
  const templateFields = templateFieldsByCategory(schemas);

  // Each of a game's screens by its id (the file name) with its type, as the
  // screen editor passes them to validateNavigationFile. A screen that doesn't
  // parse still exists: its own problem is reported, not its tabs'.
  const screenTypes = (game: string) =>
    Object.fromEntries(
      inFolder(texts.keys(), `data/${game}/screens`).map((path) => {
        const screen = parsed.get(path);
        return [path.slice(path.lastIndexOf("/") + 1, -".json".length), isObject(screen) ? screen.type : undefined];
      }),
    );

  let checked = 0;
  for (const [path, content] of parsed) {
    if (!RULED.test(path) && !isRecordFile(path)) {
      continue;
    }
    checked++;
    const navigation = /^data\/([^/]+)\/navigation\.json$/.exec(path);
    const messages = navigation
      ? validateNavigationFile(content, screenTypes(navigation[1]), policy)
      : validateDataFile(path, content, categories, templateFields, policy);
    for (const message of messages) problems.push({ path, message });
  }

  // Across files, game by game: records against schemas, enums and each other;
  // screens against the game's screens; pictures against public/assets.
  problems.push(...crossFileProblems({ parsed, assets: assetFiles(root), categories, policy, manifest }, slugs));

  // A game's folder games.json doesn't list (a game renamed or dropped and its
  // data left behind) is data nothing shows. Folders starting with "_" (_meta)
  // aren't games; a game listed before it has any data has no folder yet.
  if (parsed.has(GAMES_PATH)) {
    const listed = new Set(gameSlugs(games));
    for (const entry of readdirSync(join(root, "data"), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_") || listed.has(entry.name)) continue;
      problems.push({ path: `data/${entry.name}`, message: `no game in ${GAMES_PATH} has the slug "${entry.name}", so the admin and the app never show this data.` });
    }
  }

  // The screen editor stops at the app's limit of screens per game.
  const screenCounts = new Map<string, number>();
  for (const path of texts.keys()) {
    const folder = /^(data\/[^/]+\/screens)\/[^/]+\.json$/.exec(path)?.[1];
    if (folder) screenCounts.set(folder, (screenCounts.get(folder) ?? 0) + 1);
  }
  for (const [folder, count] of screenCounts) {
    if (count > policy.limits.screensPerGame) {
      problems.push({ path: folder, message: `${count} screens; the app shows at most ${policy.limits.screensPerGame} per game.` });
    }
  }

  problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: texts.size, checked, problems };
}

// Paths and messages carry values from the data repo, which is written by
// the cron importer from outside sources. A value must not be able to start a
// line of its own: the Actions runner reads any line that begins with "::" as
// a workflow command.

const isWarning = (problem: Problem): boolean => problem.level === "warning";

const HEX = 16;
/** Hex digits of a \u escape. */
const ESCAPE_DIGITS = 4;

/** A control character or line separator as a log line writes it: \n, \r, else \uXXXX. */
function escapedChar(char: string): string {
  if (char === "\n") {
    return "\\n";
  }
  if (char === "\r") {
    return "\\r";
  }
  return `\\u${char.charCodeAt(0).toString(HEX).padStart(ESCAPE_DIGITS, "0")}`;
}

/** A problem as one log line, a warning marked as one: control characters and line separators (newlines included) are written as escapes. */
export function problemLine({ path, message, level }: Problem): string {
  const marker = level === "warning" ? "warning: " : "";
  return `${marker}${path}: ${message}`.replaceAll(/[\p{Cc}\p{Zl}\p{Zp}]/gu, escapedChar);
}

/** A problem as a GitHub Actions annotation on its file (an error, or a warning), escaped as the runner expects. */
export function problemAnnotation({ path, message, level }: Problem): string {
  const data = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const property = (s: string) => data(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  return `::${level === "warning" ? "warning" : "error"} file=${property(path)}::${data(message)}`;
}

const counted = (count: number, noun: string): string => `${String(count)} ${noun}${count === 1 ? "" : "s"}`;

/** The summary line's count: errors and warnings, else "no problems". */
function summary(problems: Problem[]): string {
  const warnings = problems.filter(isWarning).length;
  const errors = problems.length - warnings;
  const parts = [...(errors > 0 ? [counted(errors, "error")] : []), ...(warnings > 0 ? [counted(warnings, "warning")] : [])];
  return parts.length > 0 ? parts.join(" and ") : "no problems";
}

/** Checks the repo at args[0] and writes the result; the exit code: 1 with errors, warnings alone don't fail. */
export function run(args: string[], write: (line: string) => void, annotate: boolean): number {
  if (args.length !== 1) {
    write("Usage: node --import ./tests/resolve-ts.mjs tools/validate-data.ts <data-repo>");
    return 2;
  }
  const { files, checked, problems } = validateDataRepo(args[0]);
  for (const problem of problems) write(annotate ? problemAnnotation(problem) : problemLine(problem));
  write(`Checked ${String(files)} JSON files (${String(checked)} by the admin's rules): ${summary(problems)}.`);
  return problems.some((problem) => !isWarning(problem)) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.log(line), process.env.GITHUB_ACTIONS === "true");
}
