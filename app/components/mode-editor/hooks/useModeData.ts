import { useState } from "react";

import { newVisitKey } from "~/lib/data-cache";
import { useData } from "~/lib/use-data";

import { loadModeData } from "../utils/loadModeData";

/**
 * A mode page's data, New's and Edit's in one shape (types.ts ModeData).
 * Edit's key carries the visit: each visit reads the mode again, so a save
 * never goes out with the sha of an older visit and meets a conflict.
 */
export function useModeData(game: string, id: string | undefined) {
  const [visit] = useState(newVisitKey);
  const cacheKey = id === undefined ? `${game}-mode-schemas` : `${game}-mode-${id}-${visit}`;
  return useData(async () => loadModeData(game, id), [game, id], cacheKey);
}
