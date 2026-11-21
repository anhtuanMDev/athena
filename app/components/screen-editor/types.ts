import type { ComponentProps } from "react";
import type { PropControl } from "~/components/layout-editor/PropControl";
import type { ScreenBlock } from "~/lib/screen-model";

/** What a block's prop inputs offer: the screen's fields, schemas, screens, icons and the app's limits. */
export type BlockContext = ComponentProps<typeof PropControl>["context"];

/** What a block's row can do to its block, by the block's id or its index in the screen. */
export interface BlockActions {
  toggle: (blockId: string) => void;
  patch: (blockId: string, patch: Partial<ScreenBlock>) => void;
  move: (index: number, delta: -1 | 1) => void;
  updateProp: (blockId: string, name: string, value: unknown) => void;
  removeProps: (blockId: string, names: string[]) => void;
  duplicate: (index: number) => void;
  remove: (index: number) => void;
  /** Reports whether a JSON box ("<block id>:<prop>") parses. */
  reportJson: (key: string) => (error: string | null) => void;
}

/** A block's place in the screen: its index, and how many blocks there are. */
export interface BlockPosition {
  index: number;
  count: number;
}
