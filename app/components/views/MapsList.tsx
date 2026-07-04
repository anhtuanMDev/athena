import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { DataTableSkeleton } from "~/components/DataTableSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import { Plus } from "lucide-react";

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
  const { data, loading, error } = useData(async () => {
    const ids = await listDirectory(game!, "maps");
    const maps = await Promise.all(
      ids.map(async (id) => {
        const file = await getFile<MapRow>(`data/${game!}/maps/${id}.json`);
        return file?.content ?? null;
      })
    );
    return { maps: maps.filter(Boolean) as MapRow[], game: game! };
  }, [game]);

  if (error) return (
    <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400">
      Error loading maps data.
    </div>
  );

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

      {loading ? (
        <DataTableSkeleton columns={4} rows={8} />
      ) : data ? (
        <DataTable columns={columns} data={data.maps} baseUrl={`/${data.game}/maps`} />
      ) : null}
    </div>
  );
}
