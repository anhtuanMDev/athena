import { inputClass } from "~/components/ui/input-classes";

import type { RecordSource } from "~/lib/screen-model";

interface SourceFavoritesProps {
  source: Partial<RecordSource>;
  /** Players can favorite records of the source's category. */
  isFavoritable: boolean;
  onUpdate: (patch: Partial<RecordSource>) => void;
}

/** Whether a source lists all records or only the player's favorites. */
export function SourceFavorites({ source, isFavoritable, onUpdate }: SourceFavoritesProps) {
  const onlyFavorites = "favorites";
  return (
    <>
      {(isFavoritable || Boolean(source.favorites)) && (
        <select aria-label="Whose records" value={source.favorites ? onlyFavorites : ""} disabled={!source.category} aria-invalid={Boolean(source.favorites) && !isFavoritable ? true : undefined} onChange={(e) => onUpdate({ favorites: e.target.value === onlyFavorites ? true : undefined })} className={`${inputClass} col-span-2`}>
          <option value="">All records</option>
          <option value={onlyFavorites}>Only the player's favorites (hidden when signed out)</option>
        </select>
      )}
      {Boolean(source.favorites) && !isFavoritable && (
        <p className="col-span-2 text-xs text-danger-ink">Players can't favorite these records, so this list would always be empty: choose All records.</p>
      )}
    </>
  );
}
