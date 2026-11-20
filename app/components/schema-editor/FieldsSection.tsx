import { Plus } from "lucide-react";

import { Button } from "~/components/ui/button";

import { FieldCard } from "./FieldCard";
import { ImportFromSchema } from "./ImportFromSchema";
import { NoFields } from "./NoFields";

import type { FieldChoices, SchemaFieldsEditor } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface FieldsSectionProps {
  editor: SchemaFieldsEditor;
  choices: FieldChoices;
  /** The game's schemas: "Import Schema" shows when there are any. */
  schemas: DynamicSchemaFile[];
  /** The ones "Import Schema" offers. */
  importable: DynamicSchemaFile[];
  onImportSchema: (schema: DynamicSchemaFile) => void;
  isSubmitting: boolean;
}

/** "Fields Configuration": the field cards, importing another schema's, and adding one. */
export function FieldsSection({ editor, choices, schemas, importable, onImportSchema, isSubmitting }: FieldsSectionProps) {
  const { fields } = editor;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-xl font-bold text-ink tracking-tight">Fields Configuration</h2>
        <div className="flex gap-2">
          {schemas.length > 0 && <ImportFromSchema schemas={importable} onImport={onImportSchema} />}
          <Button type="button" onClick={editor.add} size="small" className="bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 dark:text-gray-900 shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add New Field
          </Button>
        </div>
      </div>
      {fields.length === 0 ? (
        <NoFields onAdd={editor.add} />
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            // An index key, as before: a field's key changes as it's typed.
            <FieldCard key={index} field={field} index={index} editor={editor} choices={choices} />
          ))}
        </div>
      )}
      {fields.length > 0 && (
        <div className="flex justify-between items-center pt-4">
          <Button type="button" onClick={editor.add} variant="outline" className="border-dashed border-2 rounded-xl shadow-sm bg-surface px-12">
            <Plus className="w-4 h-4 mr-2" /> Add Another Field
          </Button>
          <Button type="submit" variant="default" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Schema"}
          </Button>
        </div>
      )}
    </div>
  );
}
