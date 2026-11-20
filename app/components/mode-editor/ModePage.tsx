import { NoSchemaCard } from "~/components/record-form/NoSchemaCard";
import { RecordFormCard } from "~/components/record-form/RecordFormCard";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/EmptyState";

import { ModeForm } from "./ModeForm";

import type { ModeData } from "./types";

interface ModePageProps {
  game: string;
  data: ModeData;
}

const goBack = () => {
  window.history.back();
};

/** A loaded mode's page: gone, waiting for a schema, or its form in a card. */
export function ModePage({ game, data }: ModePageProps) {
  const { schemas, enums, stored } = data;
  if (stored === null) {
    return (
      <div className="w-full py-12">
        <EmptyState title="Mode Not Found" description="The mode you are trying to edit could not be found or has been deleted." action={<Button variant="outline" onClick={goBack}>Go Back</Button>} />
      </div>
    );
  }
  if (schemas.length === 0) {
    return <NoSchemaCard game={game} plural="Modes" doing={stored ? "editing" : "adding"} />;
  }
  const title = stored ? `Edit Mode: ${String(stored.content.name)}` : `New Mode - ${game}`;
  return (
    <RecordFormCard game={game} title={title}>
      <ModeForm game={game} schemas={schemas} enums={enums} stored={stored} />
    </RecordFormCard>
  );
}
