import { z } from "zod";

export const ModeSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  rules: z.record(z.string(), z.any()).optional(),
}).strict();

export type Mode = z.infer<typeof ModeSchema>;
