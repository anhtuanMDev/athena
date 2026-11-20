import type { ImageEntry } from "~/components/MultiImageUploadField";
import type { IconUpload } from "~/lib/ability-icons";
import type { DiffEntry } from "~/lib/diff";
import type { heroRecordSchema } from "~/lib/record-schema";
import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

/** The hero being edited as it was loaded: its file's name, content and sha. */
export interface StoredHero {
  id: string;
  content: Record<string, unknown>;
  sha: string;
}

/** What a hero's page loads: the hero schemas, the global enums, and the hero for Edit. */
export interface HeroData {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  /** For Edit: the hero, or null when there's no such file. */
  stored?: StoredHero | null;
}

/** How a hero is checked: its schema's fields over the hero contract. */
export type HeroRecordSchema = ReturnType<typeof heroRecordSchema>;

/** A checked hero's form values and pictures, and how it's checked. */
export interface HeroSave {
  game: string;
  formData: Record<string, unknown>;
  fields: DynamicField[];
  schema: HeroRecordSchema;
  portraits: ImageEntry[];
  abilityIcons: Record<string, ImageEntry[]>;
  /** A form value by path, as applyAbilityIcons reads the abilities' keys. */
  getValue: (path: string) => unknown;
}

/** Edit's review of a save: what changes, the hero to write, and the pictures it uploads. */
export interface HeroPreview {
  diffs: DiffEntry[];
  heroJson: string;
  sha: string;
  portraitUploads: (IconUpload & { key: string })[];
  abilityUploads: IconUpload[];
}

/** A save the page refuses: a message for its banner, and one for a toast. */
export interface HeroRefusal {
  detail: string;
  toast: string;
}
