// The schema editor's shared choices and class names (New and Edit, app/components/views/DynamicSchema*).

import type { FieldType } from "~/schemas/dynamic-schema";

/** A field's types, as a top-level field offers them. */
export const FIELD_TYPES: readonly { value: FieldType; label: string }[] = [
  { value: "string", label: "Text (String)" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Toggle (Boolean)" },
  { value: "enum", label: "Single Select (Enum)" },
  { value: "list", label: "Multiple Select (Enum / List)" },
  { value: "abilities", label: "Kit Abilities (Complex List)" },
  { value: "weapon", label: "Weapons (Complex List)" },
  { value: "object_array", label: "Object Group (Nested List)" },
  { value: "reference", label: "Entity Reference (Single)" },
  { value: "reference_list", label: "Entity Reference (Multiple)" },
];

/** A sub-field's types: no abilities or weapons inside an entry. */
export const SUB_FIELD_TYPES: readonly { value: FieldType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "enum", label: "Enum (Single Select)" },
  { value: "list", label: "List (Multiple Select / Enum)" },
  { value: "object_array", label: "Object Group (Nested List)" },
  { value: "reference", label: "Reference (Single Select)" },
  { value: "reference_list", label: "Reference List (Multiple Select)" },
];

/** Types whose fields hold a list of entries, each with its own sub-fields. */
export const ENTRY_LIST_TYPES: readonly FieldType[] = ["abilities", "weapon", "object_array"];

/** Types whose values pick from options: their own, or a global enum's. */
export const CHOICE_TYPES: readonly FieldType[] = ["enum", "list"];

/** Types that pick records of a category. */
export const REFERENCE_TYPES: readonly FieldType[] = ["reference", "reference_list"];

/** Sub-field types that may carry a unit and take a record's own (the record forms show both for these). */
export const SUB_UNIT_TYPES: readonly FieldType[] = ["string", "number", "boolean"];

export const LABEL_CLASS = "block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider";
export const INPUT_CLASS =
  "block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors";
export const SUB_INPUT_CLASS = "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors";
export const CHECKBOX_LABEL_CLASS = "flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer w-max select-none";
export const NOTE_CLASS =
  "flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-border rounded-xl text-ink-muted text-xs text-center bg-surface-raised";
export const ADD_SUB_FIELD_CLASS =
  "bg-surface-raised hover:bg-border text-ink border border-border-strong rounded-lg font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
export const REMOVE_CLASS = "text-ink-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors";
export const TOOL_AI_CLASS = "text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50";
export const TOOL_EXPORT_CLASS = "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800/50";
export const TOOL_GROUP_CLASS = "flex items-center gap-1.5 text-xs font-semibold text-ink-muted uppercase tracking-wider";

/** The schema editor's dialogs: a confirmation, or the prompt and import dialogs. */
export const MODAL_SIZES = { small: "max-w-sm", large: "max-w-2xl flex flex-col" } as const;

/** How long "Copied!" shows after Copy JSON. */
export const COPIED_MS = 2000;

/** A new schema has no saved keys: every key may follow its label. */
export const NO_SAVED_KEYS: ReadonlySet<string> = new Set<string>();
