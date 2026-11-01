import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { ButtonLink } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

// Keys of the map schema (map-base-map-attributes); map_type is a map-types
// enum id, shown as stored.
interface MapRow {
  id: string;
  name: string;
  map_type?: string;
  location?: string;
}

const columns: Column<MapRow>[] = [
  { key: "name", header: "Name" },
  { key: "map_type", header: "Type", render: (m) => m.map_type ? <span className="capitalize">{m.map_type}</span> : "-" },
  { key: "location", header: "Location", render: (m) => m.location ?? "" },
];

export default function MapsIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data: maps, loading, error } = useEntityList<MapRow>(game!, "maps");

  if (error) return (
    <LoadErrorState
      title="Failed to Load Maps"
      error={error}
      onBack={() => window.history.back()}
    />
  );

  
  if (loading) return <EntityListSkeleton columns={4} rows={8} />;
return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink capitalize tracking-tight">{game} Maps</h1>
          <p className="text-ink-muted mt-1">Manage locations, control points, and payloads.</p>
        </div>
        <ButtonLink to={`/${game}/maps/new`}>
            <Plus aria-hidden="true" className="w-4 h-4" />
            New Map
          </ButtonLink>
      </div>

      {maps ? (
        <DataTable columns={columns} data={maps} baseUrl={`/${game}/maps`} />
      ) : null}
    </div>
  );
}
