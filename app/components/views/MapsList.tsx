import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

interface MapRow {
  id: string;
  name: string;
  game_modes?: string[];
  location?: string;
}

const columns: Column<MapRow>[] = [
  { key: "name", header: "Name" },
  { key: "game_modes", header: "Game Modes", render: (m) => m.game_modes?.join(", ") ?? "" },
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">{game} Maps</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage locations, control points, and payloads.</p>
        </div>
        <Link to={`/${game}/maps/new`}>
          <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
            <Plus className="w-4 h-4" />
            New Map
          </Button>
        </Link>
      </div>

      {maps ? (
        <DataTable columns={columns} data={maps} baseUrl={`/${game}/maps`} />
      ) : null}
    </div>
  );
}
