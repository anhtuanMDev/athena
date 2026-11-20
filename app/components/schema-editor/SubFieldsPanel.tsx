import { Plus } from "lucide-react";

import { AbilitiesTemplate } from "./AbilitiesTemplate";
import { ADD_SUB_FIELD_CLASS } from "./constants";
import { SubFieldList } from "./SubFieldList";

import type { FieldChoices, SchemaFieldsEditor } from "./types";
import type { DynamicField } from "~/schemas/dynamic-schema";

/** How the panel names a field's sub-fields: an ability's or weapon's params, or each object's fields. */
const HEADINGS: Partial<Record<DynamicField["type"], { title: string; hint: string }>> = {
  abilities: { title: "Custom Params Sub-Fields", hint: "Configure explicit parameters appended to each ability (e.g., Cooldown, Damage)" },
  weapon: { title: "Custom Params Sub-Fields", hint: "Configure explicit parameters appended to each weapon (e.g., Ammo, Reload Time)" },
};
const GROUP_HEADING = { title: "Nested Group Sub-Fields", hint: "Define the explicit fields that each object in this list will contain." };

interface SubFieldsPanelProps {
  field: DynamicField;
  index: number;
  editor: SchemaFieldsEditor;
  choices: FieldChoices;
}

/** The sub-fields of a top-level abilities, weapon or object group field, below its card. */
export function SubFieldsPanel({ field, index, editor, choices }: SubFieldsPanelProps) {
  const heading = HEADINGS[field.type] ?? GROUP_HEADING;
  const subFields = field.subFields ?? [];
  const isParams = field.type !== "object_array";
  return (
    <div className="col-span-1 lg:col-span-12 border-t border-border pt-6 mt-2">
      <div className="flex flex-col p-5 border border-border rounded-xl bg-gray-50/50 dark:bg-gray-800/20 text-left">
        {field.type === "abilities" && <AbilitiesTemplate />}
        <div className={isParams ? "ml-0 md:ml-4 bg-surface-raised p-5 rounded-xl border border-border" : "bg-white dark:bg-gray-900/60 p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm"}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <div>
              <span className="block font-bold text-sm text-ink">{heading.title}</span>
              <span className="text-xs text-ink-muted">{heading.hint}</span>
            </div>
            <button type="button" onClick={() => { editor.addSub([index]); }} className={`${ADD_SUB_FIELD_CLASS} px-4 py-2 text-sm`}>
              <Plus className="w-4 h-4" /> Add Sub-Field
            </button>
          </div>
          {subFields.length > 0 ? (
            <SubFieldList subFields={subFields} path={[index]} editor={editor} choices={choices} />
          ) : (
            <div className="py-8 text-center border-2 border-dashed border-border rounded-xl bg-gray-50/30 dark:bg-gray-800/10">
              <p className="text-sm font-medium text-ink-muted opacity-80">No custom sub-fields defined.</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 opacity-70">Params will default to a generic JSON object.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
