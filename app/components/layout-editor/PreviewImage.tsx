import { ImageOff } from "lucide-react";

import { appPicture, refusedPicture } from "~/lib/app-pictures";

import type { PicturePolicy } from "~/lib/app-pictures";

interface PreviewImageProps {
  /** The stored picture: a path, a URL or a map of variants. */
  value: unknown;
  /** Which pictures the app loads, and which variant of a map of them it shows (the manifest's policy). */
  pictures: PicturePolicy;
  className: string;
}

/**
 * A picture as the app shows it (app-pictures.ts appPicture): the variant it
 * picks, from where it loads it. One it won't load (another host, http…)
 * shows as such, not as the picture the browser would load.
 */
export function PreviewImage({ value, pictures, className }: PreviewImageProps) {
  const src = appPicture(value, pictures);
  if (src !== null) {
    return <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />;
  }
  const refused = refusedPicture(value, pictures);
  if (refused === undefined) {
    return (
      <div className={`flex items-center justify-center bg-surface-raised text-ink-muted ${className}`}>
        <ImageOff aria-hidden="true" className="size-5" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`The app won't load this picture: ${refused}`}
      title={`The app won't load ${refused}: use an uploaded picture or one on ${pictures.imageHosts.join(", ")}.`}
      className={`flex flex-col items-center justify-center gap-1 overflow-hidden border border-dashed border-danger bg-danger/10 p-1 text-center text-danger-ink ${className}`}
    >
      <ImageOff aria-hidden="true" className="size-5 shrink-0" />
      <span className="text-[0.625rem] font-semibold leading-tight">Won't load in the app</span>
    </div>
  );
}
