import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** badge: its label, as a chip. */
export function BadgePreview(props: PreviewProps) {
  const { show } = makeReader(props);
  return <span className="inline-flex rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-semibold">{show("label") ?? "Badge"}</span>;
}
