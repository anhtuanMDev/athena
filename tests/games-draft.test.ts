import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { draftOf, isDraftChanged, newDraft } from "../app/components/games-editor/utils/gameDraft";
import { LIGHT_BASE } from "../app/lib/game-palette";

import type { PaletteKey } from "../app/lib/game-palette";
import type { Game } from "../app/schemas/game";

// The games form's values without React (components/games-editor/utils/gameDraft.ts):
// what a new game starts with, an edited game's values, and whether anything changed.

const dark = (JSON.parse(readFileSync(new URL("./fixtures/palette-cases.json", import.meta.url), "utf8")) as { dark: Record<PaletteKey, string> }).dark;
const OVERWATCH: Game = { slug: "overwatch", name: "Overwatch", developer: "Blizzard", active: true, ...dark };

void describe("the games form", () => {
  void it("starts a new game with the colors it always offered, shown in the app", () => {
    assert.deepEqual(newDraft(), { slug: "", name: "", developer: "", icon: "", palette: LIGHT_BASE, light: {}, active: true });
  });

  void it("opens a game as games.json holds it: a missing flag shown, missing text empty", () => {
    const withoutFlag = Object.fromEntries(Object.entries(OVERWATCH).filter(([key]) => key !== "active"));
    const opened = draftOf({ ...withoutFlag, developer: "" } as Game);
    assert.deepEqual({ ...opened, palette: undefined }, { slug: "overwatch", name: "Overwatch", developer: "", icon: "", palette: undefined, light: {}, active: true });
    assert.deepEqual(opened.palette, dark);
  });

  void it("counts a change of name, developer, icon, a color, the light palette or the flag, and nothing else", () => {
    const opened = draftOf(OVERWATCH);
    assert.equal(isDraftChanged({ ...opened }, opened), false);
    assert.equal(isDraftChanged({ ...opened, light: { primary: "  " } }, opened), false);
    for (const change of [{ name: "Overwatch 2" }, { developer: "" }, { icon: "/api/assets/games/overwatch-icon.png" }, { active: false }, { light: { primary: "#000000" } }, { palette: { ...opened.palette, border: "#000000" } }]) {
      assert.equal(isDraftChanged({ ...opened, ...change }, opened), true, JSON.stringify(change));
    }
  });
});
