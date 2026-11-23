import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_CATEGORIES } from "../app/lib/categories";
import { referenceLookup, type ReferenceSources } from "../app/lib/reference-lookup";

import type { ReferenceField } from "../app/lib/reference-labels";

// How the screen editor's preview names a reference (ScreenEdit's `reference`):
// its record's label from the folders the app loads for the screen, and whether
// the app opens that record.

const heroRef: ReferenceField = { key: "hero", type: "reference", referenceApiEndpoint: "/api/{game}/heroes" };
const mapRef: ReferenceField = { key: "maps", type: "reference_list", referenceApiEndpoint: "/api/{game}/maps" };
const heroes = [
  { id: "ana", name: "Ana" },
  { id: "rein", name: "Reinhardt" },
  { slug: "mercy", name: "Mercy" },
];
const heroDetail = { type: "detail", source: { category: "hero" } };
const sources = (overrides: Partial<ReferenceSources> = {}): ReferenceSources => ({
  categories: DEFAULT_CATEGORIES,
  shownFolders: ["heroes", "maps"],
  records: { hero: heroes, map: [{ id: "ilios", name: "Ilios" }] },
  screens: [heroDetail, { type: "list", source: { category: "hero" } }, null],
  ...overrides,
});

void describe("a reference in the screen preview", () => {
  void it("shows its record's label, linked when one detail screen shows its category", () => {
    const lookup = referenceLookup(sources());
    assert.deepEqual(lookup(heroRef, "ana"), { label: "Ana", linked: true });
    assert.deepEqual(lookup(mapRef, "ilios"), { label: "Ilios", linked: false });
  });

  void it("isn't linked when the category has no detail screen or two, or the record no id", () => {
    assert.deepEqual(referenceLookup(sources({ screens: [] }))(heroRef, "rein"), { label: "Reinhardt", linked: false });
    assert.deepEqual(referenceLookup(sources({ screens: [heroDetail, { ...heroDetail }] }))(heroRef, "rein"), { label: "Reinhardt", linked: false });
    const bySlug: ReferenceField = { ...heroRef, referenceValueKey: "slug" };
    assert.deepEqual(referenceLookup(sources())(bySlug, "mercy"), { label: "Mercy", linked: false });
  });

  void it("is unnamed outside the folders the app loads, configured categories and known ids", () => {
    assert.equal(referenceLookup(sources({ shownFolders: ["maps"] }))(heroRef, "ana"), undefined);
    assert.equal(referenceLookup(sources({ categories: DEFAULT_CATEGORIES.filter((entry) => entry.folder !== "heroes") }))(heroRef, "ana"), undefined);
    assert.equal(referenceLookup(sources())({ ...heroRef, referenceApiEndpoint: "/api/{game}/enums/role" }, "ana"), undefined);
    assert.equal(referenceLookup(sources())({ ...heroRef, type: "string" }, "ana"), undefined);
    assert.equal(referenceLookup(sources())(heroRef, "nobody"), undefined);
    assert.equal(referenceLookup(sources({ records: {} }))(heroRef, "ana"), undefined);
  });

  void it("reads a field's records once, on its first lookup", () => {
    const reads: string[] = [];
    const records = new Proxy(sources().records, {
      get: (target, category: string) => {
        reads.push(category);
        return target[category];
      },
    });
    const lookup = referenceLookup(sources({ records }));
    assert.deepEqual(reads, []);
    assert.equal(lookup(heroRef, "ana")?.label, "Ana");
    assert.equal(lookup(heroRef, "rein")?.label, "Reinhardt");
    assert.equal(lookup(mapRef, "ilios")?.label, "Ilios");
    assert.deepEqual(reads, ["hero", "map"]);
  });
});
