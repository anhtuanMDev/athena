import { z } from "zod";

export const EnumOptionSchema = z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

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
