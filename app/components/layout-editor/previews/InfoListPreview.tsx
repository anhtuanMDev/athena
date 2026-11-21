import { SectionTitle } from "../preview-parts/SectionTitle";
import { entriesOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import { InfoRowPreview } from "./InfoRowPreview";

import type { PreviewProps } from "../types";

/** info_list: its rows, each an icon, a label and a value. */
export function InfoListPreview(props: PreviewProps) {
  const { show } = makeReader(props);
  const rows = entriesOf<{ label?: string; value?: unknown; icon?: string }>(props.block.props.rows);
  return (
    <div className="space-y-2">
      <SectionTitle>{show("title")}</SectionTitle>
      {rows.map((row, i) => (
        <InfoRowPreview key={i} row={row} ctx={props.ctx} />
      ))}
    </div>
  );
}
