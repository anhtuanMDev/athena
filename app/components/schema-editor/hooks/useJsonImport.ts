import { useToast } from "~/components/ToastProvider";
import { importedSchema } from "~/lib/schema-fields";

import type { ImportedSchema, SchemaFieldsEditor } from "../types";

/** Where an imported schema came from, which its messages say. */
type Source = "file" | "paste";

const INVALID: Record<Source, string> = { file: "Invalid JSON file", paste: "Invalid JSON structure" };
const IMPORTED: Record<Source, string> = { file: "Imported schema fields from file!", paste: "Imported schema fields from pasted text!" };

/**
 * "Import AI Schema": a schema's fields from a JSON file or pasted text,
 * merged into the editor's (schema-fields.ts mergeFields). `acceptImport`
 * first takes what else the mode uses (New: its name and category) or
 * refuses the schema.
 */
export function useJsonImport(editor: SchemaFieldsEditor, acceptImport: (imported: ImportedSchema) => boolean) {
  const { success: toastSuccess, error: toastError } = useToast();

  const importText = (text: string, source: Source): boolean => {
    const imported = importedSchema(text);
    if (imported === null) {
      toastError(INVALID[source]);
      return false;
    }
    if (!acceptImport(imported)) {
      return false;
    }
    if (imported.fields) {
      editor.merge(imported.fields);
      toastSuccess(IMPORTED[source]);
      return true;
    }
    if (source === "paste") {
      toastError("No 'fields' array found in JSON");
    }
    return false;
  };

  return {
    fromFile: async (file: File) => {
      try {
        importText(await file.text(), "file");
      } catch (error) {
        toastError(error instanceof Error ? `${INVALID.file}: ${error.message}` : INVALID.file);
      }
    },
    fromPaste: (text: string) => importText(text, "paste"),
  };
}
