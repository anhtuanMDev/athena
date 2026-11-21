import { NEW_GAME_PALETTE, PALETTE_KEYS, colorField, lightFromGame, lightToSave } from "~/lib/game-palette";
import { isGameActive } from "~/lib/games";

import type { GameDraft } from "~/lib/games-save";
import type { Game } from "~/schemas/game";

// The games form's values without React: a new game's, an edited game's, and
// whether the form changed anything.

/** A new game's form: no slug or name yet, the new-game colors, shown in the app. */
export function newDraft(): GameDraft {
  return { slug: "", name: "", developer: "", icon: "", palette: { ...NEW_GAME_PALETTE }, light: {}, active: true };
}

/** An edited game's form. A game without the flag is shown in the app: unchecked, a save would hide it. */
export function draftOf(game: Game): GameDraft {
  const palette = Object.fromEntries(PALETTE_KEYS.map((key) => [key, colorField(game[key])])) as GameDraft["palette"];
  return { slug: game.slug, name: game.name, developer: game.developer || "", icon: game.icon ?? "", palette, light: lightFromGame(game.light), active: isGameActive(game) };
}

/** The light palette as games.json would hold it, for comparing. */
const savedLight = (light: GameDraft["light"]) => JSON.stringify(lightToSave(light) ?? {});

/** Whether the form changed `original`'s game (its slug can't change). */
export function isDraftChanged(draft: GameDraft, original: GameDraft): boolean {
  const hasChanged = (["name", "developer", "icon", "active"] as const).some((key) => draft[key] !== original[key]);
  return hasChanged || PALETTE_KEYS.some((key) => draft.palette[key] !== original.palette[key]) || savedLight(draft.light) !== savedLight(original.light);
}
