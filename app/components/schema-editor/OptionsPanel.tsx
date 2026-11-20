import { CHOICE_TYPES, INPUT_CLASS, LABEL_CLASS, SUB_INPUT_CLASS } from "./constants";
import { OptionsBox } from "./OptionsBox";

import type { DynamicField } from "~/schemas/dynamic-schema";

interface OptionsPanelProps {
  field: DynamicField;
  enums: string[];
  onOptions: (lines: string) => void;
  onGlobalEnum: (enumId: string) => void;
  /** "field" for a top-level field's column, "sub" for a sub-field's row. */
  variant: "field" | "sub";
}

/**
 * The options a choice field picks from: a global enum, or its own one per
 * line. Abilities and weapons list their types the same way, with no enum.
 */
export function OptionsPanel({ field, enums, onOptions, onGlobalEnum, variant }: OptionsPanelProps) {
  const isChoice = CHOICE_TYPES.includes(field.type);
  const isField = variant === "field";
  return (
    <div className={isField ? "flex-1" : "w-full mt-1 space-y-3"}>
      {isChoice && (
        <div className={isField ? "mb-3" : undefined}>
          <label className={LABEL_CLASS}>Global Enum Reference (Optional)</label>
          <select
            aria-label="Global Enum Reference (Optional)"
            value={field.globalEnumId ?? ""}
            onChange={(event) => {
              onGlobalEnum(event.target.value);
            }}
            className={isField ? INPUT_CLASS : `block w-full ${SUB_INPUT_CLASS}`}
          >
            <option value="">-- No Global Enum (Use Custom Options) --</option>
            {enums.map((enumId) => (
              <option key={enumId} value={enumId}>
                {enumId}
              </option>
            ))}
          </select>
        </div>
      )}
      {(!isChoice || field.globalEnumId === undefined || field.globalEnumId === "") && <OptionsBox field={field} onOptions={onOptions} variant={variant} />}
    </div>
  );
}
