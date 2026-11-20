import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

// Each page names the cache key of what it loads: useData(load, deps, key)
// (app/lib/use-data.ts). Every call with one key and the same dependencies
// shares one answer for 5 minutes, so two calls that load different things
// under one key hand each other the wrong answer: the hero editor's schemas
// once broke the new-hero page that way. A key written out (a string or a
// template) must be one call's.

const APP = new URL("../app/", import.meta.url).pathname;

/** The app's source files that call useData. */
function sourcesWithUseData(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourcesWithUseData(path);
    }
    return /\.tsx?$/u.test(entry.name) && readFileSync(path, "utf8").includes("useData") ? [path] : [];
  });
}

/** Each key written right after a call's dependency list: `[game], "key")`. */
const KEY_AFTER_DEPS = /\],\s*("[^"\n]+"|`[^`\n]+`)\s*,?\s*\)/gu;

void describe("the pages' cache keys", () => {
  void it("are each used by one call only", () => {
    const callsByKey = new Map<string, string[]>();
    for (const path of sourcesWithUseData(APP)) {
      for (const [, key] of readFileSync(path, "utf8").matchAll(KEY_AFTER_DEPS)) {
        callsByKey.set(key, [...(callsByKey.get(key) ?? []), relative(APP, path)]);
      }
    }
    assert.ok(callsByKey.size > 20, "the keys weren't found: has the useData call's shape changed?");
    const shared = [...callsByKey].filter(([, calls]) => calls.length > 1);
    assert.deepEqual(shared, []);
  });
});
