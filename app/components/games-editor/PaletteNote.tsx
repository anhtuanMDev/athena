import { Button } from "~/components/ui/button";

import { DARK_NOTE, LIGHT_NOTE } from "./constants";

import type { PaletteTab } from "./types";

interface PaletteNoteProps {
  tab: PaletteTab;
  onStartFromDark: () => void;
  onClear: () => void;
}

/** What the tab's colors are for; the light tab's can start from the dark ones, or be cleared. */
export function PaletteNote({ tab, onStartFromDark, onClear }: PaletteNoteProps) {
  if (tab === "dark") {
    return <p className="text-xs text-ink-muted">{DARK_NOTE}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 min-w-48 text-xs text-ink-muted">{LIGHT_NOTE}</p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" onClick={onStartFromDark}>
          Start from dark
        </Button>
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
