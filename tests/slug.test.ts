import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as importerMap from "../app/lib/importer/map";

// The New editors (maps, heroes, modes, enums, schemas, import jobs) make ids
// from names with the importer's slugify, so a record created by hand gets the
// id an import of the same name would: other records reference it by that id.
describe("ids made from names", () => {
  it("drop accents instead of breaking the word", async () => {
    const { slugify } = await import("../app/lib/slug");
    assert.equal(slugify("Esperança"), "esperanca");
    assert.equal(slugify("Place Lacroix"), "place-lacroix");
    assert.equal(slugify("  King's Row  "), "king-s-row");
    assert.equal(slugify("Ilios — Lighthouse"), "ilios-lighthouse");
    assert.equal(slugify(""), "");
  });

  it("are the importer's", async () => {
    const { slugify } = await import("../app/lib/slug");
    assert.equal(importerMap.slugify, slugify);
  });
});
