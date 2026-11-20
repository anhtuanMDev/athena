import type { ReactNode } from "react";
import type { FieldPath, FieldValue } from "~/lib/schema-fields";
import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** A schema's fields being edited, and every change the editor makes to them (use-schema-fields.ts). */
export interface SchemaFieldsEditor {
  fields: DynamicField[];
  update: (path: FieldPath, setting: keyof DynamicField, value: FieldValue) => void;
  add: () => void;
  addSub: (path: FieldPath) => void;
  remove: (path: FieldPath) => void;
  setSuffix: (path: FieldPath, checked: boolean) => void;
  setGlobalEnum: (path: FieldPath, enumId: string) => void;
  merge: (incoming: readonly DynamicField[]) => void;
  clear: () => void;
}

/** What "Fetch Fields" found for each top-level reference field, by its index (use-api-keys.ts). */
export interface ApiKeys {
  keys: Partial<Record<number, string[]>>;
  loading: Partial<Record<number, boolean>>;
  fetchKeys: (index: number, endpoint: string) => Promise<void>;
}

/** What the field panels choose from. */
export interface FieldChoices {
  /** The game's global enums, by id. */
  enums: string[];
  /** Where a reference field may read its options (categories.ts referenceEndpoints). */
  referenceOptions: string[];
  apiKeys: ApiKeys;
}

/** A schema pasted or uploaded (schema-fields.ts importedSchema). */
export interface ImportedSchema {
  fields?: DynamicField[];
  name?: unknown;
  category?: unknown;
}

/** A save the page refuses: a message for its error banner, and one for a toast when it gets one. */
export interface SaveRefusal {
  detail: string;
  toast?: string;
}

/** The schema as Edit loaded it: its file's name, content and sha. */
export interface LoadedSchema {
  id: string;
  schema: DynamicSchemaFile;
  sha: string;
}

/** How New or Edit sets up the shared editor page (SchemaEditorForm). */
export interface SchemaPageSetup {
  game: string;
  /** The title and its buttons. */
  header: ReactNode;
  /** New's name and category; nothing for Edit. */
  identity?: ReactNode;
  commitError: string | null;
  isSubmitting: boolean;
  /** The schema's category and name, as the AI prompt and "Import Schema" use them. */
  category: string;
  name: string;
  /** The schema's own id, which "Import Schema" leaves out; none for a new one. */
  currentId?: string;
  /** The game's schemas, and its global enums' ids. */
  schemas: DynamicSchemaFile[];
  enums: string[];
  exported: () => { json: unknown; fileName: string };
  /** Takes an imported schema's name and category (New), or refuses it; true to go on to its fields. */
  acceptImport: (imported: ImportedSchema) => boolean;
  onSubmit: () => void;
}
