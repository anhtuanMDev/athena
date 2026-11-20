import { ENTRY_LIST_TYPES } from "./constants";
import { FieldActions } from "./FieldActions";
import { FieldConfig } from "./FieldConfig";
import { FieldIdentity } from "./FieldIdentity";
import { FieldTypeSelect } from "./FieldTypeSelect";
import { SubFieldsPanel } from "./SubFieldsPanel";
import { UnitControls } from "./UnitControls";

import type { FieldChoices, SchemaFieldsEditor } from "./types";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface FieldCardProps {
  field: DynamicField;
  index: number;
  editor: SchemaFieldsEditor;
  choices: FieldChoices;
}

/** One top-level field: its label and key, type and unit, own settings, Req and delete; its sub-fields below. */
export function FieldCard({ field, index, editor, choices }: FieldCardProps) {
  const path = [index];
  const hasEntries = ENTRY_LIST_TYPES.includes(field.type);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-6 bg-surface rounded-2xl border border-border shadow-sm relative group hover:border-blue-400/40 hover:shadow-md transition-colors">
      <FieldIdentity field={field} onChange={(setting, value) => { editor.update(path, setting, value); }} />
      <div className="lg:col-span-3 space-y-4">
        <FieldTypeSelect type={field.type} onChange={(type) => { editor.update(path, "type", type); }} />
        {!hasEntries && (
          <UnitControls field={field} variant="field" onUnit={(unit) => { editor.update(path, "unit", unit); }} onSuffix={(checked) => { editor.setSuffix(path, checked); }} />
        )}
      </div>
      <div className="lg:col-span-4 h-full flex flex-col">
        <FieldConfig field={field} index={index} editor={editor} choices={choices} />
      </div>
      <FieldActions isRequired={field.required} onRequired={(isRequired) => { editor.update(path, "required", isRequired); }} onRemove={() => { editor.remove(path); }} />
      {hasEntries && <SubFieldsPanel field={field} index={index} editor={editor} choices={choices} />}
    </div>
  );
}
