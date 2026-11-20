import type { modeRecordSchema } from "~/lib/record-schema";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

/** The mode being edited as it was loaded: its file's name, content and sha. */
export interface StoredMode {
  id: string;
  content: Record<string, unknown>;
  sha: string;
}

/** What a mode's page loads: the mode schemas, the global enums, and the mode for Edit. */
export interface ModeData {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  /** For Edit: the mode, or null when there's no such file. */
  stored?: StoredMode | null;
}

/** A save the page refuses: a message for its banner, and one for a toast when it gets one. */
export interface SaveRefusal {
  detail: string;
  toast?: string;
}

/** How a mode is checked: its schema's fields, strictly. */
export type ModeRecordSchema = ReturnType<typeof modeRecordSchema>;
