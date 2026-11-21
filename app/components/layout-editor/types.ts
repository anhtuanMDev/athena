import type { ReactNode } from "react";
import type { PicturePolicy } from "~/lib/app-pictures";
import type { EnumOptionView } from "~/lib/enum-options";
import type { FieldOption, PrimitiveSpec, PropSpec, RecordSource, SchemaInfo, ScreenBlock } from "~/lib/screen-model";
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

/** What a block's preview reads: a sketch of what each app block receives, not the app's own styling. */
export interface PreviewContext {
  /** What "data.<path>" reads. */
  data: unknown;
  /** Records a source lists (the app applies the same sort and limit). */
  recordsFor: (source: RecordSource | undefined) => Record<string, unknown>[];
  /** A field's enum options: names for chips and enum-bound values, and what field_section shows of one. */
  enumOptions: (field: FieldOption | undefined) => EnumOptionView[];
  dataFields: FieldOption[];
  /** Fields "item.<path>" reads in a list block, for units and custom suffixes. */
  itemFieldsFor: (block: ScreenBlock) => FieldOption[];
  /**
   * A reference's record, as the app shows it: its label, and whether the app
   * would open it (field_section linkReferences); none when the app shows the id.
   */
  reference: (field: FieldOption, id: string) => { label: string; linked: boolean } | undefined;
  screenSource?: RecordSource;
  /** Stages a route timeline shows (the app's routeStops limit). */
  routeStops: number;
  /** Which pictures the app loads, and which variant of a map of them it shows (the manifest's policy). */
  pictures: PicturePolicy;
}

/** A block, its manifest entry, and what its preview reads. */
export interface PreviewProps {
  block: ScreenBlock;
  spec: PrimitiveSpec | undefined;
  ctx: PreviewContext;
}

/** A block's props as its preview reads them: the value the block receives, and that value as shown. */
export interface PreviewReader {
  raw: (name: string) => unknown;
  show: (name: string) => ReactNode;
}
