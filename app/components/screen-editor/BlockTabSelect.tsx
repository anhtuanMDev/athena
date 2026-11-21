import { inputClass } from "~/components/ui/input-classes";

import type { ScreenBlock } from "~/lib/screen-model";

interface BlockTabSelectProps {
  block: ScreenBlock;
  tabs: string[];
  onTab: (tab: string | undefined) => void;
}

/** The tab a block shows on, when the screen has a tab bar. */
export function BlockTabSelect({ block, tabs, onTab }: BlockTabSelectProps) {
  return (
    <label className="block max-w-xs text-xs font-medium text-ink">
      Shown on tab
      <select value={block.tab ?? ""} onChange={(e) => onTab(e.target.value || undefined)} className={`${inputClass} mt-1.5`}>
        <option value="">Every tab</option>
        {block.tab && !tabs.includes(block.tab) && <option value={block.tab}>{block.tab} (no such tab)</option>}
        {tabs.map((tab) => (
          <option key={tab} value={tab}>
            {tab}
          </option>
        ))}
      </select>
    </label>
  );
}
