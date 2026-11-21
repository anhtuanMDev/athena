import { fieldSectionOf, isLinkingValue } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import { FieldSectionBody } from "./FieldSectionBody";

import type { PreviewProps } from "../types";

/**
 * field_section, as the app's FieldSection: the field's label (or the block's
 * title) over its value, and for a single enum value, its option's description and params.
 */
export function FieldSectionPreview(props: PreviewProps) {
  const { raw, show } = makeReader(props);
  const section = fieldSectionOf(props, isLinkingValue(raw("linkReferences")));
  const fieldHeading = section.field ? section.field.label : section.path;
  const heading = raw("title") ? show("title") : fieldHeading;
  return (
    <div className="space-y-2">
      <p className="text-[0.75rem] font-semibold uppercase tracking-widest opacity-80">{heading}</p>
      <FieldSectionBody section={section} ctx={props.ctx} shown={show("field")} />
    </div>
  );
}
