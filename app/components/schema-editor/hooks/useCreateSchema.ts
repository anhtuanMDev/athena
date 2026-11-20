import { createFile, getFile } from "~/lib/github";
import { cleanOptions, newSchemaId, validationMessages } from "~/lib/schema-fields";
import { DynamicSchemaFileSchema, type DynamicField } from "~/schemas/dynamic-schema";

import { useSchemaSave } from "./useSchemaSave";

import type { SaveRefusal } from "../types";

/** A new schema as its page holds it. */
interface SchemaDraft {
  name: string;
  category: string;
  fields: DynamicField[];
}

/** Checks a new schema and adds its file, unless one with its id exists ("Add schema: …"). */
async function createSchema(game: string, draft: SchemaDraft): Promise<string | SaveRefusal> {
  if (draft.name.trim() === "") {
    return { detail: "Schema Name is required." };
  }
  const parsed = DynamicSchemaFileSchema.safeParse({ id: newSchemaId(draft.category, draft.name), name: draft.name.trim(), category: draft.category, fields: cleanOptions(draft.fields) });
  if (!parsed.success) {
    const { detail, first } = validationMessages(parsed.error.issues);
    return { detail, toast: first };
  }
  const path = `data/${game}/schemas/${parsed.data.id}.json`;
  if (await getFile(path)) {
    return { detail: `A schema with ID "${parsed.data.id}" already exists.`, toast: "A schema with this ID already exists." };
  }
  await createFile(path, parsed.data, `Add schema: ${parsed.data.name}`);
  return `Schema ${parsed.data.name} created successfully!`;
}

/** New's save: the schema's file added in one commit. */
export function useCreateSchema(game: string) {
  const save = useSchemaSave(game);
  return {
    isSubmitting: save.isSubmitting,
    commitError: save.commitError,
    create: (draft: SchemaDraft) => {
      void save.run(async () => createSchema(game, draft));
    },
  };
}
