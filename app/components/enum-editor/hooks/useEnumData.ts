import { useState } from "react";

import { newVisitKey } from "~/lib/data-cache";
import { getFile } from "~/lib/github";
import { useData } from "~/lib/use-data";

import type { GlobalEnum } from "~/schemas/enum";

/**
 * The enum to edit, or null when there's no such file. The key carries the
 * visit: each visit reads it again, so a save never goes out with the sha of
 * an older visit and meets a conflict.
 */
export function useEnumData(game: string, id: string) {
  const [visit] = useState(newVisitKey);
  return useData(async () => getFile<GlobalEnum>(`data/${game}/enums/${id}.json`), [game, id], `${game}-enum-${id}-${visit}`);
}
