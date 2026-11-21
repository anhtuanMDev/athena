import { PALETTE_KEYS, contrastWarnings, effectivePalette } from "~/lib/game-palette";

import { PaletteNote } from "./PaletteNote";
import { PaletteRow } from "./PaletteRow";
import { PaletteTabs } from "./PaletteTabs";
import { PaletteWarnings } from "./PaletteWarnings";

import type { useGameDraft } from "./hooks/useGameDraft";
import type { PaletteRowData } from "./types";

interface GamePaletteProps {
  form: ReturnType<typeof useGameDraft>;
}

/** The game's colors: the dark palette, all older app builds read, and the light screens' (any part of them). */
export function GamePalette({ form }: GamePaletteProps) {
  const { draft, tab } = form;
  // What the app draws each tab with: empty colors as the app fills them in.
  const lightFallbacks = effectivePalette(draft.palette, {});
  const darkFallbacks = effectivePalette({});
  const warnings = { dark: contrastWarnings(effectivePalette(draft.palette)), light: contrastWarnings(effectivePalette(draft.palette, draft.light)) };
  const rows: PaletteRowData[] = PALETTE_KEYS.map((key) =>
    tab === "dark"
      ? { key, value: draft.palette[key], set: (value: string) => { form.setColor(key, value); }, fallback: darkFallbacks[key] }
      : { key, value: draft.light[key] ?? "", set: (value: string) => { form.setLightColor(key, value); }, fallback: lightFallbacks[key] },
  );
  return (
    <>
      <div className="flex flex-col gap-4 pt-2">
        <PaletteTabs tab={tab} onTab={form.setTab} lowContrast={{ dark: warnings.dark.length, light: warnings.light.length }} />
        <PaletteNote tab={tab} onStartFromDark={() => { form.update({ light: { ...draft.palette } }); }} onClear={() => { form.update({ light: {} }); }} />
        <PaletteWarnings warnings={warnings[tab]} />
      </div>
      {rows.map((row) => (
        <PaletteRow key={`${tab}-${row.key}`} row={row} tab={tab} />
      ))}
    </>
  );
}
