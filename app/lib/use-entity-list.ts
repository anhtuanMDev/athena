import { useData } from "~/lib/use-data";
import { getEnum, listDirectory } from "~/lib/github";
import { enumOptions, type EnumOptionView } from "~/lib/enum-options";

export function useEntityList<T>(game: string, entityType: string) {
  return useData(async () => {
    const items = await listDirectory<T>(game, entityType, true);
    return items.filter(Boolean);
  }, [game, entityType], `${game}-${entityType}-list`);
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
