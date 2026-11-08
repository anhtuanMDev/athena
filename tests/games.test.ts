import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGameActive, sidebarGames } from "../app/lib/games";

// games.json may leave `active` out. /mobile/init, pushes and the cron
// worker show every game but one with `active: false`; the admin agrees.

describe("a game's active flag", () => {
  it("is off only when games.json says false", () => {
    assert.equal(isGameActive({ active: false }), false);
    for (const active of [true, undefined, null, "false", 0]) assert.equal(isGameActive({ active }), true, String(active));
    assert.equal(isGameActive({}), true);
  });

  it("lists in the sidebar every game the app shows", () => {
    const games = [
      { slug: "overwatch", name: "Overwatch 2", icon: "/api/assets/games/ow.webp", active: true },
      { slug: "unlisted", name: "No flag" },
      { slug: "marvel-rivals", name: "Marvel Rivals", active: false },
    ];
    assert.deepEqual(sidebarGames(games), [
      { slug: "overwatch", name: "Overwatch 2", icon: "/api/assets/games/ow.webp" },
      { slug: "unlisted", name: "No flag", icon: undefined },
    ]);
  });
});
