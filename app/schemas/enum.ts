import { z } from "zod";

export const EnumParamSchema = z.object({
  id: z.string().min(1, "ID is required").regex(/^[a-z0-9_]+$/, "Must be lowercase alphanumeric and underscores"),
  label: z.string().min(1, "Label is required"),
  value: z.any(),
  suffix: z.string().optional(),
  type: z.enum(["string", "number", "boolean"]),
});

export type EnumParam = z.infer<typeof EnumParamSchema>;

export const EnumOptionSchema = z.lazy(() => z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  params: z.array(EnumParamSchema).optional(),
}));

export const EnumSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  options: z.array(EnumOptionSchema).min(1, "At least one option is required"),
});

export type EnumOption = z.infer<typeof EnumOptionSchema>;
export type GlobalEnum = z.infer<typeof EnumSchema>;
