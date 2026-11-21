import type { IconUpload } from "~/lib/ability-icons";
import type { DiffEntry } from "~/lib/diff";
import type { PickedIcon } from "~/lib/enum-icons";
import type { NormalizedField } from "~/lib/form-defaults";
import type { GlobalEnum } from "~/schemas/enum";

/** The enum being edited as it was loaded: its file's name, content and sha. */
export interface StoredEnum {
  id: string;
  content: GlobalEnum;
  sha: string;
}

/** Edit's review of a save: what changes, the enum to write, and the icons it uploads. */
export interface EnumPreview {
  /** Everything the save changes: the enum is written when there's any. */
  diffs: DiffEntry[];
  /** The user's edits, apart from what the save normalizes. */
  edits: DiffEntry[];
  normalized: NormalizedField[];
  enumJson: string;
  sha: string;
  pictures: IconUpload[];
}

/** Icons picked for options, by each option's key in the form (applyOptionIcons). */
export type IconPicks = Record<string, PickedIcon>;

/** A checked enum, the form's key for each of its options, and the icons picked for them. */
export interface EnumSave {
  game: string;
  data: GlobalEnum;
  keys: string[];
  picks: IconPicks;
}
