import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadScreenData } from "../app/lib/screen-loader";

import type { ScreenSources } from "../app/lib/screen-loader";

// The screen editor's loader (REQ-05): every source is read on its own, so one that
// fails leaves its part empty and is named, and only the screen's own file is required.

const PATH = "data/overwatch/screens/hero-detail.json";
const categories = [
  { category: "hero", folder: "heroes", label: "Heroes" },
  { category: "map", folder: "maps", label: "Maps" },
];
const schemas = [
  { id: "hero-hero", name: "Hero", category: "hero", fields: [] },
  { id: "map-base", name: "Map", category: "map", fields: [] },
];
const files: Record<string, unknown> = {
  [PATH]: { type: "detail", source: { category: "hero" }, blocks: [] },
  "data/_meta/mobile_primitives.json": { text: { name: "Text", props: {} } },
};
const folders: Record<string, unknown[]> = {
  schemas,
  enums: [{ id: "role", options: ["Tank"] }],
  screens: ["hero-detail", "heroes"],
  heroes: [{ id: "tracer", name: "Tracer" }],
};

/** The admin API as stubs, each failing when its name is in `failing`. */
function sources(failing: string[] = []): ScreenSources {
  const fail = (name: string) => Promise.reject(new Error(`${name} is down`));
  return {
    readFile: (path) => (failing.includes(path) ? fail(path) : Promise.resolve(path in files ? { content: files[path], sha: "sha" } : null)),
    listFolder: <T>(folder: string, withContent: boolean) => {
      const name = withContent ? folder : `${folder} names`;
      if (failing.includes(name)) {
        return fail(name);
      }
      const listed = folder === "screens" && withContent ? [{ id: "heroes", type: "list" }] : (folders[folder] ?? []);
      return Promise.resolve(listed as T[]);
    },
    listSummaries: (folder) => (failing.includes(`${folder} summaries`) ? fail(folder) : Promise.resolve([{ id: `${folder}-1` }])),
    listGames: () => (failing.includes("games") ? fail("games") : Promise.resolve([{ slug: "overwatch", name: "Overwatch" }])),
  };
}

const request = { game: "overwatch", id: "hero-detail", path: PATH, categories };

void describe("the screen editor's loader", () => {
  void it("reads everything when every source answers", async () => {
    const data = await loadScreenData(sources(), request);
    assert.deepEqual(data.failed, []);
    assert.equal(data.schemas.length, 2);
    assert.deepEqual(data.screenIds, ["hero-detail", "heroes"]);
    assert.deepEqual(data.records, { hero: [{ id: "tracer", name: "Tracer" }], map: [{ id: "maps-1" }] });
    assert.equal(data.wholeCategory, "hero");
    assert.equal(data.game?.name, "Overwatch");
    assert.ok(data.manifest?.text);
  });

  void it("leaves out one source that fails, names it, and keeps the rest", async () => {
    const cases: [string, string, (data: Awaited<ReturnType<typeof loadScreenData>>) => unknown][] = [
      ["enums", "enums", (data) => data.enums],
      ["screens names", "screen list", (data) => data.screenIds],
      ["screens", "screens", (data) => data.screens],
      ["games", "games", (data) => data.game],
    ];
    const loads = await Promise.all(cases.map(([source]) => loadScreenData(sources([source]), request)));
    cases.forEach(([source, name, part], i) => {
      assert.deepEqual(loads[i].failed, [name], source);
      assert.ok([undefined, 0].includes((part(loads[i]) as unknown[] | undefined)?.length), source);
      assert.equal(loads[i].schemas.length, 2, source);
    });
  });

  void it("without schemas, has no categories to list records of", async () => {
    const data = await loadScreenData(sources(["schemas"]), request);
    assert.deepEqual(data.failed, ["schemas"]);
    assert.deepEqual(data.records, {});
  });

  void it("names a category whose records fail, and keeps the others", async () => {
    const data = await loadScreenData(sources(["maps summaries"]), request);
    assert.deepEqual(data.failed, ["maps records"]);
    assert.deepEqual(data.records, { hero: [{ id: "tracer", name: "Tracer" }], map: [] });
  });

  void it("goes without the manifest, which the page reports on its own", async () => {
    const data = await loadScreenData(sources(["data/_meta/mobile_primitives.json"]), request);
    assert.equal(data.manifest, null);
    assert.deepEqual(data.failed, []);
  });

  void it("fails as a whole only without the screen's own file", async () => {
    await assert.rejects(loadScreenData(sources([PATH]), request), /hero-detail\.json is down/);
    await assert.rejects(loadScreenData(sources(), { ...request, id: "nope", path: "data/overwatch/screens/nope.json" }), /Screen "nope" was not found in data\/overwatch\/screens\./);
  });
});
