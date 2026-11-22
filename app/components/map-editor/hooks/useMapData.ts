import { useState } from "react";

import { newVisitKey } from "~/lib/data-cache";
import { useData } from "~/lib/use-data";

import { loadMapData } from "../utils/loadMapData";

/**
 * A map page's data, New's and Edit's in one shape (types.ts MapData).
 * Edit's key carries the visit: each visit reads the map again, so a save
 * never goes out with the sha of an older visit and meets a conflict.
 */
export function useMapData(game: string, id: string | undefined) {
  const [visit] = useState(newVisitKey);
  const cacheKey = id === undefined ? `${game}-map-schemas` : `${game}-map-${id}-${visit}`;
  return useData(async () => loadMapData(game, id), [game, id], cacheKey);
}
