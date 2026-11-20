import { useState } from "react";

import {
  addField,
  addSubFieldAt,
  mergeFields,
  removeFieldAt,
  setCustomSuffixAt,
  setGlobalEnumAt,
  updateFieldAt,
} from "~/lib/schema-fields";

import type { SchemaFieldsEditor } from "../types";
import type { DynamicField } from "~/schemas/dynamic-schema";

/**
 * A schema's fields as the editor changes them, from `initial`. A key in
 * `savedKeys` (the saved schema's) never follows its label (schema-fields.ts).
 */
export function useSchemaFields(initial: DynamicField[], savedKeys: ReadonlySet<string>): SchemaFieldsEditor {
  const [fields, setFields] = useState(initial);
  return {
    fields,
    update: (path, setting, value) => {
      setFields((current) => updateFieldAt(current, path, { setting, value, savedKeys }));
    },
    add: () => {
      setFields(addField);
    },
    addSub: (path) => {
      setFields((current) => addSubFieldAt(current, path));
    },
    remove: (path) => {
      setFields((current) => removeFieldAt(current, path));
    },
    setSuffix: (path, checked) => {
      setFields((current) => setCustomSuffixAt(current, path, checked));
    },
    setGlobalEnum: (path, enumId) => {
      setFields((current) => setGlobalEnumAt(current, path, enumId));
    },
    merge: (incoming) => {
      setFields((current) => mergeFields(current, incoming));
    },
    clear: () => {
      setFields([]);
    },
  };
}
