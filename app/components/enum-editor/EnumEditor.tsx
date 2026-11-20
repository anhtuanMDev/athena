import { EnumCard } from "./EnumCard";
import { EnumEditPage } from "./EnumEditPage";
import { EnumForm } from "./EnumForm";

interface EnumEditorProps {
  game: string;
  /** The enum's file name to edit; none to make a new one. */
  id?: string;
}

/** A global enum's page: New's form at once, or Edit's once the enum has loaded. */
export function EnumEditor({ game, id }: EnumEditorProps) {
  if (id === undefined) {
    return (
      <EnumCard title="New Global Enum">
        <EnumForm game={game} />
      </EnumCard>
    );
  }
  return <EnumEditPage game={game} id={id} />;
}
