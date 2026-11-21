import { ReferenceValue } from "../preview-parts/ReferenceValue";

import type { PreviewContext } from "../types";
import type { FieldOption } from "~/lib/screen-model";

interface ReferenceIdsPreviewProps {
  field: FieldOption;
  ids: string[];
  /** A list of references shows as chips. */
  isList: boolean;
  isLinking: boolean;
  ctx: PreviewContext;
}

/** References as field_section shows them: by their records' labels (the id when there's none). */
export function ReferenceIdsPreview({ field, ids, isList, isLinking, ctx }: ReferenceIdsPreviewProps) {
  return (
    <div className={isList ? "flex flex-wrap gap-1.5" : ""}>
      {ids.map((id, i) => {
        const found = ctx.reference(field, id);
        return <ReferenceValue key={i} text={found?.label ?? id} isLinked={isLinking && Boolean(found?.linked)} isChip={isList} />;
      })}
    </div>
  );
}
