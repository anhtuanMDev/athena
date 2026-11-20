import { useState } from "react";

import { newVisitKey } from "~/lib/data-cache";
import { useData } from "~/lib/use-data";

import { loadHeroData } from "../utils/loadHeroData";

/**
 * A hero page's data, New's and Edit's in one shape (types.ts HeroData).
 * Edit's key carries the visit: each visit reads the hero again, so a save
 * never goes out with the sha of an older visit and meets a conflict.
 */
export function useHeroData(game: string, id: string | undefined) {
  const [visit] = useState(newVisitKey);
  const cacheKey = id === undefined ? `${game}-hero-schemas` : `${game}-hero-${id}-${visit}`;
  return useData(async () => loadHeroData(game, id), [game, id], cacheKey);
}
