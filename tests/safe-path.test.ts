import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GAME_SLUG, RECORD_ID } from "../app/lib/contract";
import { SAFE_ENTITY_ID, SAFE_SLUG, assertSafeEntityId, assertSafeEntityType, assertSafeGameSlug } from "../app/lib/safe-path";

// The browser's checks on the parts of a data path (app/lib/safe-path.ts). A
// refused part throws a 400 Response, which the route shows as an error.

/** Whether `check(value)` throws a 400 Response naming `value`. */
function refuses(check: (value: string) => void, value: string): boolean {
  try {
    check(value);
    return false;
  } catch (error) {
    assert.ok(error instanceof Response, `${value}: threw something other than a Response`);
    assert.equal(error.status, 400);
    return true;
  }
}

void describe("the browser's path checks", () => {
  void it("use the contract's game slug and record id", () => {
    assert.equal(SAFE_SLUG, GAME_SLUG);
    assert.equal(SAFE_ENTITY_ID, RECORD_ID);
  });

  void it("take a game slug, and refuse anything that could leave its folder", () => {
    for (const slug of ["overwatch", "marvel-rivals", "x"]) {
      assert.equal(refuses(assertSafeGameSlug, slug), false, slug);
    }
    for (const slug of ["", "Overwatch", "../data", "a/b", "-ow", "ow-"]) {
      assert.equal(refuses(assertSafeGameSlug, slug), true, slug);
    }
  });

  void it("take a record id with dots, but never two in a row", () => {
    for (const id of ["ana", "patch-2026.10.20", "d.va"]) {
      assert.equal(refuses(assertSafeEntityId, id), false, id);
    }
    for (const id of ["", "..", "a..b", "../ana", "ana/", "Ana", ".ana"]) {
      assert.equal(refuses(assertSafeEntityId, id), true, id);
    }
  });

  void it("take a category folder, but no internal folder", () => {
    for (const folder of ["heroes", "patches", "news"]) {
      assert.equal(refuses(assertSafeEntityType, folder), false, folder);
    }
    for (const folder of ["schemas", "screens", "enums", "imports", "syncs", "../heroes", ""]) {
      assert.equal(refuses(assertSafeEntityType, folder), true, folder);
    }
  });
});
