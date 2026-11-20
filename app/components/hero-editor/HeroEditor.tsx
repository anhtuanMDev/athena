import { SplitFormSkeleton } from "~/components/views/ViewSkeletons";

import { HeroLoadError } from "./HeroLoadError";
import { HeroPage } from "./HeroPage";
import { useHeroData } from "./hooks/useHeroData";

interface HeroEditorProps {
  game: string;
  /** The hero's file name to edit; none to make a new one. */
  id?: string;
}

/** A hero's page, New (no `id`) or Edit: loading, why it couldn't load, or the page. */
export function HeroEditor({ game, id }: HeroEditorProps) {
  const { data, loading: isLoading, error } = useHeroData(game, id);
  if (isLoading) {
    return <SplitFormSkeleton />;
  }
  if (error !== null) {
    return <HeroLoadError stage={id === undefined ? "new" : "edit"} error={error} />;
  }
  return data && <HeroPage game={game} data={data} />;
}
