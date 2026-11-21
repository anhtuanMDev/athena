import { PreviewButton } from "../preview-parts/PreviewButton";
import { SectionTitle } from "../preview-parts/SectionTitle";
import { PreviewImage } from "../PreviewImage";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** promo_card: a card with a picture, a title, text and a button. */
export function PromoCardPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  return (
    <div>
      <SectionTitle>{show("sectionTitle")}</SectionTitle>
      <div className="space-y-1 rounded-xl border border-border bg-surface p-4">
        {raw("image") !== undefined && <PreviewImage value={raw("image")} pictures={props.ctx.pictures} className="mb-2 h-24 w-full rounded-md" />}
        {show("eyebrow") && <p className="text-[0.75rem] font-semibold uppercase">{show("eyebrow")}</p>}
        <p className="text-lg font-black uppercase italic">{show("title") ?? "Title"}</p>
        {show("text") && <p className="text-xs text-ink-muted">{show("text")}</p>}
        {show("buttonLabel") && <PreviewButton isDark>{show("buttonLabel")}</PreviewButton>}
      </div>
    </div>
  );
}
