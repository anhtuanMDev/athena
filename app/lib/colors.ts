// Colors as the app draws them: the dark base it fills a game's invalid
// top-level colors from, and the one way a color is written (contract.ts
// HEX_COLOR) for a screen's accent and a block's colors. The values here are
// the app's own design tokens (zms src/theme/tokens.ts defaultDarkColors).

import { HEX_COLOR } from "./contract";

/** How a color is written, for messages. */
export const HEX_EXAMPLE = "a hex color such as #FF8200 or #F80";

/** The dark base the app draws a top-level color from when the game's isn't a hex color (zms: defaultDarkColors). */
export const DARK_BASE = {
  primary: "#818CF8",
  secondary: "#A78BFA",
  accent: "#F472B6",
  background: "#0F172A",
  surface: "#1E293B",
  surfaceVariant: "#334155",
  onPrimary: "#0F172A",
  onSecondary: "#0F172A",
  onBackground: "#F1F5F9",
  onSurface: "#E2E8F0",
  error: "#F87171",
  warning: "#FBBF24",
  success: "#34D399",
  border: "#334155",
};

/** Block props that hold a color: color, textColor… */
export const COLOR_PROP = /^(color|[a-zA-Z]+Color)$/;

/** Whether a literal color value is one the app draws. */
export const isAppColor = (value: unknown): boolean => typeof value === "string" && HEX_COLOR.test(value);

/** What's wrong with a block's color prop `name` set to `value`, if anything; an empty one isn't set. */
export function colorProblem(name: string, value: unknown): string | undefined {
  if (!COLOR_PROP.test(name) || typeof value !== "string" || value === "" || isAppColor(value)) {
    return undefined;
  }
  return `${name} "${value}" isn't ${HEX_EXAMPLE}; the app shows the theme's instead.`;
}
