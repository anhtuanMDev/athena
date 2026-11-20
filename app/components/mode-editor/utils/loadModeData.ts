import { getFile, listDirectory } from "~/lib/github";

import type { ModeData } from "../types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";
import type { Mode } from "~/schemas/mode";

/** The mode schemas and the game's global enums; with `id`, the mode too (null when it's gone). */
export async function loadModeData(game: string, id: string | undefined): Promise<ModeData> {
  const [schemas, enums, file] = await Promise.all([
    listDirectory<DynamicSchemaFile>(game, "schemas", true),
    listDirectory<GlobalEnum>(game, "enums", true),
    id === undefined ? Promise.resolve(undefined) : getFile<Mode>(`data/${game}/modes/${id}.json`),
  ]);
  const modeSchemas = schemas.filter((schema) => schema.category === "mode");
  if (id === undefined || file === undefined) {
    return { schemas: modeSchemas, enums };
  }
  return { schemas: modeSchemas, enums, stored: file ? { id, content: file.content, sha: file.sha } : null };
}
