import { INPUT_CLASS, LABEL_CLASS } from "./constants";

import type { DynamicField } from "~/schemas/dynamic-schema";

interface FieldIdentityProps {
  field: DynamicField;
  onChange: (setting: "label" | "key", value: string) => void;
}

/** A top-level field's display label and its key, the name its value is stored under. */
export function FieldIdentity({ field, onChange }: FieldIdentityProps) {
  return (
    <div className="lg:col-span-4 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Display Label</label>
        <input
          aria-label="Display Label"
          value={field.label}
          onChange={(event) => {
            onChange("label", event.target.value);
          }}
          placeholder="e.g. Max Health"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label className={LABEL_CLASS}>Field Key (Internal)</label>
        <input
          aria-label="Field Key (Internal)"
          value={field.key}
          onChange={(event) => {
            onChange("key", event.target.value);
          }}
          placeholder="e.g. max_health"
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}
