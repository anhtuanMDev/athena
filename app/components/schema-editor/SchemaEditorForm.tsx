import { useState } from "react";

import { useToast } from "~/components/ToastProvider";
import { referenceEndpoints } from "~/lib/categories";
import { useCategories } from "~/lib/categories-context";
import { schemaAiPrompt } from "~/lib/schema-prompt";

import { ClearFieldsModal } from "./ClearFieldsModal";
import { FieldsSection } from "./FieldsSection";
import { useApiKeys } from "./hooks/useApiKeys";
import { useJsonImport } from "./hooks/useJsonImport";
import { ImportSchemaModal } from "./ImportSchemaModal";
import { PromptModal } from "./PromptModal";
import { SchemaToolbar } from "./SchemaToolbar";

import type { SchemaFieldsEditor, SchemaPageSetup } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface SchemaEditorFormProps {
  editor: SchemaFieldsEditor;
  setup: SchemaPageSetup;
}

/** The schema editor's page, shared by New and Edit: `setup` says what differs. */
export function SchemaEditorForm({ editor, setup }: SchemaEditorFormProps) {
  const categories = useCategories();
  const referenceOptions = referenceEndpoints(categories);
  const { success: toastSuccess } = useToast();
  const apiKeys = useApiKeys(setup.game);
  const jsonImport = useJsonImport(editor, setup.acceptImport);
  const [dialog, setDialog] = useState<"prompt" | "import" | "clear" | null>(null);
  const close = () => {
    setDialog(null);
  };
  const importSchema = (schema: DynamicSchemaFile) => {
    // A listed schema is the file as it is: one without fields has none to give.
    if (!Array.isArray(schema.fields)) {
      return;
    }
    editor.merge(structuredClone(schema.fields));
    toastSuccess(`Imported ${String(schema.fields.length)} fields from ${schema.name}`);
  };
  const prompt = schemaAiPrompt({ category: setup.category || "entity", name: setup.name, categories, referenceOptions });
  return (
    <div className="w-full py-8 pb-32">
      <form onSubmit={(event) => { event.preventDefault(); setup.onSubmit(); }} className="space-y-8">
        {setup.header}
        <SchemaToolbar onPrompt={() => { setDialog("prompt"); }} onImport={() => { setDialog("import"); }} onClear={() => { setDialog("clear"); }} canClear={editor.fields.length >= 2} exported={setup.exported} />
        {setup.commitError !== null && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">{setup.commitError}</div>
        )}
        {setup.identity}
        <FieldsSection
          editor={editor}
          choices={{ enums: setup.enums, referenceOptions, apiKeys }}
          schemas={setup.schemas}
          importable={setup.schemas.filter((schema) => schema.category === setup.category && schema.id !== setup.currentId)}
          onImportSchema={importSchema}
          isSubmitting={setup.isSubmitting}
        />
      </form>
      {dialog === "clear" && <ClearFieldsModal count={editor.fields.length} onCancel={close} onClear={() => { editor.clear(); close(); }} />}
      {dialog === "prompt" && <PromptModal prompt={prompt} onClose={close} />}
      {dialog === "import" && <ImportSchemaModal onClose={close} onFile={jsonImport.fromFile} onPaste={jsonImport.fromPaste} />}
    </div>
  );
}
