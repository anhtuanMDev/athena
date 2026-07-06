import { z } from "zod";

export const AbilityEffectSchema = z.object({
  ability_id: z.string().min(1),
  override_name: z.string().optional(),
  override_type: z.string().optional(),
  override_description: z.string().optional(),
  params_override: z.record(z.string(), z.any()).optional(),
});

export const ItemSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be kebab-case"),
  game: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  hero: z.string().optional(),
  mode: z.string().optional(),
  effects: z.array(AbilityEffectSchema).min(1),
}).strict();

export type Item = z.infer<typeof ItemSchema>;
