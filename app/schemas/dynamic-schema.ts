import { z } from "zod";
import { KitItemSchema } from "~/schemas/hero";

export const FieldTypeSchema = z.enum(["string", "number", "boolean", "list", "enum", "abilities", "weapon", "object_array", "reference", "reference_list"]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export type DynamicField = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  hasCustomSuffix?: boolean;
  required: boolean;
  options?: string[];
  subFields?: DynamicField[];
  referenceApiEndpoint?: string;
  referenceValueKey?: string;
  referenceLabelKey?: string;
  globalEnumId?: string;
};

export const DynamicFieldSchema: z.ZodType<DynamicField> = z.lazy(() => z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, "Keys must be lowercase alphanumeric and underscores"),
  label: z.string().min(1),
  type: FieldTypeSchema,
  unit: z.string().optional(),
  hasCustomSuffix: z.boolean().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  subFields: z.lazy(() => z.array(DynamicFieldSchema)).optional(),
  referenceApiEndpoint: z.string().optional(),
  referenceValueKey: z.string().optional(),
  referenceLabelKey: z.string().optional(),
  globalEnumId: z.string().optional(),
}));

// Any category name, so schemas of newly configured categories (and legacy
// "event" and "cron_job" ones) still open; which ones the app shows is
// data/_meta/categories.json's business (see app/lib/categories.ts).
export const SchemaCategorySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, digits and _");
export type SchemaCategory = z.infer<typeof SchemaCategorySchema>;

export const CronConfigSchema = z.object({
  apiResponseDefinition: z.string().default(""),
  apiPayloadDefinition: z.string().default(""),
  dataHandling: z.string().default(""),
  finalResultDestination: z.string().default(""),
});

export const DynamicSchemaFileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
  name: z.string().min(1),
  category: SchemaCategorySchema,
  fields: z.array(DynamicFieldSchema).default([]),
  cronConfig: CronConfigSchema.optional(),
}).superRefine((data, ctx) => {
  const keys = new Set();
  for (let i = 0; i < data.fields.length; i++) {
    const key = data.fields[i].key;
    if (keys.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate field key: '${key}'`,
        path: ["fields", i, "key"],
      });
    }
    keys.add(key);
  }
});

export type DynamicSchemaFile = z.infer<typeof DynamicSchemaFileSchema>;

/** The folder of a category that isn't configured: legacy ones such as cron_job. */
export function getCategoryDirectory(category: SchemaCategory): string {
  const categoryMap: Record<string, string> = {
    hero: "heroes",
    map: "maps",
    mode: "modes",
    patch: "patches",
    news: "news",
    item: "items",
    event: "events",
    cron_job: "cron_jobs",
  };
  return categoryMap[category] || `${category}s`;
}

/**
 * A number inside a list entry. Form inputs give text ("8", "" when left
 * empty), and records saved before this check hold numbers as text too;
 * either way the entry is saved with a number, or without the key.
 */
const entryNumber = z.preprocess(
  (value) => (typeof value === "string" ? (value.trim() === "" ? undefined : Number(value)) : value === null ? undefined : value),
  z.number({ message: "Must be a number" }).optional(),
);

/**
 * An optional list of entries. No .catch() here: with entries checked, one bad
 * value would otherwise drop the whole list without a word.
 */
const listOf = (entries: z.ZodArray<z.ZodType>) => z.preprocess((value) => (value === "" || value === null ? undefined : value), entries.optional());

/** An entry of an object list (or an ability's params): its number sub-fields coerced, every other key kept as is. */
function entrySchema(subFields: DynamicField[] = []): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const sf of subFields) {
    if (sf.type === "number") shape[sf.key] = entryNumber;
    else if (sf.type === "object_array") shape[sf.key] = listOf(z.array(entrySchema(sf.subFields)));
  }
  return z.looseObject(shape);
}

export function buildDynamicZodSchema(
  fields: DynamicField[],
  baseSchema: z.ZodObject<any, any>,
  excludeKeys: string[] = []
) {
  let shape: Record<string, z.ZodTypeAny> = {};
  fields.forEach((f) => {
    if (excludeKeys.includes(f.key)) return;
    let fieldSchema: z.ZodTypeAny =
      f.type === "number"
        ? z.coerce.number()
        : f.type === "boolean"
          ? z.boolean()
          : z.string();
    if (f.type === "list" || f.type === "reference_list")
      fieldSchema = z.array(z.string());
    // Entries of list fields keep their numbers as numbers (see entrySchema).
    const entries =
      f.type === "object_array"
        ? z.array(entrySchema(f.subFields))
        : f.type === "abilities" || f.type === "weapon"
          ? z.array(KitItemSchema.extend({ params: entrySchema(f.subFields) }))
          : undefined;
    if (entries) fieldSchema = entries;
    
    if (f.required) {
      if (f.type === "number")
        fieldSchema = z.coerce.number().min(1, "Required");
      else if (f.type === "boolean")
        fieldSchema = z.boolean({ message: "Required" });
      else if (entries) fieldSchema = entries.min(1, "Required");
      else if (f.type === "list" || f.type === "reference_list")
        fieldSchema = z.array(z.unknown()).min(1, "Required");
      else fieldSchema = z.string().min(1, "Required");
    } else {
      if (f.type === "boolean") fieldSchema = z.boolean().nullish().catch(undefined);
      else if (entries) fieldSchema = listOf(entries);
      else if (f.type === "list" || f.type === "reference_list")
        fieldSchema = z.array(z.unknown()).nullish().catch(undefined);
      else fieldSchema = fieldSchema.nullish().or(z.literal("")).catch(undefined);
    }
    shape[f.key] = fieldSchema;

    if (f.hasCustomSuffix) {
      shape[`${f.key}_suffix`] = z.string().optional();
    }
  });
  return baseSchema.extend(shape);
}
