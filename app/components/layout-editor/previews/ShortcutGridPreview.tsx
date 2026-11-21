import { SectionTitle } from "../preview-parts/SectionTitle";
import { entriesOf, labelOr } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** shortcut_grid: its tiles, each an icon name and a label. */
export function ShortcutGridPreview(props: PreviewProps) {
  const { show } = makeReader(props);
  const items = entriesOf<{ label?: string; icon?: string }>(props.block.props.items);
  return (
    <div>
      <SectionTitle>{show("title")}</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface py-3">
            <span className="font-mono text-[0.75rem] text-ink-muted">{item.icon ?? "—"}</span>
            <span className="text-[0.75rem] font-bold uppercase italic">{labelOr(item.label, "Label")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
