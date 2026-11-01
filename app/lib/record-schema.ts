import { z } from "zod";
import { buildDynamicZodSchema, type DynamicField, type DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { HeroSchema } from "~/schemas/hero";
import { MapSchema } from "~/schemas/map";
import { ModeSchema } from "~/schemas/mode";

// What a record of each category must look like, as its editor checks it.
// The editors and the raw JSON editor share these, so a file the raw editor
// accepts is one its category's form would save, and the other way round.

export const RECORD_ID = /^(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/;

/** Every record may name the schema it follows (the editors' schema picker, imports). */
const SCHEMA_ID = { schema_id: z.string().optional() };

/** The schema a record follows: its schema_id, else the category's first, as the editors and the app pick it. */
export function schemaOf(schemas: DynamicSchemaFile[], schemaId: unknown): DynamicSchemaFile | undefined {
  return schemas.find((s) => s.id === schemaId) ?? schemas[0];
}

export const heroRecordSchema = (fields: DynamicField[]) =>
  buildDynamicZodSchema(fields, HeroSchema, ["id", "name", "real_name", "portrait"]);

export const modeRecordSchema = (fields: DynamicField[]) =>
  buildDynamicZodSchema(fields, ModeSchema.extend(SCHEMA_ID), ["id", "name", "description"]);

/** Maps are checked against every map schema's fields at once. */
export const mapRecordSchema = (fields: DynamicField[]) =>
  buildDynamicZodSchema(fields, MapSchema.extend(SCHEMA_ID), ["name", "id", "game_modes"]).strict();

/** A record of a category without a form of its own (news, patches, items): its id, schema and that schema's fields. */
export const recordFormSchema = (fields: DynamicField[]) =>
  buildDynamicZodSchema(
    fields,
    z.object({ id: z.string().regex(RECORD_ID, "Lowercase letters, digits, dots and dashes"), ...SCHEMA_ID }),
    ["id"],
  ).strict();

/** How a record in data/{game}/{folder} is checked: by the schema its category's editor uses. */
export function recordSchemaFor(folder: string, categorySchemas: DynamicSchemaFile[], record: Record<string, unknown>) {
  const fields = schemaOf(categorySchemas, record.schema_id)?.fields ?? [];
  switch (folder) {
    case "heroes":
      return heroRecordSchema(fields);
    case "modes":
      return modeRecordSchema(fields);
    case "maps":
      return mapRecordSchema(categorySchemas.flatMap((s) => s.fields ?? []));
    default:
      return recordFormSchema(fields);
  }
}
