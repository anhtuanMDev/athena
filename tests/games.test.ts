import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGameActive, sidebarGames, withSavedGame } from "../app/lib/games";
import { gameRemovalProblems, gameSlugs } from "../app/lib/games-guard";

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

// A game's slug names its folders (data/{slug}/, its pictures): renaming one, or
// dropping it from games.json, leaves its data behind where nothing finds it.

describe("a game's slug", () => {
  const games = [
    { slug: "overwatch", name: "Overwatch 2" },
    { slug: "marvel-rivals", name: "Marvel Rivals", active: false },
  ];
  const withData = new Set(["overwatch"]);

  it("is read from games.json as the cron worker and the app read it", () => {
    assert.deepEqual(gameSlugs({ games: [{ slug: "overwatch" }, { id: "ow-legacy" }, "bare", { name: "no slug" }, { slug: 3 }, null] }), ["overwatch", "ow-legacy", "bare"]);
    assert.deepEqual(gameSlugs([{ slug: "listed" }]), ["listed"]);
    for (const file of [null, undefined, "games", { games: "x" }]) assert.deepEqual(gameSlugs(file), []);
  });

  it("can't be renamed or removed while its data folder exists", () => {
    const problems = gameRemovalProblems({ games }, { games: [{ ...games[0], slug: "overwatch-2" }, games[1]] }, withData);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^Game "overwatch" can't be renamed or removed: data\/overwatch\/ holds its data/);
    assert.equal(gameRemovalProblems({ games }, { games: [games[1]] }, withData).length, 1);
    // A file that isn't a list of games drops every game.
    assert.equal(gameRemovalProblems({ games }, { nope: true }, withData).length, 1);
    assert.equal(gameRemovalProblems({ games }, null, new Set(["overwatch", "marvel-rivals"])).length, 2);
  });

  it("can change in any other way: a game without data, a new game, other fields", () => {
    assert.deepEqual(gameRemovalProblems({ games }, { games: [games[0]] }, withData), []);
    assert.deepEqual(gameRemovalProblems({ games }, { games: [...games, { slug: "valorant" }] }, withData), []);
    assert.deepEqual(gameRemovalProblems({ games }, { games: [{ id: "overwatch", name: "Renamed" }, games[1]] }, withData), []);
    // A games.json that can't be read has nothing to keep.
    assert.deepEqual(gameRemovalProblems(null, { games: [] }, withData), []);
  });

  it("stays as it was when the games form edits a game, and must be new when it adds one", () => {
    const merge = (old: { slug: string; name: string }, saved: { slug: string; name: string }) => ({ ...old, ...saved });
    assert.deepEqual(withSavedGame(games, { slug: "overwatch-2", name: "OW" }, "overwatch", merge), {
      games: [{ slug: "overwatch", name: "OW" }, games[1]],
    });
    assert.deepEqual(withSavedGame(games, { slug: "valorant", name: "Valorant" }, null, merge), {
      games: [...games, { slug: "valorant", name: "Valorant" }],
    });
    assert.deepEqual(withSavedGame(games, { slug: "overwatch", name: "Again" }, null, merge), { error: "A game with this slug already exists" });
    assert.deepEqual(withSavedGame(games, { slug: "gone", name: "Gone" }, "gone", merge), {
      error: "This game isn't in games.json anymore. Reload the page.",
    });
  });
});
