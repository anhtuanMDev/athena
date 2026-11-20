import { CHOICE_TYPES, REFERENCE_TYPES } from "./constants";
import { OptionsPanel } from "./OptionsPanel";
import { SubFieldLine } from "./SubFieldLine";
import { SubFieldReference } from "./SubFieldReference";

import type { FieldChoices, SchemaFieldsEditor } from "./types";
import type { ReactNode } from "react";
import type { FieldPath } from "~/lib/schema-fields";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface SubFieldRowProps {
  subField: DynamicField;
  path: FieldPath;
  editor: SchemaFieldsEditor;
  choices: FieldChoices;
  /** A nested group's own sub-fields (object_array), below the row. */
  nested: ReactNode;
}

/** One sub-field, with its options, reference or nested group below its line. */
export function SubFieldRow({ subField, path, editor, choices, nested }: SubFieldRowProps) {
  return (
    <div className="flex flex-col gap-3 bg-surface-raised p-3 rounded-lg border border-border shadow-sm transition-colors hover:border-border-strong">
      <SubFieldLine subField={subField} path={path} editor={editor} />
      {CHOICE_TYPES.includes(subField.type) && (
        <OptionsPanel field={subField} enums={choices.enums} variant="sub" onOptions={(lines) => { editor.update(path, "options", lines); }} onGlobalEnum={(enumId) => { editor.setGlobalEnum(path, enumId); }} />
      )}
      {REFERENCE_TYPES.includes(subField.type) && (
        <SubFieldReference subField={subField} referenceOptions={choices.referenceOptions} onChange={(setting, value) => { editor.update(path, setting, value); }} />
      )}
      {nested}
    </div>
  );
}
