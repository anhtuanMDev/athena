import { isBinding } from "~/lib/screen-model";

import { MissingValue } from "../preview-parts/MissingValue";
import { textOf } from "../utils/preview-data";

interface NoItemsProps {
  /** The block's items prop: its own list, or the field it reads. */
  items: unknown;
}

/** A list block with no entries: the field the data lacks, or "No items". */
export function NoItems({ items }: NoItemsProps) {
  return <p className="text-xs text-ink-muted">{isBinding(items) ? <MissingValue path={textOf(items)} /> : "No items"}</p>;
}
