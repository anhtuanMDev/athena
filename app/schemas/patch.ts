import { z } from "zod";

export const ChangeSchema = z.object({
  hero: z.string().min(1),
  field: z.string().min(1),
  from: z.any().optional(),
  to: z.any().optional(),
  note: z.string().optional(),
});

export const PatchSchema = z.object({
  patch: z.string().min(1).regex(/^(?!.*\.\.)[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/, "Must be a valid patch ID (e.g. 2026.07)"),
  date: z.string().min(1),
  summary: z.string().optional(),
  changes: z.array(ChangeSchema).min(1, "At least one change required"),
}).strict();

export type Patch = z.infer<typeof PatchSchema>;
