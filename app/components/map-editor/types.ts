import type { mapRecordSchema } from "~/lib/record-schema";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** The map being edited as it was loaded: its file's name, content and sha. */
export interface StoredMap {
  id: string;
  content: Record<string, unknown>;
  sha: string;
}

/** What a map's page loads: the map schemas, and the map for Edit. */
export interface MapData {
  schemas: DynamicSchemaFile[];
  /** For Edit: the map, or null when there's no such file. */
  stored?: StoredMap | null;
}

/** A save the page refuses: a message for its banner, and one for a toast when it gets one. */
export interface SaveRefusal {
  detail: string;
  toast?: string;
}

/** How a map is checked: its schema's fields, strictly. */
export type MapRecordSchema = ReturnType<typeof mapRecordSchema>;

/** New makes a map, Edit writes over one. */
export type MapStage = "new" | "edit";
