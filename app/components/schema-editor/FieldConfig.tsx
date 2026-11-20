import { CHOICE_TYPES, NOTE_CLASS, REFERENCE_TYPES } from "./constants";
import { OptionsPanel } from "./OptionsPanel";
import { ReferencePanel } from "./ReferencePanel";

import type { FieldChoices, SchemaFieldsEditor } from "./types";
import type { DynamicField } from "~/schemas/dynamic-schema";

/** Types with a list of options to set: choices, and abilities' or weapons' types. */
const OPTION_TYPES: ReadonlySet<DynamicField["type"]> = new Set([...CHOICE_TYPES, "abilities", "weapon"]);

interface FieldConfigProps {
  field: DynamicField;
  index: number;
  editor: SchemaFieldsEditor;
  choices: FieldChoices;
}

/** A top-level field's own settings, by type: its options, its reference, or a note. */
export function FieldConfig({ field, index, editor, choices }: FieldConfigProps) {
  const path = [index];
  if (OPTION_TYPES.has(field.type)) {
    return (
      <OptionsPanel
        field={field}
        enums={choices.enums}
        variant="field"
        onOptions={(lines) => {
          editor.update(path, "options", lines);
        }}
        onGlobalEnum={(enumId) => {
          editor.setGlobalEnum(path, enumId);
        }}
      />
    );
  }
  if (REFERENCE_TYPES.includes(field.type)) {
    return (
      <ReferencePanel
        field={field}
        index={index}
        choices={choices}
        onChange={(setting, value) => {
          editor.update(path, setting, value);
        }}
      />
    );
  }
  if (field.type === "object_array") {
    return <div className={NOTE_CLASS}>{(field.subFields ?? []).length} custom sub-fields configured</div>;
  }
  return <div className={NOTE_CLASS}>No additional configuration needed for this data type.</div>;
}
