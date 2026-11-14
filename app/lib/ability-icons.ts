import type { ImageEntry } from "~/components/MultiImageUploadField";
import { newPictureExtension } from "./picture-rules";

// Abilities and weapons (fields of type "abilities" and "weapon") are edited as
// lists, and their pictures next to the form, in one map for all the lists:
// keyed by list, then by a key that stays the same while the ability is
// edited. That key is the ability's _clientId: withAbilityKeys gives one to
// each loaded ability, AbilitiesField to each new one, which it also marks
// _isNew (only a new ability's id follows its name). Keyed by id instead, a
// renamed ability lost the picture uploaded for it, and two lists with the
// same id shared one set of pictures and one file. The schemas the forms check
// with drop both markers, so a save reads the key from the form's own values.

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** The keys of the ability lists among `fields`. */
export function abilityLists(fields: { key: string; type: string }[]): string[] {
  return [...new Set(fields.filter((f) => f.type === "abilities" || f.type === "weapon").map((f) => f.key))];
}

/** The key of the `i`th ability of the list `list`, from the form's values for it. */
export function abilityKey(list: string, ability: unknown, i: number): string {
  const values = isObject(ability) ? ability : {};
  return `${list}:${String(values._clientId || values.id || i)}`;
}

/**
 * `record` for an editor's form: a copy whose abilities, in the lists `lists`,
 * each carry a key of their own as _clientId. The record itself stays as
 * loaded: saves are compared with it.
 */
export function withAbilityKeys(record: Record<string, unknown>, lists: string[]): Record<string, unknown> {
  const copy = { ...record };
  for (const list of lists) {
    const items = record[list];
    if (Array.isArray(items)) copy[list] = items.map((item, i) => (isObject(item) ? { ...item, _clientId: `stored-${i}` } : item));
  }
  return copy;
}

/** An icon as stored, a URL or URLs by key, as the entries its upload field shows. */
export function iconEntries(icon: unknown): ImageEntry[] {
  const urls = iconUrls(icon);
  return Object.entries(urls).map(([key, url]) => ({ id: Math.random().toString(36).slice(2, 9), key, previewUrl: url }));
}

/** The pictures of the abilities of the lists `lists` of a form's values, by abilityKey. */
export function abilityIcons(values: Record<string, unknown>, lists: string[]): Record<string, ImageEntry[]> {
  const icons: Record<string, ImageEntry[]> = {};
  for (const list of lists) {
    const items = values[list];
    if (!Array.isArray(items)) continue;
    items.forEach((item, i) => {
      if (isObject(item) && item.icon !== undefined) icons[abilityKey(list, item, i)] = iconEntries(item.icon);
    });
  }
  return icons;
}

/**
 * Whether a set of pictures differs from how it was loaded (`loaded`): a new
 * picture, one removed, or one under another key. Entries without a picture
 * don't count, as iconForSave leaves them out. The pictures live outside the
 * form, so an editor counts this as an edit too: a save may change pictures alone.
 */
export function picturesChanged(entries: ImageEntry[], loaded: ImageEntry[]): boolean {
  const shown = (list: ImageEntry[]) => list.filter((e) => e.base64 || e.previewUrl);
  if (shown(entries).some((e) => e.base64)) return true;
  const signature = (list: ImageEntry[]) => shown(list).map((e) => `${e.key}\n${e.previewUrl}`).sort().join("\n\n");
  return signature(entries) !== signature(loaded);
}

/** picturesChanged for every ability of an editor (abilityIcons), by abilityKey. */
export function abilityPicturesChanged(icons: Record<string, ImageEntry[]>, loaded: Record<string, ImageEntry[]>): boolean {
  return [...new Set([...Object.keys(icons), ...Object.keys(loaded)])].some((key) => picturesChanged(icons[key] ?? [], loaded[key] ?? []));
}

/** A stored icon's URLs by key: a plain URL is the "main" one. */
function iconUrls(icon: unknown): Record<string, string> {
  if (typeof icon === "string") return icon ? { main: icon } : {};
  if (!isObject(icon)) return {};
  return Object.fromEntries(Object.entries(icon).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}

/** What a picture's key may be: it becomes part of its file's name, which the server only accepts in this form. */
export const ICON_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

/** Why a set of pictures can't be saved under their keys, if it can't: shown at the key field, and refused before any upload. */
export function iconKeyProblem(entries: ImageEntry[], entry?: ImageEntry): string | undefined {
  const check = entry ? [entry] : entries;
  for (const e of check) {
    if (!e.key) return "Give the picture a key, e.g. main or 2d.";
    if (!ICON_KEY.test(e.key)) return `"${e.key}" can't be a key: use letters, digits, - and _ (e.g. main, 2d).`;
    if (entries.some((other) => other !== e && other.id !== e.id && other.key === e.key)) return `Two pictures use the key "${e.key}".`;
  }
  return undefined;
}

/** A new picture's file extension: its type's, which the server requires (picture-rules.ts). */
function extensionOf(entry: ImageEntry): string {
  return newPictureExtension(entry.name, entry.base64);
}

export interface IconUpload {
  path: string;
  base64: string;
}

/**
 * The icon an ability saves, from its upload field's entries, and the pictures
 * to upload for it. `stored` is the icon it has; `dir` is where its new
 * pictures go, under public/assets ("overwatch/heroes/ana/abilities"), named
 * after `name` (its id): `${name}.png` for a lone "main" picture, else
 * `${name}_${key}.png`, the extension being the picture's own type.
 *
 * Entries without a picture are left out, and pictures that were already there
 * keep their URLs. When every picture is as stored, the icon is saved exactly as
 * stored, so {"main": url} stays an object. With none left, it has no icon.
 */
export function iconForSave(entries: ImageEntry[], stored: unknown, dir: string, name: string): { icon: unknown; uploads: IconUpload[] } {
  const pictures = entries.filter((e) => e.base64 || e.previewUrl);
  const storedUrls = iconUrls(stored);
  const unchanged =
    pictures.every((e) => !e.base64) &&
    pictures.length === Object.keys(storedUrls).length &&
    pictures.every((e) => storedUrls[e.key] === e.previewUrl);
  if (unchanged) return { icon: stored, uploads: [] };

  const uploads: IconUpload[] = [];
  const lone = pictures.length === 1 && pictures[0].key === "main";
  const urls: Record<string, string> = {};
  for (const e of pictures) {
    if (e.base64) {
      const file = `${lone ? name : `${name}_${e.key}`}.${extensionOf(e)}`;
      uploads.push({ path: `public/assets/${dir}/${file}`, base64: e.base64 });
      urls[e.key] = `/api/assets/${dir}/${file}`;
    } else {
      urls[e.key] = e.previewUrl!;
    }
  }
  if (pictures.length === 0) return { icon: undefined, uploads };
  return { icon: lone ? urls.main : urls, uploads };
}

/**
 * A hero's portrait from its upload field's entries, and the pictures to upload
 * for it: an ability icon's rules (iconForSave) under the hero's folder
 * (`recordDir`, "overwatch/heroes/ana"), named portrait.png for a lone "main"
 * picture, else portrait_<key>.png. So a portrait nobody touched is saved
 * exactly as stored (an outside URL, another file name or a ?v= included),
 * and a new picture's extension comes from its type, not its file's name.
 * Without entries the portrait is undefined: the URL typed in the form
 * stands; with entries but no picture left, there is none.
 */
export function portraitForSave(entries: ImageEntry[], stored: unknown, recordDir: string): { portrait: unknown; uploads: (IconUpload & { key: string })[] } {
  if (entries.length === 0) return { portrait: undefined, uploads: [] };
  const { icon, uploads } = iconForSave(entries, stored, recordDir, "portrait");
  // iconForSave uploads the new pictures in their entries' order; their keys name them in commit messages.
  const added = entries.filter((e) => e.base64);
  return { portrait: icon, uploads: uploads.map((upload, i) => ({ ...upload, key: added[i].key })) };
}

/**
 * Where an ability list's new pictures go, under a record's own folder:
 * "abilities" keeps the folder it always had; any other list gets its own, so
 * the same ability id in two lists never shares a file.
 */
export function abilityAssetDir(recordDir: string, list: string): string {
  return `${recordDir}/${list}`;
}

/**
 * Sets the icon of each ability in the lists `lists` of `values` (a form's
 * output, changed in place) from the entries in `icons`, and returns the
 * pictures to upload. `formValues(path)` reads the form's own values, which
 * keep the _clientId the output has lost. An ability without entries in
 * `icons` keeps its icon. `recordDir` is the record's folder under
 * public/assets ("overwatch/heroes/ana").
 */
export function applyAbilityIcons(
  values: Record<string, unknown>,
  formValues: (path: string) => unknown,
  lists: string[],
  icons: Record<string, ImageEntry[]>,
  recordDir: string,
): { uploads: (IconUpload & { message: string })[] } {
  const uploads: (IconUpload & { message: string })[] = [];
  for (const list of lists) {
    const items = values[list];
    if (!Array.isArray(items)) continue;
    items.forEach((ability: unknown, i: number) => {
      if (!isObject(ability)) return;
      if (!ability.params) ability.params = {};
      const entries = icons[abilityKey(list, formValues(`${list}.${i}`), i)];
      if (!entries) return;
      const problem = iconKeyProblem(entries);
      if (problem) throw new Error(`${String(ability.name || ability.id)}: ${problem}`);
      const { icon, uploads: added } = iconForSave(entries, ability.icon, abilityAssetDir(recordDir, list), String(ability.id));
      if (icon === undefined) delete ability.icon;
      else ability.icon = icon;
      for (const upload of added) uploads.push({ ...upload, message: `Update ${String(ability.name || ability.id)} icon (${list})` });
    });
  }
  return { uploads };
}
