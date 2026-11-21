import { RouteStops } from "../preview-parts/RouteStops";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

interface RouteBodyProps {
  preview: PreviewProps;
  entries: unknown[];
}

/** A route timeline's text over its stages. */
export function RouteBody({ preview, entries }: RouteBodyProps) {
  const { raw, show } = makeReader(preview);
  return (
    <>
      {raw("text") !== undefined && <p className="mb-2 text-xs text-ink-muted">{show("text")}</p>}
      <RouteStops preview={preview} entries={entries} />
    </>
  );
}
