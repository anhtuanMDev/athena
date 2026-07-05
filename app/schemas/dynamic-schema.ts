import { z } from "zod";

export const FieldTypeSchema = z.enum(["string", "number", "boolean", "list", "enum"]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const DynamicFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, "Keys must be lowercase alphanumeric and underscores"),
  label: z.string().min(1),
  type: FieldTypeSchema,
  unit: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(), // For predefined options
});

export type DynamicField = z.infer<typeof DynamicFieldSchema>;

export const SchemaCategorySchema = z.enum(["hero", "mode", "patch", "event", "item"]);
export type SchemaCategory = z.infer<typeof SchemaCategorySchema>;

export const DynamicSchemaFileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
  name: z.string().min(1),
  category: SchemaCategorySchema,
  api_endpoint: z.string().url("Must be a valid URL").optional(),
  fields: z.array(DynamicFieldSchema),
});

export type DynamicSchemaFile = z.infer<typeof DynamicSchemaFileSchema>;
