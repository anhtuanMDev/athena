import { getFile, publishRecord, updateFile } from "~/lib/github";
import { mapToSave } from "~/lib/map-form";

import type { MapRecordSchema, SaveRefusal, StoredMap } from "../types";
import type { PushResult } from "~/lib/push";

const TAKEN = "A map with this ID already exists.";

/** A checked map, and how it was checked. */
export interface MapSave {
  game: string;
  parsed: Record<string, unknown>;
  schema: MapRecordSchema;
}

/** A new map, unless its id is taken; players are told when `notify`. */
export async function createMap({ game, parsed }: MapSave, notify: boolean): Promise<{ push: PushResult | undefined } | SaveRefusal> {
  const path = `data/${game}/maps/${String(parsed.id)}.json`;
  if (await getFile(path)) {
    return { detail: TAKEN, toast: TAKEN };
  }
  const { push } = await publishRecord(path, parsed, `Add map: ${String(parsed.name)}`, notify);
  return { push };
}

/**
 * The edited map over its file, at the sha it was loaded at (a conflict
 * throws). Only what was edited changes (mapToSave); an unchanged map isn't
 * committed.
 */
export async function updateMap({ game, parsed, schema }: MapSave, stored: StoredMap): Promise<{ isSaved: true } | SaveRefusal> {
  const content = mapToSave(stored.content, parsed, schema);
  if (content === undefined) {
    return { detail: "Nothing changed, so nothing was saved." };
  }
  await updateFile(`data/${game}/maps/${stored.id}.json`, content, stored.sha, `Update map: ${String(parsed.name)}`);
  return { isSaved: true };
}
