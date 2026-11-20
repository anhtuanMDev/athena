import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { screensUsingSchema } from "../app/lib/schema-usage";

// Deleting a schema while app screens still list records through it (R5 F15).
// A source names a category, and may name one of its schemas: the screen then
// shows nothing, and once a category has no schema left the screen editor
// refuses every screen that lists it ("… which no schema has").

const NEWS_SCREEN = {
  id: "news",
  type: "list",
  source: { category: "news", sort: "date", order: "desc" },
  blocks: [{ id: "header", type: "screen_header", props: { title: "News" } }],
};
const HOME_SCREEN = {
  id: "home",
  type: "home",
  blocks: [
    { id: "latest", type: "featured_carousel", props: { source: { category: "news", schema: "news-article", limit: 3 }, action: { screen: "news-detail" } } },
    { id: "roster", type: "record_grid", props: { source: { category: "hero" } } },
  ],
};
const SCREENS = [NEWS_SCREEN, HOME_SCREEN];

void describe("the screens a schema's deletion would break", () => {
  void it("are those whose sources name the schema, while its category keeps others", () => {
    assert.deepEqual(screensUsingSchema(SCREENS, { id: "news-article", category: "news", others: 1 }), [{ screen: "home", where: 'block "latest"' }]);
    assert.deepEqual(screensUsingSchema(SCREENS, { id: "news-brief", category: "news", others: 1 }), []);
  });

  void it("are every one listing the category when the schema is its last", () => {
    assert.deepEqual(screensUsingSchema(SCREENS, { id: "news-article", category: "news", others: 0 }), [
      { screen: "news", where: "its source" },
      { screen: "home", where: 'block "latest"' },
    ]);
    assert.deepEqual(screensUsingSchema(SCREENS, { id: "hero-base", category: "hero", others: 0 }), [{ screen: "home", where: 'block "roster"' }]);
  });

  void it("are none for a category no screen lists, or a schema of another category", () => {
    assert.deepEqual(screensUsingSchema(SCREENS, { id: "patch-base", category: "patch", others: 0 }), []);
    assert.deepEqual(screensUsingSchema(SCREENS, { id: "news-article", category: "item", others: 0 }), []);
  });

  void it("read what a listing may hold without failing: no blocks, odd blocks, no id", () => {
    const odd = [null, "screen", { type: "page" }, { id: "broken", blocks: [null, { id: "x" }, { id: "y", props: "none" }] }, { source: { category: "news" } }];
    assert.deepEqual(screensUsingSchema(odd, { id: "news-article", category: "news", others: 0 }), [{ screen: "(unnamed)", where: "its source" }]);
  });
});
