import { useData } from "~/lib/use-data";
import { listDirectory } from "~/lib/github";

export function useEntityList<T>(game: string, entityType: string) {
  return useData(async () => {
    const items = await listDirectory<T>(game, entityType, true);
    return items.filter(Boolean);
  }, [game, entityType], `${game}-${entityType}-list`);
}
