import { FormField } from "~/components/FormField";
import { PALETTE_LABELS, isHex } from "~/lib/game-palette";

import type { PaletteRowData, PaletteTab } from "./types";

interface PaletteRowProps {
  row: PaletteRowData;
  tab: PaletteTab;
}

/** What a dark color's field says when it isn't a hex color: all 14 are required. */
const darkColorHelp = (value: string): string => (value.trim() === "" ? "Required" : "Not a hex color");
const SIX_DIGIT_HEX = /^#[0-9A-F]{6}$/i;

/** One color: its picker and its hex field. Dark colors are all required; a light one may be left empty. */
export function PaletteRow({ row, tab }: PaletteRowProps) {
  const { key, value, set, fallback } = row;
  const isDark = tab === "dark";
  return (
    <div className="flex gap-4 items-center">
      <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 border border-border shadow-sm">
        <input aria-label={`${PALETTE_LABELS[key]} color`} type="color" className="absolute -inset-2 w-14 h-14 cursor-pointer" value={SIX_DIGIT_HEX.test(value) ? value : fallback} onChange={(event) => { set(event.target.value); }} />
      </div>
      <div className="flex-1">
        <FormField
          name={isDark ? key : `light.${key}`}
          label={`${PALETTE_LABELS[key]} (Hex)`}
          placeholder={fallback}
          required={false}
          value={value}
          onChange={(event) => { set(event.target.value); }}
          error={isDark ? !isHex(value) : value.trim() !== "" && !isHex(value)}
          helperText={isDark && !isHex(value) ? darkColorHelp(value) : undefined}
          slotProps={isDark ? undefined : { inputLabel: { shrink: true } }}
        />
      </div>
    </div>
  );
}
