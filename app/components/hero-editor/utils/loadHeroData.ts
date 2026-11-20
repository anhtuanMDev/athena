import { getFile, listDirectory } from "~/lib/github";

import type { HeroData } from "../types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

/**
 * The hero schemas and the game's global enums; with `id`, the hero too (null
 * when it's gone). Any of them failing fails the page, New's and Edit's alike.
 */
export async function loadHeroData(game: string, id: string | undefined): Promise<HeroData> {
  const [schemas, enums, file] = await Promise.all([
    listDirectory<DynamicSchemaFile>(game, "schemas", true),
    listDirectory<GlobalEnum>(game, "enums", true),
    id === undefined ? undefined : getFile<Record<string, unknown>>(`data/${game}/heroes/${id}.json`),
  ]);
  const heroSchemas = schemas.filter((schema) => schema.category === "hero");
  if (id === undefined) {
    return { schemas: heroSchemas, enums };
  }
  return { schemas: heroSchemas, enums, stored: file ? { id, content: file.content, sha: file.sha } : null };
}
