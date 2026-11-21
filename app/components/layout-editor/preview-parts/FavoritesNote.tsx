import type { RecordSource } from "~/lib/screen-model";

interface FavoritesNoteProps {
  source: RecordSource | undefined;
}

/** Favorites differ per player, so a favorites list previews sample records. */
export function FavoritesNote({ source }: FavoritesNoteProps) {
  if (!source?.favorites) {
    return null;
  }
  return <p className="mb-2 text-xs text-ink-muted">Each signed-in player sees their own favorites (hidden when signed out). Sample:</p>;
}
