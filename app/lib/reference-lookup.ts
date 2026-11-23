import { detailScreenFor, referenceFolder, referenceLabels, referenceRecords, type ReferenceField } from "./reference-labels";

type ContentRecord = Record<string, unknown>;

/** What the screen editor's preview names references from. */
export interface ReferenceSources {
  /** categories.json: the folder a reference points into, and that folder's category. */
  categories: readonly { category: string; folder: string }[];
  /** The folders whose records the app loads to label a screen's references (screenReferenceFolders); others stay unnamed. */
  shownFolders: readonly string[];
  /** The records of each category. */
  records: Readonly<Record<string, readonly ContentRecord[] | undefined>>;
  /** The game's screens, the edited one included: a reference opens its record when exactly one detail screen shows its category. */
  screens: readonly unknown[];
}

/** A reference as the app shows it: its record's label, and whether tapping it opens that record (linkReferences). */
export interface ShownReference {
  label: string;
  linked: boolean;
}

/** A reference field's records by the id they're referenced by, and their labels. */
interface FieldRecords {
  labels: Map<string, string>;
  records: Map<string, ContentRecord>;
}

/**
 * How the preview shows a reference (field, id): its record's label, and
 * whether the app opens that record (it has an id, and one detail screen shows
 * its category). Undefined when the field points nowhere configured, into a
 * folder the app doesn't load for this screen, or at an id no record has.
 * Each field's labels are worked out once, on its first lookup.
 */
export function referenceLookup({ categories, shownFolders, records, screens }: ReferenceSources): (field: ReferenceField, id: string) => ShownReference | undefined {
  const built = new Map<ReferenceField, FieldRecords>();
  const recordsOf = (field: ReferenceField, category: string): FieldRecords => {
    const known = built.get(field);
    if (known) {
      return known;
    }
    const shown = records[category] ?? [];
    const found = { labels: referenceLabels(shown, field), records: referenceRecords(shown, field) };
    built.set(field, found);
    return found;
  };
  return (field, id) => {
    const folder = referenceFolder(field, categories);
    const category = categories.find((entry) => entry.folder === folder)?.category;
    if (!folder || !category || !shownFolders.includes(folder)) {
      return undefined;
    }
    const found = recordsOf(field, category);
    const label = found.labels.get(id);
    if (label === undefined) {
      return undefined;
    }
    const target = found.records.get(id)?.id;
    const isLinked = typeof target === "string" && target !== "" && Boolean(detailScreenFor(screens, category));
    return { label, linked: isLinked };
  };
}
