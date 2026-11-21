import { MissingValue } from "../preview-parts/MissingValue";
import { textOf } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** filter_chips: "All" and the field's enum options, as chips. */
export function FilterChipsPreview(props: PreviewProps) {
  const { raw } = makeReader(props);
  const { block, ctx } = props;
  const field = ctx.dataFields.find((option) => option.key === block.props.field);
  const options = ctx.enumOptions(field);
  return (
    <div className="flex flex-wrap gap-1.5">
      {[textOf(raw("allLabel") ?? "All"), ...options.map((option) => option.name)].map((name, i) => (
        <span key={name} className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${i === 0 ? "border border-ink" : "bg-surface-raised"}`}>
          {name}
        </span>
      ))}
      {options.length === 0 && <MissingValue path={`options of ${textOf(block.props.field ?? "?")}`} />}
    </div>
  );
}
