import { z } from "zod";

import { RECORD_ID } from "~/lib/contract";

export const ModeSchema = z.object({
  id: z.string().regex(RECORD_ID, "Lowercase letters, digits, dots and dashes, starting and ending with a letter or digit, at most 80"),
  game: z.string().min(1, "Game is required").optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type Mode = z.infer<typeof ModeSchema>;
