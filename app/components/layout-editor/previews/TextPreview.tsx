import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** text: its text. */
export function TextPreview(props: PreviewProps) {
  const { show } = makeReader(props);
  return <p className="text-sm">{show("text") ?? <span className="text-xs text-ink-muted">No text set</span>}</p>;
}
