import { SectionTitle } from "../preview-parts/SectionTitle";
import { PREVIEW_ENTRIES } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import { NoItems } from "./NoItems";

import type { PreviewProps } from "../types";

/** item_list: a list prop's first entries, each a title, a subtitle and text. */
export function ItemListPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  const items = raw("items");
  const entries = Array.isArray(items) ? items : [];
  return (
    <div>
      <SectionTitle>{show("title")}</SectionTitle>
      {entries.length === 0 && <NoItems items={props.block.props.items} />}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.slice(0, PREVIEW_ENTRIES).map((entry, i) => {
            const item = makeReader(props, entry);
            return (
              <div key={i} className="flex gap-2">
                <span className="size-8 shrink-0 rounded-full border-2 border-ink" />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase">{item.show("itemTitle")}</p>
                  {item.show("itemSubtitle") && <p className="text-[0.75rem] uppercase text-ink-muted">{item.show("itemSubtitle")}</p>}
                  {item.show("itemText") && <p className="line-clamp-2 text-[0.75rem] text-ink-muted">{item.show("itemText")}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
