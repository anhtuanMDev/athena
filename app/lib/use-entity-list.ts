import { useData } from "~/lib/use-data";
import { listDirectory, getFile } from "~/lib/github";

export function useEntityList<T>(game: string, entityType: string) {
  return useData(async () => {
    const ids = await listDirectory(game, entityType);
    const items = await Promise.all(
      ids.map(async (id) => {
        const file = await getFile<T>(`data/${game}/${entityType}/${id}.json`);
        return file?.content ?? null;
      })
    );
    return items.filter(Boolean) as T[];
  }, [game, entityType], `${game}-${entityType}-list`);
}
