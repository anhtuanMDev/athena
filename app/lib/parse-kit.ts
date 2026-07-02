import type { Hero } from "~/schemas/hero";

export function parseKitFromFormData(formData: FormData): Hero["kit"] {
  const kit: Hero["kit"] = [];
  const kitCount = parseInt(formData.get("_kitCount") as string || "0");

  for (let i = 0; i < kitCount; i++) {
    const paramsEntries: Record<string, unknown> = {};
    const paramKeys = (formData.get(`_kit_${i}_params_keys`) as string || "")
      .split(",")
      .filter(Boolean);

    for (const key of paramKeys) {
      paramsEntries[key] = formData.get(`kit_${i}_params_${key}`) ?? "";
    }

    kit.push({
      id: formData.get(`kit_${i}_id`) as string,
      name: formData.get(`kit_${i}_name`) as string,
      type: formData.get(`kit_${i}_type`) as string,
      description: (formData.get(`kit_${i}_description`) as string) || undefined,
      params: paramsEntries,
    });
  }

  return kit;
}

export function buildHeroFromFormData(formData: FormData, game: string, id: string): Record<string, unknown> {
  const get = (name: string) => formData.get(name) as string | null;

  return {
    id,
    game,
    name: get("name") ?? "",
    roles: (get("roles") ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    difficulty: get("difficulty") ? parseInt(get("difficulty") as string) : undefined,
    health: get("health") ? { health: parseInt(get("health") as string) } : undefined,
    portrait: get("portrait") ?? "",
    bio: get("bio") || undefined,
    tags: (get("tags") ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    kit: parseKitFromFormData(formData),
  };
}
