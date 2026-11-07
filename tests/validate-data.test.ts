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

/** A small data repo that passes: the fixtures' meta files and schemas, three screens and their tabs. */
function baseRepo(): Record<string, unknown> {
  const files: Record<string, unknown> = {
    "data/_meta/mobile_primitives.json": fixture("mobile_primitives.json"),
    "data/_meta/categories.json": fixture("categories.json"),
    "data/_meta/games.json": { games: [{ slug: "overwatch", name: "Overwatch 2" }] },
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
    assert.equal(result.checked, 3 + 1 + readdirSync(schemaDir).length + 1);
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
    assert.match(bad.stdout, /: 1 problem\.$/m);
  });

  it("exits 2 without a directory", () => {
    assert.equal(node().status, 2);
  });
});
