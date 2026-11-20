import { listDirectory } from "~/lib/github";

import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** What New offers: the game's schemas ("Import Schema") and global enums; none when either can't be read. */
export async function loadSchemaChoices(game: string): Promise<{ schemas: DynamicSchemaFile[]; enums: string[] }> {
  const [schemas, enums] = await Promise.allSettled([listDirectory<DynamicSchemaFile>(game, "schemas", true), listDirectory(game, "enums")]);
  if (schemas.status === "rejected" || enums.status === "rejected") {
    return { schemas: [], enums: [] };
  }
  return { schemas: schemas.value, enums: enums.value };
}
