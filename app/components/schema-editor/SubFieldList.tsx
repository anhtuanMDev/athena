import { NestedGroup } from "./NestedGroup";
import { SubFieldRow } from "./SubFieldRow";

import type { FieldChoices, SchemaFieldsEditor } from "./types";
import type { FieldPath } from "~/lib/schema-fields";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface SubFieldListProps {
  subFields: DynamicField[];
  /** The path of the field that holds them. */
  path: FieldPath;
  editor: SchemaFieldsEditor;
  choices: FieldChoices;
}

/** A field's sub-fields, each an object group of its own at any depth. */
export function SubFieldList({ subFields, path, editor, choices }: SubFieldListProps) {
  return (
    <div className="space-y-3">
      {subFields.map((subField, index) => {
        const at = [...path, index];
        const nested =
          subField.type === "object_array" ? (
            <NestedGroup
              isEmpty={(subField.subFields ?? []).length === 0}
              onAdd={() => {
                editor.addSub(at);
              }}
              list={<SubFieldList subFields={subField.subFields ?? []} path={at} editor={editor} choices={choices} />}
            />
          ) : null;
        // An index key, as before: a sub-field's key changes as it's typed.
        return <SubFieldRow key={index} subField={subField} path={at} editor={editor} choices={choices} nested={nested} />;
      })}
    </div>
  );
}
