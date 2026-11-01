import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LIGHT_BASE,
  colorField,
  contrastWarnings,
  effectivePalette,
  isHex,
  lightFromGame,
  lightToSave,
  type Palette,
} from "../app/lib/game-palette";
import { GameSchema } from "../app/schemas/game";

// zms checks its screenPalette against the same file, so the editor shows the colors the app draws.
const fixture: { dark: Palette; cases: { name: string; light: Partial<Palette>; expected: Palette }[] } = JSON.parse(
  readFileSync(new URL("./fixtures/palette-cases.json", import.meta.url), "utf8"),
);

describe("the light palette the editor shows", () => {
  it("is the app's, case by case", () => {
    for (const { name, light, expected } of fixture.cases) {
      assert.deepEqual(effectivePalette(fixture.dark, light), expected, name);
    }
  });

  it("without light colors, is the light base with the game's brand colors, as today", () => {
    const { primary, secondary, onPrimary } = fixture.dark;
    assert.deepEqual(effectivePalette(fixture.dark, {}), { ...LIGHT_BASE, primary, secondary, onPrimary });
  });

  it("fills each left-out or invalid color on its own", () => {
    const palette = effectivePalette(fixture.dark, { background: "#FFF7ED", primary: "red", border: " #fed " });
    assert.equal(palette.background, "#FFF7ED");
    assert.equal(palette.primary, fixture.dark.primary);
    assert.equal(palette.border, "#fed");
    assert.equal(palette.surface, LIGHT_BASE.surface);
  });

  it("shows the dark tab as entered, empty colors as the editor's defaults", () => {
    assert.deepEqual(effectivePalette(fixture.dark), fixture.dark);
    assert.equal(effectivePalette({ ...fixture.dark, surface: "" }).surface, LIGHT_BASE.surface);
  });
});

describe("saving a light palette", () => {
  it("keeps the colors that are set, trimmed, and nothing at all when none is", () => {
    assert.deepEqual(lightToSave({ background: " #FFF7ED ", primary: "", border: "  " }), { background: "#FFF7ED" });
    assert.equal(lightToSave({}), undefined);
    assert.equal(lightToSave({ primary: " " }), undefined);
  });

  it("is checked with the game: any part of a palette, hex colors only", () => {
    const game = { slug: "overwatch", name: "Overwatch 2", active: true };
    assert.equal(GameSchema.safeParse(game).success, true);
    assert.equal(GameSchema.safeParse({ ...game, light: { background: "#FFF7ED" } }).success, true);
    assert.equal(GameSchema.safeParse({ ...game, light: { background: "orange" } }).success, false);
  });
});

describe("a hand-edited games.json", () => {
  it("gives the editor text colors only, whatever the file holds", () => {
    assert.equal(colorField("#00B4FF"), "#00B4FF");
    for (const value of [5, null, undefined, {}, ["#fff"]]) assert.equal(colorField(value), "", String(value));
    for (const light of ["pink", null, [], 42, undefined]) assert.deepEqual(lightFromGame(light), {}, String(light));
    assert.deepEqual(lightFromGame({ primary: 5, background: "#FFF7ED", warning: "orange", glow: "#fff" }), {
      background: "#FFF7ED",
      warning: "orange",
    });
    assert.equal(isHex(5), false);
  });

  it("keeps invalid text so it blocks the save, and saves the rest clean", () => {
    const light = lightFromGame({ primary: 5, background: "#FFF7ED", warning: "orange", glow: "#fff" });
    const game = { slug: "overwatch", name: "Overwatch 2", active: true, secondary: colorField(5) };
    assert.equal(GameSchema.safeParse({ ...game, light: lightToSave(light) }).success, false);
    const fixed = lightToSave({ ...light, warning: "#B45309" });
    assert.deepEqual(fixed, { background: "#FFF7ED", warning: "#B45309" });
    assert.equal(GameSchema.safeParse({ ...game, light: fixed }).success, true);
  });

  it("draws and checks what the readers give without throwing", () => {
    const dark = { ...fixture.dark, secondary: colorField(5) };
    const palette = effectivePalette(dark, lightFromGame({ primary: 5, secondary: "#0F766E" }));
    assert.equal(palette.primary, fixture.dark.primary);
    assert.equal(palette.secondary, "#0F766E");
    assert.equal(effectivePalette(dark).secondary, LIGHT_BASE.secondary);
    assert.ok(Array.isArray(contrastWarnings(palette)));
  });
});

describe("contrast warnings", () => {
  it("flag text below 4.5:1 on what it's drawn on, and only that", () => {
    // White on Overwatch orange: the light base's onSecondary on the brand secondary.
    assert.deepEqual(contrastWarnings(effectivePalette(fixture.dark, {})).map((w) => `${w.text}/${w.under}`), ["onSecondary/secondary"]);

    const palette = effectivePalette(fixture.dark, { primary: "#00B4FF", onPrimary: "#FFFFFF", onSecondary: "#1A0E00" });
    const warnings = contrastWarnings(palette);
    assert.deepEqual(warnings.map((w) => `${w.text}/${w.under}`), ["onPrimary/primary"]);
    assert.ok(warnings[0].ratio > 2 && warnings[0].ratio < 2.5);
    assert.deepEqual(contrastWarnings(effectivePalette(fixture.dark, { primary: "#C2410C", onPrimary: "#FFFFFF", onSecondary: "#1A0E00" })), []);
  });
});
