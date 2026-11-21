import { FavoritesNote } from "../preview-parts/FavoritesNote";
import { listSourceOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import { CarouselCards } from "./CarouselCards";

import type { PreviewProps } from "../types";

/** featured_carousel: its first record, large, or its first records as cards. */
export function FeaturedCarouselPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  const source = listSourceOf(props);
  const records = props.ctx.recordsFor(source);
  if (records.length === 0) {
    return <p className="text-xs text-ink-muted">Carousel: no records to show yet</p>;
  }
  if (raw("variant") === "cards") {
    return <CarouselCards preview={props} records={records} source={source} />;
  }
  const item = makeReader(props, records[0]);
  return (
    <div>
      <FavoritesNote source={source} />
      <div className="space-y-2 rounded-2xl bg-ink p-4 text-page">
        {show("eyebrow") && <p className="text-[0.75rem] font-semibold uppercase italic opacity-80">{show("eyebrow")}</p>}
        <p className="text-2xl font-black uppercase italic leading-none">{item.show("itemTitle")}</p>
        {item.show("itemSubtitle") && <p className="text-xs font-semibold uppercase">{item.show("itemSubtitle")}</p>}
        {item.show("itemText") && <p className="line-clamp-2 text-xs opacity-90">{item.show("itemText")}</p>}
        <p className="text-[0.75rem] tabular-nums opacity-70">1 / {records.length}</p>
      </div>
    </div>
  );
}
