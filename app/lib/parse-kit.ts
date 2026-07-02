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

    const modeOverridesRaw = formData.get(`_kit_${i}_mode_overrides`) as string || "";
    let mode_overrides: Record<string, Record<string, unknown>> | undefined;
    if (modeOverridesRaw) {
      try { mode_overrides = JSON.parse(modeOverridesRaw); } catch { mode_overrides = undefined; }
    }

    kit.push({
      id: formData.get(`kit_${i}_id`) as string,
      name: formData.get(`kit_${i}_name`) as string,
      type: formData.get(`kit_${i}_type`) as string,
      description: (formData.get(`kit_${i}_description`) as string) || undefined,
      params: paramsEntries,
      ...(mode_overrides && Object.keys(mode_overrides).length > 0 ? { mode_overrides } : {}),
    });
  }

  return kit;
}

export function buildHeroFromFormData(formData: FormData, game: string, id: string): Record<string, unknown> {
  const get = (name: string) => formData.get(name) as string | null;

  const tagsRaw = get("tags") ?? "";
  const tags = tagsRaw ? tagsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined;

  const rolesRaw = get("roles") ?? "";
  const roles = rolesRaw.split(",").map((s: string) => s.trim()).filter(Boolean);

  const healthRaw = get("health");
  let health: Record<string, number> | undefined;
  if (healthRaw) {
    try { health = JSON.parse(healthRaw); } catch { health = { health: parseInt(healthRaw) }; }
  }

  const kit = parseKitFromFormData(formData);

  return {
    id,
    game,
    name: get("name") ?? "",
    roles,
    difficulty: get("difficulty") ? parseInt(get("difficulty") as string) : undefined,
    health,
    portrait: get("portrait") ?? "",
    bio: get("bio") || undefined,
    tags,
    kit,
  };
}


