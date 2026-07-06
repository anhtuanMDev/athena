import { useData } from "~/lib/use-data";
import { listDirectory, getFile } from "~/lib/github";

export function useEntityList<T>(game: string, entityType: string) {
  return useData(async () => {
    const ids = await listDirectory(game, entityType);
    const items: T[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (id) => {
          const file = await getFile<T>(`data/${game}/${entityType}/${id}.json`);
          return file?.content ?? null;
        })
      );
      items.push(...results.filter(Boolean) as T[]);
    }
    return items;
  }, [game, entityType], `${game}-${entityType}-list`);
}
