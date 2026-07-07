import { z } from "zod";
import { KitItemSchema } from "~/schemas/hero";

export const FieldTypeSchema = z.enum(["string", "number", "boolean", "list", "enum", "abilities", "object_array", "reference", "reference_list"]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export type DynamicField = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required: boolean;
  options?: string[];
  subFields?: DynamicField[];
  referenceApiEndpoint?: string;
  referenceValueKey?: string;
  referenceLabelKey?: string;
};

export const DynamicFieldSchema: z.ZodType<DynamicField> = z.lazy(() => z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, "Keys must be lowercase alphanumeric and underscores"),
  label: z.string().min(1),
  type: FieldTypeSchema,
  unit: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  subFields: z.lazy(() => z.array(DynamicFieldSchema)).optional(),
  referenceApiEndpoint: z.string().optional(),
  referenceValueKey: z.string().optional(),
  referenceLabelKey: z.string().optional(),
}));

export const SchemaCategorySchema = z.enum(["hero", "mode", "patch", "event", "item", "map"]);
export type SchemaCategory = z.infer<typeof SchemaCategorySchema>;

export const DynamicSchemaFileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
  name: z.string().min(1),
  category: SchemaCategorySchema,
  fields: z.array(DynamicFieldSchema),
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

export function getCategoryDirectory(category: SchemaCategory): string {
  const categoryMap: Record<SchemaCategory, string> = {
    hero: "heroes",
    map: "maps",
    mode: "modes",
    patch: "patches",
    item: "items",
    event: "events",
  };
  return categoryMap[category] || `${category}s`;
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
    if (f.type === "abilities") fieldSchema = z.array(KitItemSchema);
    if (f.type === "object_array") fieldSchema = z.array(z.unknown());
    
    if (f.required) {
      if (f.type === "number")
        fieldSchema = z.coerce.number().min(1, "Required");
      else if (f.type === "boolean")
        fieldSchema = z.boolean().refine((val) => val === true, "Required");
      else if (
        f.type === "list" ||
        f.type === "reference_list" ||
        f.type === "object_array"
      )
        fieldSchema = z.array(z.unknown()).min(1, "Required");
      else if (f.type === "abilities")
        fieldSchema = z.array(KitItemSchema).min(1, "Required");
      else fieldSchema = z.string().min(1, "Required");
    } else {
      if (f.type === "boolean") fieldSchema = z.boolean().nullish().catch(undefined);
      else if (
        f.type === "list" ||
        f.type === "reference_list" ||
        f.type === "object_array"
      )
        fieldSchema = z.array(z.unknown()).nullish().catch(undefined);
      else if (f.type === "abilities")
        fieldSchema = z.array(KitItemSchema).nullish().catch(undefined);
      else fieldSchema = fieldSchema.nullish().or(z.literal("")).catch(undefined);
    }
    shape[f.key] = fieldSchema;
  });
  return baseSchema.extend(shape);
}
