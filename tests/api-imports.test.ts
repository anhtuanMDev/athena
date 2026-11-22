import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

// app/lib/api/ is the admin API's server code (functions/api/[[path]].ts):
// it reads the Function's env, its secrets among them. Code the browser runs
// must never import it, or Vite bundles it into the admin's pages. Only the
// API's own modules, the Function and the tests may.

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = join(ROOT, "app");
const API = join(APP, "lib", "api");

/** Every TypeScript file under `dir`, as an absolute path. */
function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourcesIn(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Whether `path` is app/lib/api or a file or folder in it. */
const isInApi = (path: string) => path === API || path.startsWith(API + sep);

/** The modules a file imports (import, export … from, import(), import type), the way the app writes them. */
function importsOf(file: string): string[] {
  return ts.preProcessFile(readFileSync(file, "utf8"), true, true).importedFiles.map((imported) => imported.fileName);
}

/** Where an import leads: "~/" is app/ (tsconfig paths), "./" and "../" are relative to the file; a package leads nowhere here. */
function target(file: string, specifier: string): string | null {
  if (specifier.startsWith("~/")) {
    return join(APP, specifier.slice(2));
  }
  return specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
}

/** "file imports specifier" for each import of the API in `files`. */
function apiImports(files: string[]): string[] {
  return files.flatMap((file) =>
    importsOf(file)
      .filter((specifier) => {
        const path = target(file, specifier);
        return path !== null && isInApi(path);
      })
      .map((specifier) => `${relative(ROOT, file)} imports ${specifier}`),
  );
}

void describe("the admin API's server code", () => {
  void it("is imported by no code the browser runs: nothing under app/ outside app/lib/api/", () => {
    const browser = sourcesIn(APP).filter((file) => !isInApi(file));
    assert.ok(browser.length > 100, `only ${String(browser.length)} files found under app/`);
    assert.deepEqual(apiImports(browser), []);
  });

  void it("is found however it's imported: by the alias, a relative path, or the folder itself", () => {
    const file = join(APP, "components", "views", "MapsList.tsx");
    const specifiers = ["~/lib/api/http", "../../lib/api/routes", "~/lib/api", "../../lib/api"];
    assert.deepEqual(
      specifiers.filter((specifier) => isInApi(target(file, specifier) ?? "")),
      specifiers,
    );
    const others = ["~/lib/api-docs", "~/lib/apis/http", "../../lib/github", "@octokit/rest"];
    assert.deepEqual(
      others.filter((specifier) => isInApi(target(file, specifier) ?? "")),
      [],
    );
  });

  void it("is still imported where it may be: by the Function", () => {
    assert.ok(apiImports([join(ROOT, "functions", "api", "[[path]].ts")]).length > 0);
  });
});
