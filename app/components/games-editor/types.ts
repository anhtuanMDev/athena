import type { PaletteKey } from "~/lib/game-palette";

/** Which palette the form shows: the dark one (all older app builds read) or the light screens'. */
export type PaletteTab = "dark" | "light";

/** Whether the drawer adds a game or edits one. */
export type GameFormMode = "create" | "edit";

/** One color row of the palette tab shown: its color, how to set it, and what the app draws when it's empty. */
export interface PaletteRowData {
  key: PaletteKey;
  value: string;
  set: (value: string) => void;
  fallback: string;
}

/** The form's errors by field; "_form" is the whole form's. */
export type FormErrors = Record<string, string[]>;
