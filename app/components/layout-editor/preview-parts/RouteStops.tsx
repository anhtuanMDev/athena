import { routeLayout } from "~/lib/screen-fields";

import { isPresent, textOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

interface RouteStopsProps {
  preview: PreviewProps;
  entries: unknown[];
}

/**
 * A route's stages on a line, as the app draws them (zms RouteTimeline.tsx):
 * up to the app's routeStops, and past four, each label may span two columns
 * on one line and every other one drops a row, so neighbours never meet.
 */
export function RouteStops({ preview, entries }: RouteStopsProps) {
  const { stops, staggered: isStaggered } = routeLayout(entries, preview.ctx.routeStops);
  const readers = stops.map((entry) => makeReader(preview, entry));
  const details = readers.map((reader) => {
    const value = reader.raw("itemDetail");
    return isPresent(value) ? textOf(value) : undefined;
  });
  // A dropped row clears the row above: one line of text (two with details) and a gap.
  const drop = details.some((detail) => detail !== undefined) ? "mt-12" : "mt-[1.625rem]";
  const clamp = isStaggered ? "line-clamp-1" : "line-clamp-2";
  const dropOf = (index: number) => (index % 2 === 1 ? drop : "");
  const widthOf = (index: number) => (isStaggered ? ["w-[200%]", dropOf(index)].join(" ") : "w-full");
  return (
    <div className="relative mt-3 flex">
      <span aria-hidden="true" className="absolute inset-x-[8%] top-[6px] h-0.5 rounded bg-border" />
      {readers.map((reader, i) => (
        <div key={i} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span aria-hidden="true" className={`size-3.5 rotate-45 border-2 border-ink ${i === 0 ? "bg-ink" : "bg-surface"}`} />
          <div className={`flex flex-col gap-1 text-center ${widthOf(i)}`}>
            <p className={`text-[0.75rem] font-bold uppercase ${clamp}`}>{reader.show("itemLabel")}</p>
            {details[i] !== undefined && <p className={`text-[0.75rem] uppercase text-ink-muted ${clamp}`}>{details[i]}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
