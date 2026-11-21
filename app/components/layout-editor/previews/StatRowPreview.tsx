import { statSlots, textOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** stat_row: each set stat, its value over its label. */
export function StatRowPreview(props: PreviewProps) {
  const { show } = makeReader(props);
  return (
    <div className="grid grid-flow-col divide-x divide-border rounded-xl border border-border bg-surface py-2 text-center">
      {statSlots(props.block).map((stat, i) => (
        <div key={i} className="px-1">
          <p className="text-base font-bold tabular-nums">{show(stat.valueProp)}</p>
          <p className="truncate text-[0.75rem] uppercase text-ink-muted">{textOf(stat.label ?? "")}</p>
        </div>
      ))}
    </div>
  );
}
