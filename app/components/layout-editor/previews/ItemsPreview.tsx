import { SectionTitle } from "../preview-parts/SectionTitle";
import { makeReader } from "../utils/preview-reader";

import { GalleryPictures } from "./GalleryPictures";
import { NoItems } from "./NoItems";
import { RouteBody } from "./RouteBody";
import { TipsList } from "./TipsList";

import type { PreviewProps } from "../types";

/** route_timeline, gallery and tips_card: a list prop's entries, as a route, pictures or tips. */
export function ItemsPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  const { block } = props;
  const items = raw("items");
  const entries = Array.isArray(items) ? items : [];
  const title = show("title") ?? (block.type === "tips_card" ? "Tips" : null);
  if (entries.length === 0) {
    return (
      <div>
        <SectionTitle>{title}</SectionTitle>
        <NoItems items={block.props.items} />
      </div>
    );
  }
  return (
    <div className={block.type === "gallery" ? "" : "rounded-xl border border-border bg-surface p-3"}>
      <SectionTitle>{title}</SectionTitle>
      {block.type === "route_timeline" && <RouteBody preview={props} entries={entries} />}
      {block.type === "gallery" && <GalleryPictures preview={props} entries={entries} />}
      {block.type === "tips_card" && <TipsList preview={props} entries={entries} />}
    </div>
  );
}
