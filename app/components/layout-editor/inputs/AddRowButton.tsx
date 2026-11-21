import { Plus } from "lucide-react";

import { addButtonClass } from "../constants";

interface AddRowButtonProps {
  /** What a row is called: "tile" or "row". */
  noun: string;
  count: number;
  /** The app shows this many at most. */
  max: number;
  onAdd: () => void;
}

/** Adds a row, until the app's limit. */
export function AddRowButton({ noun, count, max, onAdd }: AddRowButtonProps) {
  return (
    <>
      <button type="button" onClick={onAdd} disabled={count >= max} className={addButtonClass}>
        <Plus aria-hidden="true" className="size-4" />
        {`Add ${noun}`}
      </button>
      {count >= max && <p className="text-xs text-ink-muted">The app shows {max} {noun}s at most.</p>}
    </>
  );
}
