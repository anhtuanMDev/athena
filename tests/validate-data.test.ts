import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { LINK_HOSTS } from "../app/lib/screen-policy";
import { problemAnnotation, problemLine, run, validateDataRepo } from "../tools/validate-data";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8"));
const schemaDir = new URL("./fixtures/overwatch/schemas/", import.meta.url);

/** A games.json entry the app shows: a developer and the 14 dark colors (F10). */
function game(slug: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const dark = fixture("palette-cases.json").dark as Record<string, string>;
  return { slug, name, developer: "", active: true, ...dark, ...extra };
}

/** A small data repo that passes: the fixtures' meta files and schemas, three screens and their tabs. */
function baseRepo(): Record<string, unknown> {
  const files: Record<string, unknown> = {
    "data/_meta/mobile_primitives.json": fixture("mobile_primitives.json"),
    "data/_meta/categories.json": fixture("categories.json"),
    "data/_meta/games.json": { games: [game("overwatch", "Overwatch 2")] },
    "data/overwatch/news/weekly-recall-going-ultra.json": fixture("overwatch/news/weekly-recall-going-ultra.json"),
    "data/overwatch/syncs/cron-overwatch-news.json": { lastRun: "2026-11-01T00:00:00.000Z" },
    "data/overwatch/screens/home.json": { type: "home", title: "Home", blocks: [{ id: "h", type: "screen_header", props: { title: "Overwatch" } }] },
    "data/overwatch/screens/news.json": { type: "list", source: { category: "news" }, blocks: [] },
    "data/overwatch/screens/news-detail.json": { type: "detail", blocks: [] },
    "data/overwatch/navigation.json": {
      tabs: [
        { screen: "home", label: "Home" },
        { screen: "news", label: "News" },
        { screen: "app:settings", label: "Settings" },
      ],
    },
  };
  for (const name of readdirSync(schemaDir)) files[`data/overwatch/schemas/${name}`] = JSON.parse(readFileSync(new URL(name, schemaDir), "utf8"));
  return files;
}

const made: string[] = [];
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Writes `files` (objects as JSON, strings as they are) to a new directory. */
function repo(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "athena-data-repo-"));
  made.push(root);
  for (const [path, content] of Object.entries(files)) {
    if (content === undefined) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return root;
}

const messages = (root: string) => validateDataRepo(root).problems.map((p) => `${p.path}: ${p.message}`);

describe("checking a data repo", () => {
  it("passes a repo the admin would have written", () => {
    const result = validateDataRepo(repo(baseRepo()));
    assert.deepEqual(result.problems, []);
    assert.equal(result.files, Object.keys(baseRepo()).length);
    // Screens, navigation, schemas and categories.json go through the admin's rules.
    assert.equal(result.checked, 3 + 1 + readdirSync(schemaDir).length + 1 + 1 + 1);
  });

  it("reports a game folder that no game in games.json names", () => {
    const files = { ...baseRepo(), "data/valorant/schemas/agent.json": { id: "agent", name: "Agent", category: "hero", fields: [] } };
    assert.deepEqual(messages(repo(files)), [
      'data/valorant: no game in data/_meta/games.json has the slug "valorant", so the admin and the app never show this data.',
    ]);
  });

  it("doesn't count _meta or any other folder starting with _ as a game, nor want a folder for each game", () => {
    const files = {
      ...baseRepo(),
      "data/_meta/games.json": { games: [game("overwatch", "Overwatch 2"), game("marvel-rivals", "Marvel Rivals", { active: false })] },
      "data/_shared/notes.json": {},
    };
    assert.deepEqual(messages(repo(files)), []);
  });

  it("checks no game folder when games.json can't be read", () => {
    // (categories.json's templates then can't be checked against the games' schemas either.)
    const problems = messages(repo({ ...baseRepo(), "data/_meta/games.json": "{ nope" }));
    assert.ok(problems.some((p) => /^data\/_meta\/games\.json: isn't valid JSON/.test(p)));
    assert.ok(!problems.some((p) => /has the slug/.test(p)), problems.join("\n"));
  });

  it("reports every JSON file that doesn't parse, and goes on with the rest", () => {
    const files = { ...baseRepo(), "data/overwatch/news/broken.json": "{ nope", "data/overwatch/screens/home.json": "" };
    const problems = messages(repo(files));
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^data\/overwatch\/news\/broken\.json: isn't valid JSON \(/);
    assert.match(problems[1], /^data\/overwatch\/screens\/home\.json: isn't valid JSON \(/);
  });

  it("checks screens with the admin's screen rules", () => {
    const files = baseRepo();
    files["data/overwatch/screens/home.json"] = {
      type: "home",
      blocks: [{ id: "h", type: "promo_card", props: { onPress: "x", action: { url: "http://evil.example" } } }],
    };
    assert.deepEqual(messages(repo(files)), [
      'data/overwatch/screens/home.json: Block 1: "onPress" isn\'t allowed in screen files.',
      "data/overwatch/screens/home.json: Block 1 links to http://evil.example (props.action.url), which isn't an allowed https site.",
    ]);
  });

  it("checks tabs against the game's own screens, as the editor does", () => {
    const files = baseRepo();
    files["data/overwatch/navigation.json"] = {
      tabs: [
        { screen: "home", label: "Home" },
        { screen: "news-detail", label: "One" },
        { screen: "gone", label: "Gone" },
      ],
    };
    assert.deepEqual(messages(repo(files)), [
      'data/overwatch/navigation.json: Tab 2 opens "news-detail", a detail screen: it shows one entry picked from a list, so it can\'t be a tab.',
      'data/overwatch/navigation.json: Tab 3 opens "gone", which doesn\'t exist.',
    ]);
  });

  it("checks schemas against categories.json and categories.json itself", () => {
    const files = baseRepo();
    const categories = fixture("categories.json");
    categories.categories[0].folder = "Bad Folder";
    files["data/_meta/categories.json"] = categories;
    const problems = messages(repo(files));
    assert.match(problems[0], /^data\/_meta\/categories\.json: Category 1: "Bad Folder" can't be a folder/);
    // Without the heroes category, references to heroes can't be filled in.
    assert.ok(problems.slice(1).length > 0);
    assert.ok(problems.slice(1).every((p) => /^data\/overwatch\/schemas\/.+ reads its options from "\/api\/\{game\}\/heroes"/.test(p)), problems.join("\n"));
  });

  it("uses the manifest's limits, and checks the manifest's shape", () => {
    const files = baseRepo();
    const manifest = fixture("mobile_primitives.json");
    manifest.$policy.limits.screensPerGame = 2;
    manifest.$policy.limits.tabs = 2;
    manifest.$policy.linkHosts = [...LINK_HOSTS, "evil.example"];
    files["data/_meta/mobile_primitives.json"] = manifest;
    const problems = messages(repo(files));
    assert.deepEqual(problems.length, 3, problems.join("\n"));
    assert.match(problems[0], /^data\/_meta\/mobile_primitives\.json: "\$policy\.linkHosts" must be the admin's link hosts/);
    assert.equal(problems[1], "data/overwatch/navigation.json: The tab bar fits at most 2 tabs.");
    assert.equal(problems[2], "data/overwatch/screens: 3 screens; the app shows at most 2 per game.");
  });

  it("requires the manifest", () => {
    const files = { ...baseRepo(), "data/_meta/mobile_primitives.json": undefined };
    assert.deepEqual(messages(repo(files)), ["data/_meta/mobile_primitives.json: is missing; the admin and the app read the block manifest from it."]);
  });

  it("refuses symbolic links instead of following them", () => {
    const root = repo(baseRepo());
    symlinkSync("/etc", join(root, "data/overwatch/news/elsewhere"));
    assert.deepEqual(messages(root), ["data/overwatch/news/elsewhere: is a symbolic link; the data repo holds plain files only."]);
  });

  it("needs a data folder", () => {
    assert.deepEqual(messages(repo({ "README.md": "x" })), ["data: not found; run this on a checkout of the data repo."]);
  });
});

describe("its output", () => {
  // A value read from a data file, crafted to start a workflow command of its own.
  const hostile = { path: "data/x,y:z.json", message: "links to https://a.example/\n::error::pwned %0A::warning::x\r" };

  it("escapes GitHub annotations so a value can't end the line or add a command", () => {
    const line = problemAnnotation(hostile);
    assert.equal(line, "::error file=data/x%2Cy%3Az.json::links to https://a.example/%0A::error::pwned %250A::warning::x%0D");
    assert.doesNotMatch(line, /[\r\n]/);
  });

  it("keeps a plain line on one line", () => {
    assert.equal(problemLine(hostile), "data/x,y:z.json: links to https://a.example/\\n::error::pwned %0A::warning::x\\r");
    // Unicode line separators too (written by code, so this file holds no raw one).
    const separated = { path: "p", message: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x85)}c` };
    assert.equal(problemLine(separated), "p: a\\" + "u2028b\\" + "u0085c");
  });

  it("escapes values from the data repo end to end", () => {
    const files = baseRepo();
    files["data/overwatch/screens/home.json"] = {
      type: "home",
      blocks: [{ id: "h", type: "promo_card", props: { action: { url: "https://evil.example/\n::error::injected%0A" } } }],
    };
    const out: string[] = [];
    assert.equal(run([repo(files)], (line) => out.push(line), true), 1);
    const lines = out.join("\n").split("\n");
    assert.equal(lines.length, 2);
    assert.equal(
      lines[0],
      "::error file=data/overwatch/screens/home.json::Block 1 links to https://evil.example/%0A::error::injected%250A (props.action.url), which isn't an allowed https site.",
    );
    assert.match(lines[1], /^Checked \d+ JSON files/);
  });
});

describe("the command", () => {
  const cli = fileURLToPath(new URL("../tools/validate-data.ts", import.meta.url));
  const hook = fileURLToPath(new URL("./resolve-ts.mjs", import.meta.url));
  const node = (...args: string[]) =>
    spawnSync(process.execPath, ["--import", hook, cli, ...args], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });

  it("exits 0 for a good repo and 1 with the problems for a bad one", () => {
    const good = node(repo(baseRepo()));
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /^Checked \d+ JSON files \(\d+ by the admin's rules\): no problems\.$/m);
    const bad = node(repo({ ...baseRepo(), "data/overwatch/news/broken.json": "{" }));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^data\/overwatch\/news\/broken\.json: isn't valid JSON/m);
    assert.match(bad.stdout, /: 1 error\.$/m);
  });

  it("exits 2 without a directory", () => {
    assert.equal(node().status, 2);
  });
});

// ─── R3: warnings, and what the admin's rules can't see file by file ────

const levelled = (root: string) => validateDataRepo(root).problems.map((problem) => `${problem.level ?? "error"} ${problem.path}: ${problem.message}`);
const hero = (id: string, extra: Record<string, unknown> = {}) => ({ id, schema_id: "hero-hero", game: "overwatch", name: id, hero_name: id, role: "support", health: 200, abilities: [], ...extra });
const ROLE = { id: "role", name: "Role", options: [{ id: "tank", name: "Tank" }, { id: "support", name: "Support", icon: "/api/assets/overwatch/enums/role/support.png" }] };

void describe("levels", () => {
  void it("warn without failing: a warning is annotated as one, and the run exits 0", () => {
    const files = { ...baseRepo(), "data/overwatch/modes/push.json": { ...fixture("overwatch/modes/push.json"), compatible_maps: ["colosseo"] } };
    const problems = validateDataRepo(repo(files)).problems;
    assert.deepEqual(
      problems.map((problem) => [problem.level, problem.message]),
      [["warning", 'compatible_maps: "colosseo" isn\'t a record of maps; the app shows the id instead.']],
    );
    const out: string[] = [];
    assert.equal(run([repo(files)], (line) => out.push(line), true), 0);
    assert.match(out[0], /^::warning file=data\/overwatch\/modes\/push\.json::compatible_maps: /);
    assert.match(out[1], /: 1 warning\.$/);
  });

  void it("count errors and warnings apart", () => {
    const files = {
      ...baseRepo(),
      "data/overwatch/modes/push.json": { ...fixture("overwatch/modes/push.json"), compatible_maps: ["colosseo", "esperanca"] },
      "data/overwatch/news/broken.json": "{",
    };
    const out: string[] = [];
    assert.equal(run([repo(files)], (line) => out.push(line), false), 1);
    assert.match(out.at(-1)!, /: 1 error and 2 warnings\.$/);
  });
});

void describe("records", () => {
  void it("are named by their id, a record id the app accepts", () => {
    const files = {
      ...baseRepo(),
      "data/overwatch/news/no-id.json": { title: "No id" },
      "data/overwatch/news/other.json": { id: "not-other", title: "Other" },
      "data/overwatch/news/bad-.json": { id: "bad-", title: "Bad" },
    };
    assert.deepEqual(levelled(repo(files)), [
      'error data/overwatch/news/bad-.json: The file name "bad-" isn\'t a record id: 1 to 80 lowercase letters, digits, dots and dashes, starting and ending with a letter or digit, without "..".',
      "error data/overwatch/news/no-id.json: The record's id must be \"no-id\", its file's name.",
      "error data/overwatch/news/other.json: The record's id must be \"other\", its file's name.",
    ]);
  });

  void it("warn about references to records that don't exist and enum values that aren't options", () => {
    const files = {
      ...baseRepo(),
      "public/assets/overwatch/enums/role/support.png": "x",
      "data/overwatch/enums/role.json": ROLE,
      "data/overwatch/heroes/ana.json": hero("ana", { role: "Healer", difficulty: "hard" }),
      "data/overwatch/heroes/tracer.json": hero("tracer", { role: "Tank", difficulty: "Brutal" }),
      "data/overwatch/items/biotic-rounds.json": { id: "biotic-rounds", item_name: "Biotic Rounds", applicable_heroes: ["ana", "kiriko"] },
      "data/overwatch/modes/push.json": { ...fixture("overwatch/modes/push.json"), compatible_maps: [], introduced_patch: "patch-9" },
    };
    assert.deepEqual(levelled(repo(files)), [
      'warning data/overwatch/heroes/ana.json: role: "Healer" isn\'t an option of the enum role; the app shows it as stored.',
      'warning data/overwatch/heroes/tracer.json: difficulty: "Brutal" isn\'t one of the field\'s options; the app shows it as stored.',
      'warning data/overwatch/items/biotic-rounds.json: applicable_heroes: "kiriko" isn\'t a record of heroes; the app shows the id instead.',
      'warning data/overwatch/modes/push.json: introduced_patch: "patch-9" isn\'t a record of patches; the app shows the id instead.',
    ]);
  });

  void it("need the pictures they name, and warn about pictures the app won't load", () => {
    const files = {
      ...baseRepo(),
      "public/assets/overwatch/heroes/ana/portrait_2d.webp": "x",
      "public/assets/overwatch/enums/role/support.png": "x",
      "data/overwatch/enums/role.json": { ...ROLE, options: [...ROLE.options, { id: "damage", name: "Damage", icon: "/api/assets/overwatch/enums/role/damage.png" }] },
      "data/overwatch/heroes/ana.json": hero("ana", { portrait: { main: "/api/assets/overwatch/heroes/ana/portrait_2d.webp?v=0123456789ab", "3d": "/api/assets/overwatch/heroes/ana/portrait_3d.webp" } }),
      "data/overwatch/news/imgur.json": { id: "imgur", title: "Imgur", image: "https://i.imgur.com/a.png", url: "https://news.blizzard.com/x" },
    };
    assert.deepEqual(levelled(repo(files)), [
      "error data/overwatch/enums/role.json: options[2].icon: the picture /api/assets/overwatch/enums/role/damage.png doesn't exist.",
      "error data/overwatch/heroes/ana.json: portrait.3d: the picture /api/assets/overwatch/heroes/ana/portrait_3d.webp doesn't exist.",
      "warning data/overwatch/news/imgur.json: image: the app won't load the picture https://i.imgur.com/a.png.",
    ]);
  });
});

void describe("games.json", () => {
  void it("is checked as the app reads it (F10)", () => {
    const files = { ...baseRepo(), "data/_meta/games.json": { games: [game("overwatch", "Overwatch 2", { background: "" })] } };
    assert.deepEqual(levelled(repo(files)), ["error data/_meta/games.json: Game 1: background must be a hex color such as #FF8200 or #F80."]);
  });

  void it("needs the icons it names", () => {
    const files = { ...baseRepo(), "data/_meta/games.json": { games: [game("overwatch", "Overwatch 2", { icon: "/api/assets/games/overwatch-icon.webp" })] } };
    assert.deepEqual(levelled(repo(files)), ["error data/_meta/games.json: games[0].icon: the picture /api/assets/games/overwatch-icon.webp doesn't exist."]);
    assert.deepEqual(levelled(repo({ ...files, "public/assets/games/overwatch-icon.webp": "x" })), []);
  });
});

void describe("screens with the game's other screens", () => {
  void it("open a detail screen only from a list of its records (F9), and warn about a second one (C9)", () => {
    const files = {
      ...baseRepo(),
      "data/overwatch/screens/home.json": {
        type: "home",
        blocks: [{ id: "p", type: "promo_card", props: { title: "Hi", action: { screen: "news-detail" } } }],
      },
      "data/overwatch/screens/news-detail.json": { type: "detail", source: { category: "news" }, blocks: [] },
      "data/overwatch/screens/news-full.json": { type: "detail", source: { category: "news" }, blocks: [] },
    };
    assert.deepEqual(levelled(repo(files)), [
      'error data/overwatch/screens/home.json: Block 1: action opens "news-detail", a detail screen: only a list of "news" records can open it, with the record that was tapped.',
      'warning data/overwatch/screens/news-detail.json: The detail screen "news-full" shows "news" records too: notifications and reference links open neither of them. List blocks can still open either.',
      'warning data/overwatch/screens/news-full.json: The detail screen "news-detail" shows "news" records too: notifications and reference links open neither of them. List blocks can still open either.',
    ]);
  });

  void it("list configured categories that this game has schemas for (C5)", () => {
    const files = {
      ...baseRepo(),
      "data/overwatch/screens/skins.json": { type: "list", source: { category: "skin" }, blocks: [] },
      "data/overwatch/screens/events.json": { type: "list", source: { category: "event" }, blocks: [] },
      "data/_meta/categories.json": { categories: [...fixture("categories.json").categories, { category: "event", folder: "events", label: "Events" }] },
    };
    assert.deepEqual(levelled(repo(files)), [
      'error data/overwatch/screens/events.json: No schema of this game has category "event": the app shows nothing for it.',
      'error data/overwatch/screens/skins.json: source names the category "skin", which isn\'t in categories.json: the app shows nothing for it.',
    ]);
  });
});

void describe("the data repo as it is", () => {
  void it("passes zero-backend's main with only the push mode's map references as warnings", { skip: !process.env.DATA_REPO }, () => {
    const result = validateDataRepo(process.env.DATA_REPO!);
    const levels = result.problems.map((problem) => problem.level ?? "error");
    assert.equal(levels.filter((level) => level === "error").length, 0, result.problems.map((problem) => problem.message).join("\n"));
  });
});

// ─── athena-2: the manifest's fixture hashes ────────────────────────────

void describe("the manifest's fixture hashes (spec §2.7)", () => {
  void it("are those of the admin's own copies of the shared fixtures", () => {
    const manifest = fixture("mobile_primitives.json");
    manifest.$policy.fixtures["contrast-cases.json"] = "0".repeat(64);
    const problems = messages(repo({ ...baseRepo(), "data/_meta/mobile_primitives.json": manifest }));
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /^data\/_meta\/mobile_primitives\.json: "\$policy\.fixtures\.contrast-cases\.json" must be [0-9a-f]{64}, the SHA-256 of the admin's tests\/fixtures\/contrast-cases\.json: /);
  });

  void it("are read from the admin's checkout wherever it runs, as zero-backend's CI runs it", () => {
    const cli = fileURLToPath(new URL("../tools/validate-data.ts", import.meta.url));
    const hook = fileURLToPath(new URL("./resolve-ts.mjs", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", hook, cli, "."], { cwd: repo(baseRepo()), encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /: no problems\.$/m);
  });
});
