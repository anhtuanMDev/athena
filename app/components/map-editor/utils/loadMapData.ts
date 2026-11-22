import { getFile, listDirectory } from "~/lib/github";

import type { MapData } from "../types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** The map schemas; with `id`, the map too (null when it's gone). */
export async function loadMapData(game: string, id: string | undefined): Promise<MapData> {
  const [schemas, file] = await Promise.all([
    listDirectory<DynamicSchemaFile>(game, "schemas", true),
    id === undefined ? Promise.resolve(undefined) : getFile<Record<string, unknown>>(`data/${game}/maps/${id}.json`),
  ]);
  const mapSchemas = schemas.filter((schema) => schema.category === "map");
  if (id === undefined || file === undefined) {
    return { schemas: mapSchemas };
  }
  return { schemas: mapSchemas, stored: file ? { id, content: file.content, sha: file.sha } : null };
}
