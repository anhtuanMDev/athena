import { PREVIEW_ENTRIES, itemPropOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

interface TipsListProps {
  preview: PreviewProps;
  entries: unknown[];
}

/** A tips card's first tips: text entries as they are, others by their item prop. */
export function TipsList({ preview, entries }: TipsListProps) {
  const itemProp = itemPropOf(preview.block.type);
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
      {entries.slice(0, PREVIEW_ENTRIES).map((entry, i) => (
        <li key={i}>{typeof entry === "string" ? entry : makeReader(preview, entry).show(itemProp)}</li>
      ))}
    </ul>
  );
}
