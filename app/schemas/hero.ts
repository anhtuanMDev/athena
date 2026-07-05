import { z } from "zod";

export const KitItemSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  description: z.string().optional(),
  icon: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  params: z.record(z.string(), z.any()),
  mode_overrides: z.record(z.string(), z.record(z.string(), z.any())).optional(),
});

export const HealthSchema = z.record(z.string(), z.number()).optional();

export const HeroSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  game: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  real_name: z.string().optional(),
  roles: z.array(z.string()).min(1, "At least one role required"),
  difficulty: z.number().int().min(1).max(5).optional(),
  health: HealthSchema,
  movement_speed: z.number().optional(),
  portrait: z.union([
    z.string().min(1, "Portrait is required"),
    z.record(z.string(), z.string())
  ]),
  bio: z.string().optional(),
  released: z.string().optional(),
  last_updated_patch: z.string().optional(),
  tags: z.array(z.string()).optional(),
  kit: z.array(KitItemSchema).min(1, "At least one kit ability required"),
}).passthrough();

export type Hero = z.infer<typeof HeroSchema>;
