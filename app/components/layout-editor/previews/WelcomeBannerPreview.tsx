import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** welcome_banner: the greeting and a sample player, and what signed-out players see. */
export function WelcomeBannerPreview(props: PreviewProps) {
  const { show } = makeReader(props);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="size-10 shrink-0 rounded-full border-2 border-primary bg-surface-raised" />
        <div>
          <p className="text-[0.75rem] font-semibold uppercase italic text-primary-ink">{show("greeting")},</p>
          <p className="text-2xl font-black uppercase italic leading-none">Tanya</p>
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        {show("signedOutText") ? <>Signed out: “{show("signedOutText")}” with a Sign in button</> : "Hidden for signed-out players"}
      </p>
    </div>
  );
}
