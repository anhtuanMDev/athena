import { useCategories } from "~/lib/categories-context";
import { newSchemaExport } from "~/lib/schema-fields";
import { useData } from "~/lib/use-data";

import { NO_SAVED_KEYS } from "./constants";
import { useCreateSchema } from "./hooks/useCreateSchema";
import { useNewSchemaDraft } from "./hooks/useNewSchemaDraft";
import { useSchemaFields } from "./hooks/useSchemaFields";
import { NewSchemaHeader } from "./NewSchemaHeader";
import { NewSchemaIdentity } from "./NewSchemaIdentity";
import { SchemaEditorForm } from "./SchemaEditorForm";
import { loadSchemaChoices } from "./utils/loadSchemaChoices";

interface NewSchemaFormProps {
  game: string;
}

/** New's editor: a name and category, fields from scratch, an AI's answer or another schema's, added as a new file. */
export function NewSchemaForm({ game }: NewSchemaFormProps) {
  const categories = useCategories();
  const { data } = useData(async () => loadSchemaChoices(game), [game], "DynamicSchemaNew-49");
  const schemas = data?.schemas ?? [];
  const draft = useNewSchemaDraft(categories, schemas);
  const editor = useSchemaFields([], NO_SAVED_KEYS);
  const { isSubmitting, commitError, create } = useCreateSchema(game);
  const identity = <NewSchemaIdentity name={draft.name} category={draft.category} categories={categories} onName={draft.setName} onCategory={draft.setCategory} />;
  return (
    <SchemaEditorForm
      editor={editor}
      setup={{
        game,
        header: <NewSchemaHeader game={game} isSubmitting={isSubmitting} />,
        identity,
        commitError,
        isSubmitting,
        category: draft.category,
        name: draft.name,
        schemas,
        enums: data?.enums ?? [],
        exported: () => newSchemaExport({ name: draft.name, category: draft.category, fields: editor.fields }),
        acceptImport: draft.acceptImport,
        onSubmit: () => {
          create({ name: draft.name, category: draft.category, fields: editor.fields });
        },
      }}
    />
  );
}
