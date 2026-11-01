// A game's two palettes in games.json: the top-level colors are the dark
// palette, all that older app builds read, and `light` holds the light
// screens' colors, any part of them. The app (zms: screenPalette) fills in
// what `light` leaves out as below, so the admin shows and checks what
// players will see.

import type { Game } from "~/schemas/game";
import { contrastRatio } from "./contrast";

export type PaletteKey = keyof NonNullable<Game["light"]>;
export type Palette = Record<PaletteKey, string>;

export const PALETTE_LABELS: Palette = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  background: "Background",
  surface: "Surface",
  surfaceVariant: "Surface Variant",
  onPrimary: "On Primary",
  onSecondary: "On Secondary",
  onBackground: "On Background",
  onSurface: "On Surface",
  error: "Error",
  warning: "Warning",
  success: "Success",
  border: "Border",
};
export const PALETTE_KEYS = Object.keys(PALETTE_LABELS) as PaletteKey[];

/** The light base the app draws light screens from (zms: defaultLightColors). */
export const LIGHT_BASE: Palette = {
  primary: "#6366F1",
  secondary: "#8B5CF6",
  accent: "#EC4899",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceVariant: "#F1F5F9",
  onPrimary: "#FFFFFF",
  onSecondary: "#FFFFFF",
  onBackground: "#0F172A",
  onSurface: "#1E293B",
  error: "#EF4444",
  warning: "#F59E0B",
  success: "#10B981",
  border: "#E2E8F0",
};
/** Light colors the app takes from the top-level palette when `light` leaves them out. */
export const BRAND_KEYS: PaletteKey[] = ["primary", "secondary", "onPrimary"];

/**
 * Text and what it's drawn on, checked against WCAG AA. Text in the primary
 * color the app makes readable by itself (zms: primaryText).
 */
export const CONTRAST_PAIRS: [PaletteKey, PaletteKey][] = [
  ["onPrimary", "primary"],
  ["onSecondary", "secondary"],
  ["onBackground", "background"],
  ["onSurface", "surface"],
  ["onSurface", "surfaceVariant"],
];
export const MIN_CONTRAST = 4.5;

export const isHex = (value: unknown): value is string =>
  typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());

/** A color as games.json holds it, which people also edit by hand: text as is, anything else empty. */
export const colorField = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * A game's `light` as the editor holds it: the text of each known color,
 * invalid text included so it shows red and blocks saving. Anything that
 * isn't an object gives no light colors.
 */
export function lightFromGame(raw: unknown): Partial<Palette> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    PALETTE_KEYS.flatMap((key) => {
      const value = (raw as Record<string, unknown>)[key];
      return typeof value === "string" ? [[key, value]] : [];
    }),
  );
}

/**
 * The colors a tab is drawn with: the dark palette as entered, or, given
 * `light`, the light one with each color it leaves out filled in as the app
 * does (brand colors from the top level, the rest from the light base).
 * An empty or invalid color counts as left out.
 */
export function effectivePalette(dark: Partial<Palette>, light?: Partial<Palette>): Palette {
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => {
      if (!light) return [key, isHex(dark[key]) ? dark[key].trim() : LIGHT_BASE[key]];
      if (isHex(light[key])) return [key, light[key].trim()];
      return [key, BRAND_KEYS.includes(key) && isHex(dark[key]) ? dark[key].trim() : LIGHT_BASE[key]];
    }),
  ) as Palette;
}

/** The light colors that are set, trimmed; undefined when none is, so games.json gets no `light`. */
export function lightToSave(light: Partial<Palette>): Game["light"] {
  const set = PALETTE_KEYS.flatMap((key) => (light[key]?.trim() ? [[key, light[key]!.trim()] as const] : []));
  return set.length > 0 ? Object.fromEntries(set) : undefined;
}

/** Pairs of a palette whose text falls below MIN_CONTRAST. */
export function contrastWarnings(palette: Palette): { text: PaletteKey; under: PaletteKey; ratio: number }[] {
  return CONTRAST_PAIRS.flatMap(([text, under]) => {
    const ratio = contrastRatio(palette[text], palette[under]);
    return ratio !== undefined && ratio < MIN_CONTRAST ? [{ text, under, ratio }] : [];
  });
}
