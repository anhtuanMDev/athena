import { inputClass } from "~/components/ui/input-classes";
import { filterFields } from "~/lib/screen-fields";

import type { PropField } from "../types";
import type { FieldOption } from "~/lib/screen-model";

interface FieldKeyInputProps {
  prop: PropField;
  /** The fields the chips can filter by. */
  fields: FieldOption[];
}

/** The field whose values become a filter's chips. */
export function FieldKeyInput({ prop, fields }: FieldKeyInputProps) {
  const current = typeof prop.value === "string" ? prop.value : "";
  const choices = filterFields(fields);
  return (
    <select id={prop.ids.input} value={current} aria-describedby={prop.ids.describedBy} aria-invalid={prop.error ? true : undefined} onChange={(e) => prop.onChange(e.target.value || undefined)} className={inputClass}>
      <option value="">Choose a field…</option>
      {current && !choices.some((field) => field.key === current) && <option value={current}>{current} (not an option field)</option>}
      {choices.map((field) => (
        <option key={field.key} value={field.key}>{field.label ?? field.key}</option>
      ))}
    </select>
  );
}
