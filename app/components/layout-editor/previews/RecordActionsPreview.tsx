import { PreviewButton } from "../preview-parts/PreviewButton";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** record_actions: the favorite and share buttons it shows. */
export function RecordActionsPreview(props: PreviewProps) {
  const { raw } = makeReader(props);
  return (
    <div className="flex gap-2">
      {raw("showFavorite") !== false && <PreviewButton>♥ Favorite</PreviewButton>}
      {raw("showShare") !== false && <PreviewButton>Share</PreviewButton>}
    </div>
  );
}
