import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { smallButtonClass } from "../constants";
import { moved } from "../utils/prop-values";

interface RowButtonsProps<T> {
  /** What a row is called: "tile" or "row". */
  noun: string;
  index: number;
  items: readonly T[];
  onItems: (next: T[]) => void;
}

/** Move a row up or down, or remove it. */
export function RowButtons<T>({ noun, index, items, onItems }: RowButtonsProps<T>) {
  const position = String(index + 1);
  return (
    <div className="flex">
      <button type="button" aria-label={`Move ${noun} ${position} up`} disabled={index === 0} onClick={() => onItems(moved(items, index, -1))} className={smallButtonClass}><ArrowUp aria-hidden="true" className="size-4" /></button>
      <button type="button" aria-label={`Move ${noun} ${position} down`} disabled={index === items.length - 1} onClick={() => onItems(moved(items, index, 1))} className={smallButtonClass}><ArrowDown aria-hidden="true" className="size-4" /></button>
      <button type="button" aria-label={`Remove ${noun} ${position}`} onClick={() => onItems(items.filter((_, j) => j !== index))} className={smallButtonClass}><Trash2 aria-hidden="true" className="size-4" /></button>
    </div>
  );
}
