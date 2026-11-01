import type { ImageEntry } from "~/components/MultiImageUploadField";

// The editors keep an ability's icons by a key that stays the same while the
// ability is edited: its _clientId (AbilitiesField gives one to new
// abilities, the hero editor to the kit it loads), else its id, else its
// index. The schema the forms check with drops _clientId, so the save reads
// the key from the form's own values.

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** The key of the `i`th ability of a list, from the form's values for it. */
export function abilityKey(ability: unknown, i: number): string {
  const values = isObject(ability) ? ability : {};
  return String(values._clientId || values.id || i);
}

/**
 * `hero` for the editor's form: a copy whose kit items carry their key as
 * _clientId, so renaming one's id keeps its icons. The hero itself stays as
 * loaded: the review compares the save with it.
 */
export function withKitKeys(hero: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(hero.kit)) return { ...hero };
  return { ...hero, kit: hero.kit.map((item, i) => (isObject(item) ? { ...item, _clientId: abilityKey(item, i) } : item)) };
}

/** The icons of a hero's kit items, by their key. */
export function kitIcons(kit: unknown): Record<string, ImageEntry[]> {
  const icons: Record<string, ImageEntry[]> = {};
  if (!Array.isArray(kit)) return icons;
  kit.forEach((ability: unknown, i: number) => {
    if (isObject(ability) && isObject(ability.icon)) {
      icons[abilityKey(ability, i)] = Object.entries(ability.icon).map(([key, url]) => ({
        id: Math.random().toString(36).substring(7),
        key,
        previewUrl: url as string,
      }));
    }
  });
  return icons;
}
