import { inputBaseClass, inputClass } from "~/components/ui/input-classes";

import type { RecordSource } from "~/lib/screen-model";

interface SourceOrderLimitProps {
  source: Partial<RecordSource>;
  /** The app lists this many records at most. */
  limit: number;
  onUpdate: (patch: Partial<RecordSource>) => void;
}

/** A source's sort order and how many records it shows. */
export function SourceOrderLimit({ source, limit, onUpdate }: SourceOrderLimitProps) {
  const isOverLimit = typeof source.limit === "number" && source.limit > limit;
  return (
    <>
      <div className="flex gap-2">
        <select aria-label="Order" value={source.order ?? "asc"} disabled={!source.sort} onChange={(e) => onUpdate({ order: e.target.value === "desc" ? "desc" : undefined })} className={inputClass}>
          <option value="asc">A → Z</option>
          <option value="desc">Z → A</option>
        </select>
        <input aria-label="Show at most" type="number" min={1} max={limit} inputMode="numeric" placeholder={`All, up to ${String(limit)}`} value={source.limit ?? ""} disabled={!source.category} aria-invalid={isOverLimit || undefined} onChange={(e) => onUpdate({ limit: e.target.value ? Number(e.target.value) : undefined })} className={`${inputBaseClass} w-28 tabular-nums`} />
      </div>
      {isOverLimit && <p className="col-span-2 text-xs text-danger-ink">The app shows at most {limit} records.</p>}
    </>
  );
}
