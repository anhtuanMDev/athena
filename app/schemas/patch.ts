import { z } from "zod";

export const ChangeSchema = z.object({
  hero: z.string().min(1),
  field: z.string().min(1),
  from: z.any().optional(),
  to: z.any().optional(),
  note: z.string().optional(),
});

export const PatchSchema = z.object({
  patch: z.string().min(1),
  date: z.string().min(1),
  summary: z.string().optional(),
  changes: z.array(ChangeSchema).min(1, "At least one change required"),
});

export type Patch = z.infer<typeof PatchSchema>;
