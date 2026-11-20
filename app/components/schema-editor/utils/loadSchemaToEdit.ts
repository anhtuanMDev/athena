import { getFile, listDirectory } from "~/lib/github";

import type { LoadedSchema } from "../types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** A folder's listing, or nothing when it can't be read: the editor works without it. */
async function listingOrNothing<T>(listing: Promise<T[]>): Promise<T[]> {
  const [result] = await Promise.allSettled([listing]);
  return result.status === "fulfilled" ? result.value : [];
}

/** The schema Edit opens, with the game's schemas and enums (each nothing when it can't be read). */
export async function loadSchemaToEdit(game: string, id: string | undefined): Promise<{ loaded: LoadedSchema; schemas: DynamicSchemaFile[]; enums: string[] }> {
  if (id === undefined || id === "") {
    throw new Error("Schema ID missing");
  }
  const [file, schemas, enums] = await Promise.all([
    getFile<DynamicSchemaFile>(`data/${game}/schemas/${id}.json`),
    listingOrNothing(listDirectory<DynamicSchemaFile>(game, "schemas", true)),
    listingOrNothing(listDirectory(game, "enums")),
  ]);
  if (!file) {
    throw new Error("Schema not found");
  }
  return { loaded: { id, schema: file.content, sha: file.sha }, schemas, enums };
}
