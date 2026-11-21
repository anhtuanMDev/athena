import { abilityLists, applyAbilityIcons, iconKeyProblem, portraitForSave } from "~/lib/ability-icons";
import { asStored } from "~/lib/as-stored";
import { computeDiff } from "~/lib/diff";
import { reviewOfSave } from "~/lib/form-defaults";
import { getFile, listDirectory, pruneReplacedAssets, saveRecord } from "~/lib/github";
import { modeOverrideProblem } from "~/lib/hero-form";
import { keepUnknownKeys } from "~/lib/unknown-keys";

import type { HeroPreview, HeroRecordSchema, HeroRefusal, HeroSave, StoredHero } from "../types";
import type { PushResult } from "~/lib/push";

/**
 * The hero as a save writes it, and its new pictures: the portrait from its
 * pictures (untouched ones keep their stored URLs; without pictures, the URL
 * typed in the form stands), each ability's icon, the mode overrides checked.
 */
async function preparedHero(save: HeroSave, storedPortrait: unknown, recordDir: string) {
  const { game, formData, fields, portraits } = save;
  const portraitProblem = iconKeyProblem(portraits);
  if (portraitProblem) {
    throw new Error(`Portraits: ${portraitProblem}`);
  }
  const { portrait, uploads: portraitUploads } = portraitForSave(portraits, storedPortrait, recordDir);
  if (portraits.length > 0 && portrait === undefined) {
    delete formData.portrait;
  } else if (portraits.length > 0) {
    formData.portrait = portrait;
  }
  const problem = modeOverrideProblem(fields, formData, new Set(await listDirectory(game, "modes")));
  if (problem !== null) {
    throw new Error(problem);
  }
  const { uploads: abilityUploads } = applyAbilityIcons(formData, save.getValue, abilityLists(fields), save.abilityIcons, recordDir);
  const parsed = save.schema.parse(formData) as Record<string, unknown>;
  return { parsed, portraitUploads, abilityUploads };
}

/** A new hero and its pictures in one commit, unless its id is taken: the server refuses one taken meanwhile. */
export async function createHero(save: HeroSave, notify: boolean): Promise<{ push: PushResult | undefined } | HeroRefusal> {
  const { parsed, portraitUploads, abilityUploads } = await preparedHero(save, undefined, `${save.game}/heroes/${String(save.formData.id)}`);
  if (await getFile(`data/${save.game}/heroes/${String(parsed.id)}.json`)) {
    return { detail: "A hero with this generated ID already exists.", toast: "A hero with this ID already exists." };
  }
  const { push } = await saveRecord({ game: save.game, folder: "heroes", id: String(parsed.id), sha: null, content: parsed, message: `Add hero: ${String(parsed.name)}`, notify, pictures: [...portraitUploads, ...abilityUploads] });
  return { push };
}

/**
 * Edit's review: the hero as it would be saved, and how it differs from the
 * loaded one. The hero's keys the schema doesn't list stay as they are
 * (keepUnknownKeys), and what the form filled in for keys it had no value for
 * doesn't count as an edit (asStored).
 */
export async function previewHero(save: HeroSave, stored: StoredHero, opened: Record<string, unknown>): Promise<HeroPreview> {
  const { parsed, portraitUploads, abilityUploads } = await preparedHero(save, stored.content.portrait, `${save.game}/heroes/${stored.id}`);
  const saved = asStored(stored.content, keepUnknownKeys(stored.content, parsed, save.schema), save.schema);
  // The user's edits apart from what the save normalizes (form-defaults.ts): `opened` is the form as it opened.
  const { edits, normalized } = reviewOfSave({ stored: stored.content, opened, saved, schema: save.schema });
  return { diffs: computeDiff(stored.content, saved), edits, normalized, heroJson: JSON.stringify(saved), sha: stored.sha, portraitUploads, abilityUploads };
}

/**
 * The reviewed hero and its new pictures in one commit. What was reviewed is
 * what's saved: parsing it again would undo asStored. A picture replaced
 * under its own name leaves the hero as it was: then only the pictures are saved.
 */
export async function commitHero({ game, stored, preview, schema }: { game: string; stored: StoredHero; preview: HeroPreview; schema: HeroRecordSchema }): Promise<{ name: string; note: { message: string; kept: boolean } | null } | { refusal: string }> {
  const saved: unknown = JSON.parse(preview.heroJson);
  const parsed = schema.safeParse(saved);
  if (!parsed.success) {
    return { refusal: `Hero data failed validation on commit: ${parsed.error.message}` };
  }
  const name = typeof parsed.data.name === "string" && parsed.data.name !== "" ? parsed.data.name : stored.id;
  await saveRecord({ game, folder: "heroes", id: stored.id, sha: preview.sha, ...(preview.diffs.length > 0 && { content: saved }), message: `Update hero: ${name}`, pictures: [...preview.portraitUploads, ...preview.abilityUploads] });
  // Pictures the save replaced or dropped: removed when nothing uses them (never fails the save).
  const note = await pruneReplacedAssets(game, "heroes", stored.id, stored.content, saved);
  return { name, note };
}
