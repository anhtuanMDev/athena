import { tabsOf } from "../utils/preview-data";

import type { PreviewProps } from "../types";

/** tab_bar: its tabs, the first one selected. */
export function TabBarPreview({ block }: PreviewProps) {
  return (
    <div className="flex gap-4">
      {tabsOf(block.props.tabs).map((tab, i) => (
        <span key={tab} className={`border-b-2 pb-1 text-sm font-bold uppercase italic ${i === 0 ? "border-ink" : "border-transparent text-ink-muted"}`}>
          {tab}
        </span>
      ))}
    </div>
  );
}
