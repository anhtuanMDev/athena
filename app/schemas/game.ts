import { z } from "zod";

export const GameSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be a URL-safe slug"),
  name: z.string().min(1, "Name is required"),
  developer: z.string().optional(),
  active: z.boolean(),
  icon: z.string().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color").optional().or(z.literal("")),
  secondaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color").optional().or(z.literal("")),
  accentColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color").optional().or(z.literal("")),
  textColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color").optional().or(z.literal("")),
  backgroundColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color").optional().or(z.literal("")),
});

export type Game = z.infer<typeof GameSchema>;

export const GamesFileSchema = z.object({
  games: z.array(GameSchema),
});
