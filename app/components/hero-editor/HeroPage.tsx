import { NoSchemaCard } from "~/components/record-form/NoSchemaCard";
import { RecordFormCard } from "~/components/record-form/RecordFormCard";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/EmptyState";

import { HeroForm } from "./HeroForm";

import type { HeroData } from "./types";

interface HeroPageProps {
  game: string;
  data: HeroData;
}

const goBack = () => {
  window.history.back();
};

/** A loaded hero's page: gone, waiting for a schema, or its form in a card. */
export function HeroPage({ game, data }: HeroPageProps) {
  const { schemas, enums, stored } = data;
  if (stored === null) {
    return (
      <div className="w-full py-12">
        <EmptyState title="Hero Not Found" description="The hero you are trying to edit could not be found or has been deleted." action={<Button variant="outline" onClick={goBack}>Go Back</Button>} />
      </div>
    );
  }
  if (schemas.length === 0) {
    return <NoSchemaCard game={game} plural="Heroes" doing={stored ? "editing" : "adding"} />;
  }
  const title = stored ? `Edit Hero - ${String(stored.content.name)}` : `New Hero - ${game}`;
  return (
    <RecordFormCard game={game} title={title}>
      <HeroForm game={game} schemas={schemas} enums={enums} stored={stored} />
    </RecordFormCard>
  );
}
