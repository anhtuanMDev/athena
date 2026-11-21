import { fieldsForProp, type FieldOption, type PropSpec } from "~/lib/screen-model";

interface FieldOptionsProps {
  fields: FieldOption[];
  spec: PropSpec;
  scope: "data" | "item";
}

/** The fields a prop can read, those of its type first; any field when none has it. */
export function FieldOptions({ fields, spec, scope }: FieldOptionsProps) {
  const matching = fieldsForProp(fields, spec);
  const list = matching.length > 0 ? matching : fields;
  return (
    <>
      {list.map((field) => (
        <option key={`${scope}:${field.key}`} value={`${scope}:${field.key}`}>
          {field.label && field.label !== field.key ? `${field.label} (${field.key})` : field.key} · {field.type}
        </option>
      ))}
    </>
  );
}
