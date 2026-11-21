import { appPicture, refusedPicture } from "~/lib/app-pictures";

import { PreviewButton } from "../preview-parts/PreviewButton";
import { PreviewImage } from "../PreviewImage";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** detail_header: a record's title over its picture, with a quote and a button. */
export function DetailHeaderPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  const { pictures } = props.ctx;
  const background = raw("imageMode") === "background" ? raw("image") : undefined;
  const backgroundSrc = appPicture(background, pictures);
  return (
    <div className="relative -mx-4 -mt-4 space-y-2 overflow-hidden bg-surface-raised p-4 pt-8">
      {backgroundSrc && (
        <>
          <img src={backgroundSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-page" />
        </>
      )}
      {refusedPicture(background, pictures) !== undefined && <PreviewImage value={background} pictures={pictures} className="relative h-16 w-full rounded-md" />}
      <div className="relative space-y-2">
        {show("eyebrow") && <p className="text-xs font-semibold uppercase">{show("eyebrow")}</p>}
        <p className="text-4xl font-black uppercase italic leading-none">{show("title") ?? "Title"}</p>
        {show("quote") && <p className="line-clamp-3 text-sm">“{show("quote")}”</p>}
        {show("buttonLabel") && <PreviewButton>{show("buttonLabel")}</PreviewButton>}
      </div>
    </div>
  );
}
