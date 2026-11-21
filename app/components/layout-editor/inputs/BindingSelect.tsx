import { inputClass } from "~/components/ui/input-classes";

import { bindingChoice, bindingOf, knownChoices } from "../utils/prop-values";

import { FieldOptions } from "./FieldOptions";

import type { PropContext, PropField } from "../types";

interface BindingSelectProps {
  prop: PropField;
  context: PropContext;
}

/** The field a bound prop reads: one of each entry's in list blocks, or one of the screen's data. */
export function BindingSelect({ prop, context }: BindingSelectProps) {
  const { itemFields, dataFields } = context;
  const current = bindingChoice(prop.value);
  const known = knownChoices(itemFields, dataFields);
  return (
    <select
      id={prop.ids.input}
      value={current}
      aria-describedby={prop.ids.describedBy}
      aria-invalid={prop.error ? true : undefined}
      onChange={(e) => prop.onChange(bindingOf(e.target.value))}
      className={inputClass}
    >
      <option value="">Choose a field…</option>
      {current && !known.includes(current) && <option value={current}>{current.replace(":", ".")} (not found)</option>}
      {itemFields !== null && itemFields.length > 0 && (
        <optgroup label="Each entry (item.)">
          <FieldOptions fields={itemFields} spec={prop.spec} scope="item" />
        </optgroup>
      )}
      {dataFields.length > 0 && (
        <optgroup label={itemFields ? "Screen data (data.)" : "Fields (data.)"}>
          <FieldOptions fields={dataFields} spec={prop.spec} scope="data" />
        </optgroup>
      )}
    </select>
  );
}
