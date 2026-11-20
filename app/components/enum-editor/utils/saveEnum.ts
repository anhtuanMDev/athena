import { asStored } from "~/lib/as-stored";
import { computeDiff } from "~/lib/diff";
import { duplicateOptionIds } from "~/lib/enum-form";
import { applyOptionIcons } from "~/lib/enum-icons";
import { pruneReplacedAssets, saveRecord } from "~/lib/github";
import { slugify } from "~/lib/slug";
import { keepUnknownKeys } from "~/lib/unknown-keys";
import { EnumSchema } from "~/schemas/enum";

import type { EnumPreview, EnumSave, StoredEnum } from "../types";
import type { GlobalEnum } from "~/schemas/enum";

/** Gives an option with no id one from its name, and refuses ids used twice. */
function checkOptionIds(data: GlobalEnum): void {
  for (const option of data.options) {
    if (!option.id) {
      option.id = slugify(option.name);
    }
  }
  const duplicates = duplicateOptionIds(data.options.map((option) => option.id));
  if (duplicates !== null) {
    throw new Error(duplicates);
  }
}

/** A new enum and its icons in one commit; the server refuses it if the id is taken. */
export async function createEnum({ game, data, keys, picks }: EnumSave): Promise<void> {
  checkOptionIds(data);
  const pictures = applyOptionIcons(data.options, keys, picks, game, data.id);
  await saveRecord({ game, folder: "enums", id: data.id, sha: null, content: data, message: `Add enum: ${data.name}`, pictures });
}

/**
 * Edit's review: the enum as it would be saved, and how it differs from the
 * loaded one. The picked icons go in, so the diff shows their URLs. The
 * enum's keys the form doesn't edit stay as they are, and what the form filled
 * in for keys it had no value for doesn't count as an edit.
 */
export function reviewEnum({ game, data, keys, picks }: EnumSave, stored: StoredEnum): EnumPreview {
  checkOptionIds(data);
  const parsed = EnumSchema.parse(data);
  const pictures = applyOptionIcons(parsed.options, keys, picks, game, stored.id);
  const saved = asStored(stored.content, keepUnknownKeys(stored.content, parsed, EnumSchema), EnumSchema);
  return { diffs: computeDiff(stored.content, saved), enumJson: JSON.stringify(saved), sha: stored.sha, pictures };
}

/**
 * The reviewed enum and its new icons in one commit. What was reviewed is
 * what's saved (its icon URLs included): parsing it again would undo
 * asStored. An icon replaced under its own name leaves the enum as it was:
 * then only the icons are saved. Null when it no longer passes the check.
 */
export async function commitEnum(game: string, stored: StoredEnum, preview: EnumPreview): Promise<{ name: string; note: { message: string; kept: boolean } | null } | null> {
  const saved: unknown = JSON.parse(preview.enumJson);
  const parsed = EnumSchema.safeParse(saved);
  if (!parsed.success) {
    return null;
  }
  await saveRecord({ game, folder: "enums", id: stored.id, sha: preview.sha, ...(preview.diffs.length > 0 && { content: saved }), message: `Update enum: ${parsed.data.name}`, pictures: preview.pictures });
  // Option icons the save replaced or dropped (public/assets/{game}/enums/{id}/): removed when nothing uses them.
  const note = await pruneReplacedAssets(game, "enums", stored.id, stored.content, saved);
  return { name: parsed.data.name, note };
}
