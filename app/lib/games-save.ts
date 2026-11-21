import { z } from "zod";

import { GameSchema } from "~/schemas/game";

import { HEX_EXAMPLE, LIGHT_HEX_EXAMPLE } from "./colors";
import { PALETTE_KEYS, PALETTE_LABELS, lightToSave } from "./game-palette";
import { withSavedGame } from "./games";
import { conflictResponse, getFile, isConflictError, saveGames, uploadGameIcon } from "./github";
import { keepUnknownKeys } from "./unknown-keys";

import type { PaletteKey } from "./game-palette";
import type { Game } from "~/schemas/game";

// The games page's save. Everything that can refuse it is checked before
// anything is sent; then a picked icon goes up as a blob, which commits
// nothing, and games.json is saved with it in one commit (POST
// /api/data/save-games, app/lib/api/games.ts). The icon was a commit of its
// own, so a refused games.json left it committed.

const GAMES_FILE = "data/_meta/games.json";

/** The games form's values. */
export interface GameDraft {
  slug: string;
  name: string;
  developer: string;
  /** The icon field: a URL typed, or a picked file's preview. */
  icon: string;
  /** The 14 top-level colors: the dark palette, all that older app builds read. */
  palette: Record<PaletteKey, string>;
  /** The light screens' colors, any part of them. */
  light: Partial<Record<PaletteKey, string>>;
  active: boolean;
}

/** A save of the games form. */
export interface GameSave {
  draft: GameDraft;
  /** The slug of the game being edited; null for a new game. */
  editing: string | null;
  /** A picked icon: the file's name and its bytes as base64. */
  iconFile?: { name: string; base64: string };
}

/** The form's errors by field ("_form": the whole form's), and the palette tab that shows the wrong color. */
export type GameSaveOutcome = { saved: true } | { errors: Record<string, string[]>; tab?: "dark" | "light" };

/** Where a picked icon goes, under public/assets/: named after the game, with the file's extension (png without one). */
function iconAsset(slug: string, fileName: string): string {
  const extension = fileName.split(".").pop();
  return `games/${slug === "" ? "game" : slug}-icon.${extension === undefined || extension === "" ? "png" : extension}`;
}

/** The game the form saves: its colors trimmed (each dark one is required: the app leaves out a game without them). */
function gameOf(draft: GameDraft, icon: string): unknown {
  const palette = Object.fromEntries(PALETTE_KEYS.map((key) => [key, draft.palette[key].trim()]));
  return { slug: draft.slug, name: draft.name, developer: draft.developer, icon, ...palette, light: lightToSave(draft.light), active: draft.active };
}

/** The form's errors for a game the checks refuse: a wrong color is said up top, and its tab shown. */
function refused(fieldErrors: Record<string, string[] | undefined>): GameSaveOutcome {
  const errors = Object.fromEntries(Object.entries(fieldErrors).filter((entry): entry is [string, string[]] => entry[1] !== undefined));
  if (fieldErrors.light) {
    return { errors: { ...errors, _form: [`A light color isn't ${LIGHT_HEX_EXAMPLE}.`] }, tab: "light" };
  }
  const darkErrors = PALETTE_KEYS.filter((key) => fieldErrors[key]);
  if (darkErrors.length > 0) {
    const labels = darkErrors.map((key) => PALETTE_LABELS[key]).join(", ");
    return { errors: { ...errors, _form: [`Every dark color is needed, as ${HEX_EXAMPLE}: the app draws the game with all 14. Check ${labels}.`] }, tab: "dark" };
  }
  return { errors };
}

/** games.json with the saved game, its icon uploaded, in one save; or why it can't be saved. */
async function commitGame({ editing, iconFile, draft }: GameSave, game: Game): Promise<GameSaveOutcome> {
  const file = await getFile<{ games: Game[] }>(GAMES_FILE);
  if (!file) {
    return { errors: { _form: ["Could not read games.json"] } };
  }
  // An edited game keeps its slug: it names the game's data folder.
  const saved = withSavedGame(file.content.games, game, editing, (old, next) => keepUnknownKeys(old, next, GameSchema) as Game);
  if ("error" in saved) {
    return { errors: editing === null ? { slug: [saved.error] } : { _form: [saved.error] } };
  }
  // Uploaded at the address the saved game already names (`icon` in saveGame).
  const icon = iconFile ? await uploadGameIcon(draft.slug, `public/assets/${iconAsset(draft.slug, iconFile.name)}`, iconFile.base64) : undefined;
  const message = `${editing === null ? "Add" : "Edit"} game: ${game.name}`;
  await saveGames({ sha: file.sha, content: { ...file.content, games: saved.games }, message, ...(icon && { icon }) });
  return { saved: true };
}

/** Saves the games form: checked first, then games.json and a picked icon in one commit. */
export async function saveGame(save: GameSave): Promise<GameSaveOutcome> {
  const { draft, iconFile } = save;
  const icon = iconFile ? `/api/assets/${iconAsset(draft.slug, iconFile.name)}` : draft.icon;
  const parsed = GameSchema.safeParse(gameOf(draft, icon));
  if (!parsed.success) {
    return refused(z.flattenError(parsed.error).fieldErrors);
  }
  try {
    return await commitGame(save, parsed.data);
  } catch (err) {
    if (isConflictError(err)) {
      return { errors: { _form: conflictResponse().errors._form } };
    }
    return { errors: { _form: [err instanceof Error ? err.message : String(err)] } };
  }
}

/** A picked file's bytes as base64. */
export async function readFileBase64(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      resolve(url.split(",")[1] ?? "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The icon couldn't be read."));
    };
    reader.readAsDataURL(file);
  });
}
