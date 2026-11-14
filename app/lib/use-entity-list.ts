import { useData } from "~/lib/use-data";
import { getEnum, listDirectory, listSummaries } from "~/lib/github";
import { enumOptions, type EnumOptionView } from "~/lib/enum-options";
import { entityListKey, type ListShape } from "~/lib/listing";

/**
 * A folder's records for a list: whole, or with `shape` "summary" only what
 * the list shows (listing.ts), which spares the page most of the bytes.
 */
export function useEntityList<T>(game: string, entityType: string, shape?: ListShape) {
  return useData(async () => {
    const items = shape ? await listSummaries<T>(game, entityType) : await listDirectory<T>(game, entityType, true);
    return items.filter(Boolean);
  }, [game, entityType, shape ?? "whole"], entityListKey(game, entityType, shape));
}

/**
 * The options of one of a game's enums, for naming stored ids in a list: one
 * request, shared by the lists that ask for the same enum. None while loading
 * or when it can't be read, so a list then shows the ids as stored.
 */
export function useEnumOptions(game: string, enumId: string): EnumOptionView[] {
  const { data } = useData(async () => enumOptions(await getEnum(game, enumId)), [game, enumId], `${game}-enum-${enumId}`);
  return data ?? [];
}
