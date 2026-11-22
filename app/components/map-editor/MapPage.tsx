import { NoSchemaCard } from "~/components/record-form/NoSchemaCard";
import { RecordFormCard } from "~/components/record-form/RecordFormCard";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/EmptyState";

import { MapForm } from "./MapForm";

import type { MapData } from "./types";

interface MapPageProps {
  game: string;
  data: MapData;
}

const goBack = () => {
  window.history.back();
};

/** A loaded map's page: gone, New waiting for a schema, or its form in a card. */
export function MapPage({ game, data }: MapPageProps) {
  const { schemas, stored } = data;
  if (stored === null) {
    return (
      <div className="w-full py-12">
        <EmptyState
          title="Map or Schema Not Found"
          description="The map you are trying to edit could not be found or the required schema is missing."
          action={<Button variant="outline" onClick={goBack}>Go Back</Button>}
        />
      </div>
    );
  }
  // Edit still opens without a schema: the map's name can be changed.
  if (!stored && schemas.length === 0) {
    return <NoSchemaCard game={game} plural="Maps" doing="adding" />;
  }
  const name = stored?.content.name;
  const title = stored ? `Edit Map: ${typeof name === "string" ? name : ""}` : `New Map - ${game}`;
  return (
    <RecordFormCard game={game} title={title}>
      <MapForm game={game} schemas={schemas} stored={stored} />
    </RecordFormCard>
  );
}
