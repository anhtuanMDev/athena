// Checks a checkout of the data repo (zero-backend) with this admin's own
// rules, for that repo's CI. Every data/**/*.json must parse. Screens,
// navigation, schemas and categories.json must pass validateDataFile, given
// what the write API gives it: the categories, the schemas' template fields
// and the app's policy from the block manifest. Tabs are also checked against
// the game's screens, as the screen editor does. The manifest must have the
// shape the admin and the app rely on (manifestProblems).
//
//   node --import ./tests/resolve-ts.mjs tools/validate-data.ts <data-repo>
//
// It imports no npm package, so the data repo's CI runs it with Node alone.
// Exits 0 when there's nothing to report, 1 with problems, 2 without a folder.

import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES_PATH, parseCategories } from "../app/lib/categories";
import { templateFieldsByCategory } from "../app/lib/notify-template";
import { APP_POLICY, MANIFEST_PATH, appPolicy, manifestProblems, validateDataFile, validateNavigationFile } from "../app/lib/screen-policy";

export interface Problem {
  /** Relative to the repo, with "/" separators. */
  path: string;
  message: string;
}

const GAMES_PATH = "data/_meta/games.json";
const GAME_SLUG = /^[a-z0-9-]+$/;
/** The files the admin's rules cover; every other JSON file only has to parse. */
const RULED = /^data\/(_meta\/categories\.json|[^/]+\/(navigation\.json|screens\/[^/]+\.json|schemas\/[^/]+\.json))$/;

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
    if (!RULED.test(path)) continue;
    checked++;
    const navigation = /^data\/([^/]+)\/navigation\.json$/.exec(path);
    const messages = navigation
      ? validateNavigationFile(content, screenTypes(navigation[1]), policy)
      : validateDataFile(path, content, categories, templateFields, policy);
    for (const message of messages) problems.push({ path, message });
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

/** A problem as one log line: control characters and line separators (newlines included) are written as escapes. */
export function problemLine({ path, message }: Problem): string {
  return `${path}: ${message}`.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, (c) =>
    c === "\n" ? "\\n" : c === "\r" ? "\\r" : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** A problem as a GitHub Actions error annotation on its file, escaped as the runner expects. */
export function problemAnnotation({ path, message }: Problem): string {
  const data = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const property = (s: string) => data(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  return `::error file=${property(path)}::${data(message)}`;
}

/** Checks the repo at args[0] and writes the result; the exit code. */
export function run(args: string[], write: (line: string) => void, annotate: boolean): number {
  if (args.length !== 1) {
    write("Usage: node --import ./tests/resolve-ts.mjs tools/validate-data.ts <data-repo>");
    return 2;
  }
  const { files, checked, problems } = validateDataRepo(args[0]);
  for (const problem of problems) write(annotate ? problemAnnotation(problem) : problemLine(problem));
  const count = problems.length === 0 ? "no problems" : `${problems.length} problem${problems.length === 1 ? "" : "s"}`;
  write(`Checked ${files} JSON files (${checked} by the admin's rules): ${count}.`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.log(line), process.env.GITHUB_ACTIONS === "true");
}
