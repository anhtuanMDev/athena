import { FavoritesNote } from "../preview-parts/FavoritesNote";
import { SectionTitle } from "../preview-parts/SectionTitle";
import { PreviewImage } from "../PreviewImage";
import { GRID_RECORDS, listSourceOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** record_grid: the first records, each a picture and a label. */
export function RecordGridPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  const source = listSourceOf(props);
  const records = props.ctx.recordsFor(source);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <SectionTitle>{show("title")}</SectionTitle>
        {raw("showCount") === true && <span className="text-[0.75rem] text-ink-muted tabular-nums">{records.length}</span>}
      </div>
      <FavoritesNote source={source} />
      {records.length === 0 && <p className="text-xs text-ink-muted">No records to show yet</p>}
      {records.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {records.slice(0, GRID_RECORDS).map((record, i) => {
            const item = makeReader(props, record);
            return (
              <div key={i} className="space-y-1">
                <PreviewImage value={item.raw("itemImage")} pictures={props.ctx.pictures} className="aspect-square w-full rounded-md" />
                <p className="truncate text-[0.75rem] font-bold uppercase">{item.show("itemLabel")}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
