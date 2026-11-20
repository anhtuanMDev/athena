// The pictures of a picture-list field (MultiImageUploadField): a record's
// portraits, an ability's icons. Each has a key ("main", "2d") and, once a
// file is picked, the file's name, bytes and preview.

export interface ImageEntry {
  id: string;
  key: string;
  name?: string;
  base64?: string;
  previewUrl?: string;
}

/** A change to the list, applied to the list as it is then: React's state updater form. */
export type EntriesUpdate = (entries: ImageEntry[]) => ImageEntry[];

export interface EntryHandlers {
  add: () => void;
  update: (id: string, updates: Partial<ImageEntry>) => void;
  remove: (id: string) => void;
}

/**
 * The field's changes to its list, each sent to `onChange` as an update of
 * the latest list: a picture read in the background may finish after another
 * change, before the field renders again, and must not undo it.
 */
export function entryHandlers({ onChange, defaultKey }: { onChange: (update: EntriesUpdate) => void; defaultKey: string }): EntryHandlers {
  return {
    add: () => {
      onChange((entries) => [...entries, { id: crypto.randomUUID(), key: entries.length === 0 ? defaultKey : "" }]);
    },
    update: (id, updates) => {
      onChange((entries) => entries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)));
    },
    remove: (id) => {
      onChange((entries) => entries.filter((entry) => entry.id !== id));
    },
  };
}
