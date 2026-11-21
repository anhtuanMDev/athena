import type { FieldOption, PropSpec, SchemaInfo } from "~/lib/screen-model";
import type { AppLimits } from "~/lib/screen-policy";

export interface PropContext {
  /** Fields "data.<path>" can use on this screen. */
  dataFields: FieldOption[];
  /** Fields the filter chips can filter the screen's lists by: its source's (screenDataFields). Without them, dataFields. */
  chipFields?: FieldOption[];
  /** Fields "item.<path>" can use; null outside list blocks. */
  itemFields: FieldOption[] | null;
  schemas: SchemaInfo[];
  screenIds: string[];
  /** Screens the app provides itself (the manifest's policy). */
  appScreens: string[];
  /** What the app drops or caps (the manifest's policy). */
  limits: AppLimits;
  icons: string[];
}

/** Whether a prop holds a value of its own or reads a field. */
export type SourceMode = "value" | "field";

/** A prop's ids: its input's, its help's and its error's, and what describes the input. */
export interface PropIds {
  input: string;
  help: string;
  error: string;
  describedBy: string;
}

/** One prop of a block, as its input edits it. */
export interface PropField {
  ids: PropIds;
  name: string;
  spec: PropSpec;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}

/** Where tapping can go: this game's screens, the app's own, and the fields a link can be read from. */
export interface ActionTargets {
  screenIds: string[];
  appScreens: string[];
  linkFields: string[];
}

/** A quick-access tile. */
export interface Shortcut {
  label?: string;
  icon?: string;
  screen?: string;
  url?: string;
}

/** An info row: a label, an icon, and a value (fixed text or "data.<path>"). */
export interface InfoRow {
  label?: string;
  value?: string;
  icon?: string;
}
