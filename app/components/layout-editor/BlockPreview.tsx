import { GenericPreview } from "./previews/GenericPreview";
import { HEADER_PREVIEWS } from "./utils/header-previews";
import { LIST_PREVIEWS } from "./utils/list-previews";
import { ownKeyIn } from "./utils/own-entry";

import type { PreviewContext } from "./types";
import type { PrimitiveSpec, ScreenBlock } from "~/lib/screen-model";

export type { PreviewContext } from "./types";

/** A block in the screen's preview: a sketch of what each app block receives, not the app's own styling. */
export function BlockPreview({
  block,
  spec,
  ctx,
  selected,
  onSelect,
}: {
  block: ScreenBlock;
  spec: PrimitiveSpec | undefined;
  ctx: PreviewContext;
  selected: boolean;
  onSelect: () => void;
}) {
  // A type the tables don't hold as their own (an unknown block, or "constructor") gets the generic preview.
  const type = ownKeyIn([HEADER_PREVIEWS, LIST_PREVIEWS], block.type);
  const Preview = type === undefined ? GenericPreview : (HEADER_PREVIEWS[type] ?? LIST_PREVIEWS[type] ?? GenericPreview);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Edit ${spec?.name ?? block.type} block`}
      aria-current={selected ? "true" : undefined}
      className={`block w-full rounded-lg text-left outline-offset-4 transition-[outline-color] duration-150 focus-visible:outline-2 focus-visible:outline-focus ${
        selected ? "outline-2 outline-primary" : "outline-1 outline-transparent hover:outline-dashed hover:outline-border-strong"
      }`}
    >
      <Preview block={block} spec={spec} ctx={ctx} />
    </button>
  );
}
