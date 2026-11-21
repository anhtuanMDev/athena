import { isBinding } from "~/lib/screen-model";

import { MissingValue } from "../preview-parts/MissingValue";
import { textOf } from "../utils/preview-data";

interface InfoValueProps {
  /** The value as read. */
  value: unknown;
  /** The row's own value: fixed text, or the "data.<path>" it reads. */
  prop: unknown;
}

/** An info row's value: as text, the path the data lacks, or a dash. */
export function InfoValue({ value, prop }: InfoValueProps) {
  if (value !== undefined && value !== "") {
    return textOf(value);
  }
  return isBinding(prop) ? <MissingValue path={prop} /> : "—";
}
