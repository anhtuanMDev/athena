import type { IconUpload } from "./ability-icons";
import { newPictureExtension } from "./picture-rules";

// An enum's option icons are picked next to its form, one per option, and
// kept by the form's own key for the option: useFieldArray's field id, which
// follows the option when another is added above it ("Add Option" puts new
// ones on top) or removed. Kept by position, as they were, each such change
// moved every picked icon onto the option that took that position.

/** A picture picked for an option. */
export interface PickedIcon {
  name: string;
  base64: string;
}

/**
 * Sets the icon of each of `options` (an enum's, in the form's order) a
 * picture was picked for, and returns the pictures to upload. `keys[i]` is the
 * form's key for `options[i]`, and `picks` are by that key: a pick whose
 * option is gone is left out. Each goes in the enum's own folder,
 * public/assets/{game}/enums/{enum}/, named after the option's value and the
 * picture's type.
 */
export function applyOptionIcons(options: { id: string; icon?: string }[], keys: string[], picks: Record<string, PickedIcon>, game: string, enumId: string): IconUpload[] {
  const uploads: IconUpload[] = [];
  options.forEach((option, i) => {
    const pick = picks[keys[i]];
    if (!pick) return;
    const file = `${game}/enums/${enumId}/${option.id}.${newPictureExtension(pick.name, pick.base64)}`;
    uploads.push({ path: `public/assets/${file}`, base64: pick.base64 });
    option.icon = `/api/assets/${file}`;
  });
  return uploads;
}
