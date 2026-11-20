import { AiDataBar } from "~/components/record-form/AiDataBar";
import { SchemaProfileSelect } from "~/components/record-form/SchemaProfileSelect";
import { importedRecord } from "~/lib/record-form";

import type { useModeForm } from "./hooks/useModeForm";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface ModeDataToolsProps {
  game: string;
  schemas: DynamicSchemaFile[];
  /** Edit: the mode's id, which an import keeps. */
  currentId?: string;
  form: ReturnType<typeof useModeForm>;
  onImported: (data: Record<string, unknown>) => void;
}

/** The AI prompt and import, and the schema the mode follows when there are several. */
export function ModeDataTools({ game, schemas, currentId, form, onImported }: ModeDataToolsProps) {
  return (
    <>
      <AiDataBar prompt={form.prompt} formatImported={(json) => importedRecord({ json, fields: form.fields, game, currentId, schemaId: form.schemaId })} schema={form.schema} onImported={onImported} />
      {schemas.length > 1 && <SchemaProfileSelect label="Mode Schema Profile" schemas={schemas} value={form.schemaId} onChange={form.switchSchema} />}
    </>
  );
}
