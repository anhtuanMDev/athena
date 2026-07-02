import { z } from "zod";

export const MapSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1, "Name is required"),
  game: z.string().min(1),
  game_modes: z.array(z.string()).optional(),
  image: z.string().url().optional().or(z.literal("")),
  location: z.string().optional(),
});

export type Map = z.infer<typeof MapSchema>;
