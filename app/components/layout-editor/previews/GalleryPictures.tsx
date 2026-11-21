import { PreviewImage } from "../PreviewImage";
import { GALLERY_PICTURES, itemPropOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

interface GalleryPicturesProps {
  preview: PreviewProps;
  entries: unknown[];
}

/** A gallery's first pictures. */
export function GalleryPictures({ preview, entries }: GalleryPicturesProps) {
  const itemProp = itemPropOf(preview.block.type);
  return (
    <div className="flex gap-2 overflow-hidden">
      {entries.slice(0, GALLERY_PICTURES).map((entry, i) => (
        <PreviewImage key={i} value={makeReader(preview, entry).raw(itemProp)} pictures={preview.ctx.pictures} className="h-16 w-24 shrink-0 rounded-md" />
      ))}
    </div>
  );
}
