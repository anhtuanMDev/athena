import { PreviewImage } from "../PreviewImage";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** cover_entity_header: a cover picture over a title and a subtitle. */
export function CoverEntityHeaderPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  return (
    <div className="-mx-4 -mt-4 overflow-hidden">
      <PreviewImage value={raw("backgroundImage")} pictures={props.ctx.pictures} className="h-36 w-full" />
      <div className="space-y-1 px-4 pt-3">
        <p className="text-2xl font-bold tracking-tight">{show("title") ?? "Title"}</p>
        {show("subtitle") && <p className="text-sm text-ink-muted">{show("subtitle")}</p>}
      </div>
    </div>
  );
}
