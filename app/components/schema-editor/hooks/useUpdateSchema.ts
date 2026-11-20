import { updateFile } from "~/lib/github";
import { cleanOptions, validationMessages } from "~/lib/schema-fields";
import { keepUnknownKeys } from "~/lib/unknown-keys";
import { DynamicSchemaFileSchema, type DynamicField } from "~/schemas/dynamic-schema";

import { useSchemaSave } from "./useSchemaSave";

import type { LoadedSchema, SaveRefusal } from "../types";

/**
 * Checks the edited fields and writes the file at the sha it was loaded at
 * ("Update schema: …"). Keys the editor doesn't know stay as they are, a
 * legacy cron_job schema's cronConfig among them.
 */
async function updateSchema(game: string, loaded: LoadedSchema, fields: DynamicField[]): Promise<string | SaveRefusal> {
  const parsed = DynamicSchemaFileSchema.safeParse({ ...loaded.schema, fields: cleanOptions(fields) });
  if (!parsed.success) {
    const { detail, first } = validationMessages(parsed.error.issues);
    return { detail, toast: first };
  }
  const content = keepUnknownKeys(loaded.schema, parsed.data, DynamicSchemaFileSchema);
  await updateFile(`data/${game}/schemas/${loaded.id}.json`, content, loaded.sha, `Update schema: ${loaded.id}`);
  return `Schema ${loaded.schema.name} updated successfully!`;
}

/** Edit's save: the schema's file updated in one commit, or a conflict to reload. */
export function useUpdateSchema(game: string, loaded: LoadedSchema) {
  const save = useSchemaSave(game);
  return {
    isSubmitting: save.isSubmitting,
    commitError: save.commitError,
    update: (fields: DynamicField[]) => {
      void save.run(async () => updateSchema(game, loaded, fields));
    },
  };
}
