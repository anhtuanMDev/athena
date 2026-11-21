import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** screen_header: the game's logo, a title and a subtitle. */
export function ScreenHeaderPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  return (
    <div className="space-y-1">
      {raw("showLogo") !== false && (
        <p className="flex items-center gap-2 text-xs font-bold uppercase">
          <span className="size-5 rounded-full bg-surface-raised" /> Game logo
        </p>
      )}
      {show("title") && <p className="text-3xl font-black uppercase italic leading-none">{show("title")}</p>}
      {show("subtitle") && <p className="text-xs uppercase tracking-widest text-ink-muted">{show("subtitle")}</p>}
    </div>
  );
}
