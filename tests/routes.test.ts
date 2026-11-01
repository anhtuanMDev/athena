import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

// Which requests run a Function. Pages runs one only for paths public/_routes.json
// includes; everything else is served as a file, with public/_headers, and an
// unknown path gets index.html (the SPA fallback Pages gives a build without a
// 404.html). Every Function counts against the Workers Free plan's 100k
// requests a day, so the admin's own files must never run one.

const FUNCTIONS = new URL("../functions/", import.meta.url);
const ROUTES_FILE = new URL("../public/_routes.json", import.meta.url);

/** functions/**.ts files, relative to functions/. */
function functionFiles(dir = FUNCTIONS, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return functionFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
    return /\.[jt]s$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [`${prefix}${entry.name}`] : [];
  });
}

const ONE = /^\[[^[\]]+\]$/; // [x]: one segment
const ANY = /^\[\[[^[\]]+\]\]$/; // [[x]]: any number of segments, none included

/** Paths that a Functions file answers, as Pages routes files (index is its folder; _middleware all under it). */
function samplePaths(file: string): string[] {
  const parts = file.replace(/\.[jt]s$/, "").split("/");
  const last = parts.pop()!;
  const at = (...rest: string[]) => `/${[...parts.map((p) => (ONE.test(p) ? "x" : p)), ...rest].join("/")}`.replace(/^\/\/+/, "/");
  if (last === "index") return [at()];
  if (last === "_middleware" || ANY.test(last)) return [at(), at("x"), at("x", "y")];
  if (ONE.test(last)) return [at("x")];
  return [at(last)];
}

/** Whether a Functions file answers `path`. */
function answers(file: string, path: string): boolean {
  const parts = file.replace(/\.[jt]s$/, "").split("/");
  const last = parts.pop()!;
  const folder = parts.map((p) => (ONE.test(p) ? "[^/]+" : p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))).join("/");
  const head = folder ? `/${folder}` : "";
  const tail = last === "index" ? "/?" : last === "_middleware" || ANY.test(last) ? "(?:/.*)?" : ONE.test(last) ? "/[^/]+" : `/${last}`;
  return new RegExp(`^${head}${tail}$`).test(path);
}

/** Whether a _routes.json rule matches a path: * is any run of characters, and "/a/*" also matches "/a". */
function matches(rule: string, path: string): boolean {
  const pattern = new RegExp(`^${rule.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return pattern.test(path) || (rule.endsWith("/*") && path === rule.slice(0, -2));
}

const routes = existsSync(ROUTES_FILE) ? (JSON.parse(readFileSync(ROUTES_FILE, "utf8")) as { version: number; include: string[]; exclude: string[] }) : null;
const runsFunction = (path: string) => !!routes && routes.include.some((r) => matches(r, path)) && !routes.exclude.some((r) => matches(r, path));

// The admin's own pages and files: index.html for any app route, and the build's assets.
const STATIC = ["/", "/index.html", "/login", "/dashboard", "/overwatch/heroes/ana/edit", "/assets/root-A1.js", "/assets/root-A1.css", "/assets/inter-x.woff2", "/favicon.svg", "/favicon.ico"];

describe("which requests run a Function", () => {
  it("lists them in public/_routes.json, in the shape Pages accepts", () => {
    assert.ok(routes, "public/_routes.json is missing: Pages would then run a Function for whatever the functions/ folder covers");
    assert.equal(routes.version, 1);
    assert.ok(routes.include.length >= 1);
    const rules = [...routes.include, ...routes.exclude];
    assert.ok(rules.length <= 100, "Pages allows 100 rules");
    for (const rule of rules) assert.match(rule, /^\/[^\s]{0,99}$/, `${rule}: a rule starts with / and has at most 100 characters`);
  });

  it("covers every Function file, so none is silently never run", () => {
    for (const file of functionFiles()) {
      for (const path of samplePaths(file)) assert.ok(runsFunction(path), `functions/${file} answers ${path}, which _routes.json doesn't include`);
    }
  });

  it("serves the admin's pages and files without one", () => {
    for (const path of STATIC) assert.equal(runsFunction(path), false, `${path} would run a Function`);
    // Nor may a Function cover them, as the old catch-all functions/[[path]].ts did.
    for (const file of functionFiles()) {
      for (const path of STATIC) assert.equal(answers(file, path), false, `functions/${file} would answer ${path}`);
    }
  });

  it("keeps the SPA fallback: no 404.html, which would make Pages answer app routes with 404", () => {
    assert.equal(existsSync(new URL("../public/404.html", import.meta.url)), false);
  });
});

describe("the routing rules' matcher", () => {
  it("matches the way Pages does", () => {
    assert.ok(matches("/api/*", "/api/auth/check"));
    assert.ok(matches("/api/*", "/api"));
    assert.ok(!matches("/api/*", "/apis"));
    assert.ok(!matches("/mobile/*", "/"));
    assert.deepEqual(samplePaths("api/[[path]].ts"), ["/api", "/api/x", "/api/x/y"]);
    assert.deepEqual(samplePaths("mobile/data.ts"), ["/mobile/data"]);
    assert.deepEqual(samplePaths("[[path]].ts"), ["/", "/x", "/x/y"]);
    assert.ok(answers("[[path]].ts", "/") && answers("[[path]].ts", "/assets/a.js"));
    assert.ok(answers("_middleware.ts", "/login"));
    assert.ok(answers("api/[[path]].ts", "/api") && answers("api/[[path]].ts", "/api/auth/check"));
    assert.ok(!answers("api/[[path]].ts", "/assets/a.js") && !answers("mobile/data.ts", "/mobile/init"));
    assert.ok(answers("items/[id].ts", "/items/ana") && !answers("items/[id].ts", "/items/ana/edit"));
  });
});
