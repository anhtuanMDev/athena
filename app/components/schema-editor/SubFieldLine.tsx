import { Trash2 } from "lucide-react";

import { REMOVE_CLASS, SUB_FIELD_TYPES, SUB_INPUT_CLASS, SUB_UNIT_TYPES } from "./constants";
import { UnitControls } from "./UnitControls";

import type { SchemaFieldsEditor } from "./types";
import type { FieldPath } from "~/lib/schema-fields";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface SubFieldLineProps {
  subField: DynamicField;
  path: FieldPath;
  editor: SchemaFieldsEditor;
}

/** A sub-field's label, key and type, its unit when it takes one, and its remove button. */
export function SubFieldLine({ subField, path, editor }: SubFieldLineProps) {
  const text = (setting: "label" | "key") => (event: { target: { value: string } }) => {
    editor.update(path, setting, event.target.value);
  };
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-center w-full">
      <input aria-label="Label" className={`w-full sm:w-1/3 ${SUB_INPUT_CLASS}`} placeholder="Label" value={subField.label} onChange={text("label")} />
      <input aria-label="Key" className={`w-full sm:w-1/3 font-mono ${SUB_INPUT_CLASS}`} placeholder="key_internal" value={subField.key} onChange={text("key")} />
      <select aria-label="Type" className={`w-full sm:w-1/4 ${SUB_INPUT_CLASS}`} value={subField.type} onChange={(event) => { editor.update(path, "type", event.target.value); }}>
        {SUB_FIELD_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {SUB_UNIT_TYPES.includes(subField.type) && (
        <UnitControls field={subField} variant="sub" onUnit={(unit) => { editor.update(path, "unit", unit); }} onSuffix={(checked) => { editor.setSuffix(path, checked); }} />
      )}
      <button type="button" onClick={() => { editor.remove(path); }} className={`${REMOVE_CLASS} p-2 ml-auto shrink-0`} title="Remove sub-field">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
