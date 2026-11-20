import { AiDataBar } from "~/components/record-form/AiDataBar";
import { SchemaProfileSelect } from "~/components/record-form/SchemaProfileSelect";
import { importedRecord } from "~/lib/record-form";

import type { useHeroForm } from "./hooks/useHeroForm";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface HeroDataToolsProps {
  game: string;
  schemas: DynamicSchemaFile[];
  /** Edit: the hero's id, which an import keeps. */
  currentId?: string;
  form: ReturnType<typeof useHeroForm>;
  onImported: (data: Record<string, unknown>) => void;
}

/** The AI prompt and import, and the schema the hero follows when there are several. */
export function HeroDataTools({ game, schemas, currentId, form, onImported }: HeroDataToolsProps) {
  return (
    <>
      <AiDataBar prompt={form.prompt} formatImported={(json) => importedRecord({ json, fields: form.fields, game, currentId, schemaId: form.schemaId })} schema={form.schema} onImported={onImported} />
      {schemas.length > 1 && <SchemaProfileSelect label="Hero Schema Profile" hint="Changing the schema will update the available fields below." schemas={schemas} value={form.schemaId} onChange={form.switchSchema} />}
    </>
  );
}
