import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";

import { iconButtonClass } from "./constants";

import type { BlockActions, BlockPosition } from "./types";
import type { ScreenBlock } from "~/lib/screen-model";

interface BlockRowButtonsProps {
  block: ScreenBlock;
  name: string;
  position: BlockPosition;
  actions: BlockActions;
}

/** Show or hide a block in the app, and move it up or down. */
export function BlockRowButtons({ block, name, position, actions }: BlockRowButtonsProps) {
  const isHidden = block.visible === false;
  const { index, count } = position;
  return (
    <>
      <button type="button" onClick={() => actions.patch(block.id, { visible: isHidden })} aria-label={isHidden ? `Show ${name} in the app` : `Hide ${name} in the app`} className={iconButtonClass}>
        {isHidden ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
      </button>
      <button type="button" id={`block-${block.id}-up`} onClick={() => actions.move(index, -1)} disabled={index === 0} aria-label={`Move ${name} up`} className={iconButtonClass}>
        <ArrowUp aria-hidden="true" className="size-4" />
      </button>
      <button type="button" id={`block-${block.id}-down`} onClick={() => actions.move(index, 1)} disabled={index === count - 1} aria-label={`Move ${name} down`} className={iconButtonClass}>
        <ArrowDown aria-hidden="true" className="size-4" />
      </button>
    </>
  );
}
