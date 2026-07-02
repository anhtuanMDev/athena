import { Link } from "react-router";
import type { Route } from "./+types/_admin.$game.maps._index";
import { listDirectory, getFile } from "~/lib/github.server";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";

interface MapRow {
  id: string;
  name: string;
  game_modes?: string[];
  location?: string;
}

export async function loader({ params }: Route.LoaderArgs) {
  const ids = await listDirectory(params.game, "maps");
  const maps = await Promise.all(
    ids.map(async (id) => {
      const file = await getFile<MapRow>(`data/${params.game}/maps/${id}.json`);
      return file?.content ?? null;
    })
  );
  return { maps: maps.filter(Boolean) as MapRow[], game: params.game };
}

const columns: Column<MapRow>[] = [
  { key: "name", header: "Name" },
  { key: "game_modes", header: "Game Modes", render: (m) => m.game_modes?.join(", ") ?? "" },
  { key: "location", header: "Location", render: (m) => m.location ?? "" },
];

export default function MapsIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{loaderData.game} Maps</h1>
        <Link to={`/${loaderData.game}/maps/new`}>
          <Button>New Map</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={loaderData.maps} baseUrl={`/${loaderData.game}/maps`} />
    </div>
  );
}
