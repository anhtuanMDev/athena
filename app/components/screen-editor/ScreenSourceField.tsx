import { SourceInput } from "~/components/layout-editor/inputs/SourceInput";
import { inputClass } from "~/components/ui/input-classes";

import type { Category } from "~/lib/categories";
import type { RecordSource, SchemaInfo, ScreenFile } from "~/lib/screen-model";
import type { AppLimits } from "~/lib/screen-policy";

interface ScreenSourceFieldProps {
  screen: ScreenFile;
  /** The configured categories, the game's schemas and the app's limits. */
  sources: { categories: readonly Category[]; schemas: SchemaInfo[]; limits: AppLimits };
  isInvalid: boolean;
  onSource: (source: RecordSource | undefined) => void;
}

/** The records a list screen lists, or the category of the record a detail screen shows; nothing for other screens. */
export function ScreenSourceField({ screen, sources, isInvalid, onSource }: ScreenSourceFieldProps) {
  if (screen.type === "list") {
    return (
      // The records the screen's list blocks show unless they set their own (zms useSourceRecords).
      <div className="text-xs font-medium text-ink md:col-span-2">
        <label htmlFor="screen-source">Records listed</label>
        <div className="mt-1.5">
          <SourceInput id="screen-source" value={screen.source} onChange={(source) => onSource(source as RecordSource | undefined)} schemas={sources.schemas} limits={sources.limits} emptyLabel="Choose a category…" />
        </div>
      </div>
    );
  }
  if (screen.type !== "detail") {
    return null;
  }
  const withSchemas = sources.categories.filter((category) => sources.schemas.some((schema) => schema.category === category.category));
  return (
    <label className="block text-xs font-medium text-ink">
      Record shown
      <select
        value={screen.source?.category ?? ""}
        // A detail screen shows the record it was opened with, so only the category counts.
        onChange={(e) => onSource(e.target.value ? { category: e.target.value } : undefined)}
        className={`${inputClass} mt-1.5`}
        aria-invalid={isInvalid ? true : undefined}
      >
        <option value="">Choose a category…</option>
        {withSchemas.map((category) => (
          <option key={category.category} value={category.category}>
            {category.label}
          </option>
        ))}
      </select>
    </label>
  );
}
