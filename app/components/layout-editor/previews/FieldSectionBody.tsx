import { FieldValuePreview } from "../preview-parts/FieldValuePreview";

import { EnumOptionPreview } from "./EnumOptionPreview";
import { ReferenceIdsPreview } from "./ReferenceIdsPreview";

import type { PreviewContext } from "../types";
import type { FieldSection } from "../utils/preview-data";
import type { ReactNode } from "react";

interface FieldSectionBodyProps {
  section: FieldSection;
  ctx: PreviewContext;
  /** The field's value as any other value shows. */
  shown: ReactNode;
}

/** A field_section's value: its entries, its references, its enum option, or the value itself. */
export function FieldSectionBody({ section, ctx, shown }: FieldSectionBodyProps) {
  const { field, value, option, ids, entries, isLinking } = section;
  if (entries) {
    return <FieldValuePreview view={entries} />;
  }
  if (ids && field) {
    return <ReferenceIdsPreview field={field} ids={ids} isList={Array.isArray(value)} isLinking={isLinking} ctx={ctx} />;
  }
  if (option) {
    return <EnumOptionPreview option={option} pictures={ctx.pictures} />;
  }
  return <p className="text-sm">{shown}</p>;
}
