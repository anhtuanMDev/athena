import { infoRowValue, labelOr } from "../utils/preview-data";

import { InfoValue } from "./InfoValue";

import type { PreviewContext } from "../types";

interface InfoRowPreviewProps {
  row: { label?: string; value?: unknown; icon?: string };
  ctx: PreviewContext;
}

/** One info row: its icon, its label, and its value (read from the screen's data when bound). */
export function InfoRowPreview({ row, ctx }: InfoRowPreviewProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-full border border-border font-mono text-[0.75rem] text-ink-muted">{row.icon ? row.icon.slice(0, 2) : "·"}</span>
      <div>
        <p className="text-xs font-bold uppercase">{labelOr(row.label, "Label")}</p>
        <p className="text-xs font-semibold uppercase text-ink-muted">
          <InfoValue value={infoRowValue(ctx, row.value)} prop={row.value} />
        </p>
      </div>
    </div>
  );
}
