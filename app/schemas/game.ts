import { z } from "zod";

import { pictureAdvice, refusedPicture } from "~/lib/app-pictures";
import { HEX_EXAMPLE } from "~/lib/colors";
import { GAME_SLUG, HEX_COLOR } from "~/lib/contract";

const HEX_MESSAGE = `Must be ${HEX_EXAMPLE}`;
/** A color the light palette may leave out: the app fills it in. */
const hexColor = z.string().regex(HEX_COLOR, HEX_MESSAGE).optional().or(z.literal(""));
/** A top-level (dark) color: the app draws the game with all 14, so each must be set. */
const darkColor = z.string().regex(HEX_COLOR, HEX_MESSAGE);

/**
 * The colors of a game's light screens (games.json `light`), any part of
 * them: the app fills in the rest (zms: screenPalette). The top-level colors
 * stay the dark palette, which is all that older app builds read.
 */
export const LightPaletteSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  background: hexColor,
  surface: hexColor,
  surfaceVariant: hexColor,
  onPrimary: hexColor,
  onSecondary: hexColor,
  onBackground: hexColor,
  onSurface: hexColor,
  error: hexColor,
  warning: hexColor,
  success: hexColor,
  border: hexColor,
});

/**
 * A game as games.json holds it. The app (zms gameSchema) leaves out a game
 * without a developer (text, which may be empty) or any of the 14 top-level
 * colors, so the form requires them; the write API and the data validator
 * check the same (data-file-rules.ts gamesFileProblems), and an icon the app
 * won't load.
 */
export const GameSchema = z.object({
  slug: z.string().regex(GAME_SLUG, "1 to 40 lowercase letters, digits and dashes, starting and ending with a letter or digit"),
  name: z.string().min(1, "Name is required"),
  developer: z.string(),
  active: z.boolean(),
  // An uploaded picture, or one on the app's picture hosts (app-pictures.ts).
  icon: z
    .string()
    .refine((icon) => refusedPicture(icon) === undefined, `The app won't load this icon: ${pictureAdvice()}.`)
    .optional()
    .or(z.literal("")),
  // Color scheme
  primary: darkColor,
  secondary: darkColor,
  accent: darkColor,
  background: darkColor,
  surface: darkColor,
  surfaceVariant: darkColor,
  onPrimary: darkColor,
  onSecondary: darkColor,
  onBackground: darkColor,
  onSurface: darkColor,
  error: darkColor,
  warning: darkColor,
  success: darkColor,
  border: darkColor,
  light: LightPaletteSchema.optional(),
});

export type Game = z.infer<typeof GameSchema>;

export const GamesFileSchema = z.object({
  games: z.array(GameSchema),
});
