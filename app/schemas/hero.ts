import { z } from "zod";

import { pictureAdvice, refusedPicture } from "~/lib/app-pictures";
import { RECORD_ID } from "~/lib/contract";

export const KitItemSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  description: z.string().optional(),
  icon: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  params: z.record(z.string(), z.unknown()),
  mode_overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export const HealthSchema = z.record(z.string(), z.number()).optional();

export const HeroSchema = z.object({
  id: z.string().regex(RECORD_ID, "Lowercase letters, digits, dots and dashes, starting and ending with a letter or digit, at most 80"),
  schema_id: z.string().optional(),
  game: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  real_name: z.string().optional(),
  roles: z.array(z.string()).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  health: HealthSchema,
  movement_speed: z.number().optional(),
  // A typed URL must be a picture the app loads (screen-policy.ts appPicture).
  portrait: z
    .union([z.string(), z.record(z.string(), z.string())])
    .refine((value) => refusedPicture(value) === undefined, `The app won't load this picture: ${pictureAdvice()}.`)
    .optional(),
  bio: z.string().optional(),
  released: z.string().optional(),
  last_updated_patch: z.string().optional(),
  tags: z.array(z.string()).optional(),
  kit: z.array(KitItemSchema).optional(),
});

export type Hero = z.infer<typeof HeroSchema>;
