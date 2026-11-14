import { z } from "zod";

import { RECORD_ID } from "~/lib/contract";

export const MapSchema = z.object({
  id: z.string().regex(RECORD_ID, "Lowercase letters, digits, dots and dashes, starting and ending with a letter or digit, at most 80"),
  name: z.string().min(1, "Name is required"),
  game: z.string().min(1),
  game_modes: z.array(z.string()).optional(),
  image: z.string().url().optional().or(z.literal("")),
  location: z.string().optional(),
}).strict();

export type Map = z.infer<typeof MapSchema>;
