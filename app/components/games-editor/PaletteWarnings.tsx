import { MIN_CONTRAST, PALETTE_LABELS } from "~/lib/game-palette";

import type { contrastWarnings } from "~/lib/game-palette";

interface PaletteWarningsProps {
  warnings: ReturnType<typeof contrastWarnings>;
}

const RATIO_DIGITS = 2;

/** The tab's hard-to-read color pairs; the save goes ahead anyway. */
export function PaletteWarnings({ warnings }: PaletteWarningsProps) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold">Hard to read: below {MIN_CONTRAST}:1 (WCAG AA)</p>
      <ul className="mt-1 list-disc pl-4">
        {warnings.map(({ text, under, ratio }) => (
          <li key={`${text}-${under}`}>
            {PALETTE_LABELS[text]} on {PALETTE_LABELS[under]}: {ratio.toFixed(RATIO_DIGITS)}:1
          </li>
        ))}
      </ul>
      <p className="mt-1">You can still save. Text in the primary color the app makes readable by itself.</p>
    </div>
  );
}
