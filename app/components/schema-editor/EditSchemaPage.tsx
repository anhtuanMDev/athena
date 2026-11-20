import { PanelsSkeleton } from "~/components/views/ViewSkeletons";
import { useData } from "~/lib/use-data";

import { EditSchemaForm } from "./EditSchemaForm";
import { SchemaLoadError } from "./SchemaLoadError";
import { loadSchemaToEdit } from "./utils/loadSchemaToEdit";

interface EditSchemaPageProps {
  game: string;
  /** The schema's file name, from the page's address. */
  id: string | undefined;
}

/** Edit's page: the schema loading, the reason it can't be opened, or its editor. */
export function EditSchemaPage({ game, id }: EditSchemaPageProps) {
  const { data, loading: isLoading, error } = useData(async () => loadSchemaToEdit(game, id), [game, id], `${game}-schema-${String(id)}`);
  if (isLoading) {
    return <PanelsSkeleton />;
  }
  if (error !== null) {
    return <SchemaLoadError game={game} error={error} />;
  }
  if (data === null) {
    return null;
  }
  // A new editor for another schema: its fields and saved keys start from the file.
  return <EditSchemaForm key={data.loaded.id} game={game} loaded={data.loaded} schemas={data.schemas} enums={data.enums} />;
}
