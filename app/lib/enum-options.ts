/**
 * A game enum's options as the app reads them (zms src/content/model.ts:
 * normalizeEnums, normalizeEnumParams and findEnumOption), so the admin's
 * screen preview and lists name and describe a value as the app does. Enum
 * files are edited by hand too: a malformed option or param is left out, never
 * the whole enum.
 */

/** A value an option carries, e.g. Tank's "Health 150 HP". */
export interface EnumParamView {
  id: string;
  label: string;
  value: string | number | boolean;
  suffix?: string;
}

export interface EnumOptionView {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  params?: EnumParamView[];
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const asString = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

/** An option's params that have something to show: a label and a value that isn't blank. */
function enumParams(raw: unknown): EnumParamView[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const params = raw.flatMap((param): EnumParamView[] => {
    if (!isObject(param)) return [];
    const label = asString(param.label);
    const value = param.value;
    const shown =
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.trim() !== "");
    if (!label || !shown) return [];
    const suffix = typeof param.suffix === "string" ? param.suffix.trim() : "";
    return [{ id: asString(param.id) ?? label, label, value: value as EnumParamView["value"], ...(suffix && { suffix }) }];
  });
  return params.length > 0 ? params : undefined;
}

/** The options of an enum file: names alone ("Tank"), or { id, name, description, icon, params }. */
export function enumOptions(file: unknown): EnumOptionView[] {
  const options = isObject(file) && Array.isArray(file.options) ? file.options : [];
  return options.flatMap((option): EnumOptionView[] => {
    if (typeof option === "string") return option ? [{ id: option, name: option }] : [];
    if (!isObject(option)) return [];
    const id = asString(option.id) ?? asString(option.name);
    if (!id) return [];
    const description = asString(option.description);
    const icon = asString(option.icon);
    const params = enumParams(option.params);
    return [{ id, name: asString(option.name) ?? id, ...(description && { description }), ...(icon && { icon }), ...(params && { params }) }];
  });
}

/**
 * A field's options as the app reads them (zms findEnumOption): its global
 * enum's, found by globalEnumId among `enums` (a game's enum files), else its
 * own. None when the enum isn't there: a value then shows as stored.
 */
export function fieldOptions(field: { globalEnumId?: string; options?: unknown }, enums: readonly unknown[]): EnumOptionView[] {
  if (field.globalEnumId) return enumOptions(enums.find((e) => isObject(e) && e.id === field.globalEnumId));
  return Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string").map((o) => ({ id: o, name: o })) : [];
}

/** The option a stored value names: by id, else by name in any case, as the app matches it. */
export function findEnumOption(options: readonly EnumOptionView[], value: unknown): EnumOptionView | undefined {
  const id = typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  if (!id) return undefined;
  const lower = id.toLowerCase();
  return options.find((o) => o.id === id) ?? options.find((o) => o.name.toLowerCase() === lower);
}

/** A param's value as the app shows it: Yes or No for a flag, then its suffix ("150 HP"). */
export function enumParamText(param: EnumParamView): string {
  const value = typeof param.value === "boolean" ? (param.value ? "Yes" : "No") : String(param.value);
  return param.suffix ? `${value} ${param.suffix}` : value;
}
