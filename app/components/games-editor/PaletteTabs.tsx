import type { PaletteTab } from "./types";

interface PaletteTabsProps {
  tab: PaletteTab;
  onTab: (tab: PaletteTab) => void;
  /** Each tab's count of hard-to-read color pairs. */
  lowContrast: Record<PaletteTab, number>;
}

const TABS: PaletteTab[] = ["dark", "light"];
const NAMES: Record<PaletteTab, string> = { dark: "Dark", light: "Light" };

/** The Dark and Light tabs, each saying how many of its color pairs are hard to read. */
export function PaletteTabs({ tab, onTab, lowContrast }: PaletteTabsProps) {
  return (
    <div role="tablist" aria-label="Palette" className="flex gap-2">
      {TABS.map((each) => (
        <button
          key={each}
          type="button"
          role="tab"
          aria-selected={tab === each}
          onClick={() => { onTab(each); }}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${tab === each ? "bg-primary-tint text-primary-ink" : "text-ink-muted hover:bg-surface-raised hover:text-ink"}`}
        >
          {NAMES[each]}
          {lowContrast[each] > 0 && <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">· {lowContrast[each]} low contrast</span>}
        </button>
      ))}
    </div>
  );
}
