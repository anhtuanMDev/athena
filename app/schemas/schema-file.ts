import { z } from "zod";

const statFieldType = z.enum(["number", "text", "boolean", "list"]);

const StatFieldSchema = z.object({
  label: z.string().min(1),
  unit: z.string(),
  type: statFieldType,
});

export const SchemaFileSchema = z.object({
  roles: z.array(z.string().min(1)),
  ability_types: z.array(z.string().min(1)),
  stat_fields: z.record(z.string(), StatFieldSchema),
});

export type SchemaFile = z.infer<typeof SchemaFileSchema>;
