import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// A record's Edit page reads the record's id from the address and builds a
// data path from it: each checks it first (safe-path.ts), as Delete does.

const VIEWS = new URL("../app/components/views/", import.meta.url);

void describe("a record's Edit page", () => {
  for (const view of ["ModeEdit", "EnumEdit", "HeroEdit"]) {
    void it(`${view} checks the id in the address before loading anything`, () => {
      const source = readFileSync(new URL(`${view}.tsx`, VIEWS), "utf8");
      assert.match(source, /assertSafeEntityId\(id!?\)/);
    });
  }
});
