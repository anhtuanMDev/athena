import { SplitFormSkeleton } from "~/components/views/ViewSkeletons";

import { useModeData } from "./hooks/useModeData";
import { ModeLoadError } from "./ModeLoadError";
import { ModePage } from "./ModePage";

interface ModeEditorProps {
  game: string;
  /** The mode's file name to edit; none to make a new one. */
  id?: string;
}

/** A mode's page, New (no `id`) or Edit: loading, why it couldn't load, or the page. */
export function ModeEditor({ game, id }: ModeEditorProps) {
  const { data, loading: isLoading, error } = useModeData(game, id);
  if (isLoading) {
    return <SplitFormSkeleton />;
  }
  if (error !== null) {
    return <ModeLoadError stage={id === undefined ? "new" : "edit"} error={error} />;
  }
  return data && <ModePage game={game} data={data} />;
}
