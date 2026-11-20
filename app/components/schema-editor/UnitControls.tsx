import { CHECKBOX_LABEL_CLASS, INPUT_CLASS, LABEL_CLASS, SUB_INPUT_CLASS } from "./constants";

import type { DynamicField } from "~/schemas/dynamic-schema";

interface UnitControlsProps {
  field: DynamicField;
  onUnit: (unit: string) => void;
  onSuffix: (checked: boolean) => void;
  /** "field" for a top-level field's column, "sub" for a sub-field's row. */
  variant: "field" | "sub";
}

/**
 * A field's unit ("HP", "%") and whether each record types its own. The
 * field's unit stays when it does: it shows for a record that leaves its own
 * blank (dynamic-schema.ts, screen-model.ts valueWithUnit).
 */
export function UnitControls({ field, onUnit, onSuffix, variant }: UnitControlsProps) {
  const isField = variant === "field";
  const checkbox = (
    <label className={CHECKBOX_LABEL_CLASS}>
      <input
        type="checkbox"
        checked={field.hasCustomSuffix === true}
        onChange={(event) => {
          onSuffix(event.target.checked);
        }}
        className={`${isField ? "w-3.5 h-3.5" : "w-3 h-3"} rounded border-border-strong text-blue-600 focus:ring-blue-500 bg-surface cursor-pointer`}
      />
      User inputs custom unit in form
    </label>
  );
  return (
    <div className={isField ? "space-y-1.5" : "w-full sm:w-1/4 flex flex-col gap-1 justify-center"}>
      {isField && <label className={LABEL_CLASS}>Unit / Suffix (Optional)</label>}
      <input
        aria-label="Unit / Suffix (Optional)"
        value={field.unit ?? ""}
        onChange={(event) => {
          onUnit(event.target.value);
        }}
        placeholder={isField ? "e.g. %, HP, m/s" : "Unit"}
        className={isField ? INPUT_CLASS : `w-full ${SUB_INPUT_CLASS}`}
      />
      {checkbox}
    </div>
  );
}
