import { useState } from "react";

import { savedKeysOf, savedSchemaExport } from "~/lib/schema-fields";

import { EditSchemaHeader } from "./EditSchemaHeader";
import { useSchemaFields } from "./hooks/useSchemaFields";
import { useUpdateSchema } from "./hooks/useUpdateSchema";
import { SchemaEditorForm } from "./SchemaEditorForm";

import type { LoadedSchema } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface EditSchemaFormProps {
  game: string;
  loaded: LoadedSchema;
  /** The game's schemas, and its global enums' ids. */
  schemas: DynamicSchemaFile[];
  enums: string[];
}

/** Edit's editor: the loaded schema's fields, saved over its file. Its saved keys never follow their labels. */
export function EditSchemaForm({ game, loaded, schemas, enums }: EditSchemaFormProps) {
  const { schema } = loaded;
  const initial = Array.isArray(schema.fields) ? schema.fields : [];
  const [savedKeys] = useState(() => savedKeysOf(initial));
  const editor = useSchemaFields(initial, savedKeys);
  const { isSubmitting, commitError, update } = useUpdateSchema(game, loaded);
  const header = <EditSchemaHeader game={game} id={loaded.id} schema={schema} isSubmitting={isSubmitting} hasFields={editor.fields.length > 0} />;
  return (
    <SchemaEditorForm
      editor={editor}
      setup={{
        game,
        header,
        commitError,
        isSubmitting,
        category: schema.category,
        name: schema.name,
        currentId: schema.id,
        schemas,
        enums,
        exported: () => savedSchemaExport(schema, editor.fields),
        acceptImport: () => true,
        onSubmit: () => {
          update(editor.fields);
        },
      }}
    />
  );
}
