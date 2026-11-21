import { isBinding } from "~/lib/screen-model";

import { MissingValue } from "../preview-parts/MissingValue";

import { propValue, shownText } from "./preview-data";

import type { PreviewProps, PreviewReader } from "../types";

/** A block's props as its preview reads them; for a list block, as one entry reads them. */
export function makeReader(props: PreviewProps, item?: unknown): PreviewReader {
  const raw = (name: string) => propValue(props, name, item);
  const show = (name: string) => {
    const text = shownText(raw(name));
    if (text !== null) {
      return text;
    }
    const prop = props.block.props[name];
    return isBinding(prop) ? <MissingValue path={prop} /> : null;
  };
  return { raw, show };
}
