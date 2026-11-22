import { FieldsFormSkeleton } from "~/components/views/ViewSkeletons";

import { useMapData } from "./hooks/useMapData";
import { MapLoadError } from "./MapLoadError";
import { MapPage } from "./MapPage";

interface MapEditorProps {
  game: string;
  /** The map's file name to edit; none to make a new one. */
  id?: string;
}

/** A map's page, New (no `id`) or Edit: loading, why it couldn't load, or the page. */
export function MapEditor({ game, id }: MapEditorProps) {
  const { data, loading: isLoading, error } = useMapData(game, id);
  if (isLoading) {
    return <FieldsFormSkeleton />;
  }
  if (error !== null) {
    return <MapLoadError stage={id === undefined ? "new" : "edit"} error={error} />;
  }
  return data && <MapPage game={game} data={data} />;
}
