import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";

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

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{data.game} Maps</h1>
        <Link to={`/${data.game}/maps/new`}>
          <Button>New Map</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data.maps} baseUrl={`/${data.game}/maps`} />
    </div>
  );
}
