import { asStored } from "~/lib/as-stored";
import { getFile, pruneReplacedAssets, saveRecord } from "~/lib/github";
import { contentToSave } from "~/lib/record-form";

import type { ModeRecordSchema, SaveRefusal, StoredMode } from "../types";
import type { IconUpload } from "~/lib/ability-icons";
import type { PushResult } from "~/lib/push";

/** A checked mode, its abilities' new icons, and how it was checked. */
export interface ModeSave {
  game: string;
  parsed: Record<string, unknown>;
  uploads: IconUpload[];
  schema: ModeRecordSchema;
}

/** A new mode in one commit with its icons, unless its id is taken: the server refuses one taken meanwhile. */
export async function createMode({ game, parsed, uploads }: ModeSave, notify: boolean): Promise<{ push: PushResult | undefined } | SaveRefusal> {
  if (await getFile(`data/${game}/modes/${String(parsed.id)}.json`)) {
    return { detail: "A mode with this generated ID already exists.", toast: "A mode with this ID already exists." };
  }
  const { push } = await saveRecord({ game, folder: "modes", id: String(parsed.id), sha: null, content: parsed, message: `Add mode: ${String(parsed.name)}`, notify, pictures: uploads });
  return { push };
}

/**
 * The edited mode over its file, at the sha it was loaded at. Only what was
 * edited changes (asStored); an unchanged mode isn't written, and with no new
 * icon either nothing is committed. Resolves to the prune's note, if any.
 */
export async function updateMode({ game, parsed, uploads, schema }: ModeSave, stored: StoredMode): Promise<{ note: { message: string; kept: boolean } | null } | SaveRefusal> {
  const saved = asStored(stored.content, parsed, schema);
  const content = contentToSave(stored.content, saved);
  if (content === undefined && uploads.length === 0) {
    return { detail: "Nothing changed, so nothing was saved." };
  }
  await saveRecord({ game, folder: "modes", id: stored.id, sha: stored.sha, ...(content !== undefined && { content }), message: `Update mode: ${String(parsed.name)}`, pictures: uploads });
  // Pictures the save replaced or dropped: removed when nothing uses them (never fails the save).
  const note = parsed.id === stored.content.id ? await pruneReplacedAssets(game, "modes", String(parsed.id), stored.content, saved) : null;
  return { note };
}
