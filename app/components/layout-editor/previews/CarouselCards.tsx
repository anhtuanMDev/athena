import { FavoritesNote } from "../preview-parts/FavoritesNote";
import { PreviewImage } from "../PreviewImage";
import { CAROUSEL_CARDS } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";
import type { RecordSource } from "~/lib/screen-model";

interface CarouselCardsProps {
  preview: PreviewProps;
  records: Record<string, unknown>[];
  source: RecordSource | undefined;
}

/** A featured carousel's "cards" variant: the first records as cards, the second one in front. */
export function CarouselCards({ preview, records, source }: CarouselCardsProps) {
  return (
    <div>
      <FavoritesNote source={source} />
      <div className="flex items-center gap-2 overflow-hidden">
        {records.slice(0, CAROUSEL_CARDS).map((record, i) => {
          const reader = makeReader(preview, record);
          const size = i === 1 || records.length === 1 ? "h-48 w-36" : "h-40 w-28 opacity-60";
          return (
            <div key={i} className={`relative shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-surface ${size}`}>
              <PreviewImage value={reader.raw("itemImage")} pictures={preview.ctx.pictures} className="absolute inset-0 h-full w-full opacity-70" />
              <div className="relative space-y-0.5 p-2">
                <p className="text-[0.75rem] font-semibold uppercase">{reader.show("itemSubtitle")}</p>
                <p className="text-base font-black uppercase italic leading-none">{reader.show("itemTitle")}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
