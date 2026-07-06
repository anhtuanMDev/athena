import { z } from "zod";

export const FieldTypeSchema = z.enum(["string", "number", "boolean", "list", "enum", "abilities", "object_array"]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export type DynamicField = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required: boolean;
  options?: string[];
  subFields?: DynamicField[];
};

export const DynamicFieldSchema: z.ZodType<DynamicField> = z.lazy(() => z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, "Keys must be lowercase alphanumeric and underscores"),
  label: z.string().min(1),
  type: FieldTypeSchema,
  unit: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  subFields: z.lazy(() => z.array(DynamicFieldSchema)).optional(),
}));

export const SchemaCategorySchema = z.enum(["hero", "mode", "patch", "event", "item", "map"]);
export type SchemaCategory = z.infer<typeof SchemaCategorySchema>;

export const DynamicSchemaFileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
  name: z.string().min(1),
  category: SchemaCategorySchema,
  fields: z.array(DynamicFieldSchema),
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
