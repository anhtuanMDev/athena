import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color")
  .optional()
  .or(z.literal(""));

export const GameSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be a URL-safe slug"),
  name: z.string().min(1, "Name is required"),
  developer: z.string().optional(),
  active: z.boolean(),
  icon: z.string().optional().or(z.literal("")),
  // Color scheme
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  background: hexColor,
  surface: hexColor,
  surfaceVariant: hexColor,
  onPrimary: hexColor,
  onSecondary: hexColor,
  onBackground: hexColor,
  onSurface: hexColor,
  error: hexColor,
  warning: hexColor,
  success: hexColor,
  border: hexColor,
});

export type Game = z.infer<typeof GameSchema>;

export const GamesFileSchema = z.object({
  games: z.array(GameSchema),
});
