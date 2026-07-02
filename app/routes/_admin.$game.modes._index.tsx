import { Link } from "react-router";
import type { Route } from "./+types/_admin.$game.modes._index";
import { listDirectory, getFile } from "~/lib/github.server";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";

interface ModeRow {
  id: string;
  name: string;
  description?: string;
}

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  const ids = await listDirectory(params.game, "modes");
  const modes = await Promise.all(
    ids.map(async (id) => {
      const file = await getFile<ModeRow>(`data/${params.game}/modes/${id}.json`);
      return file?.content ?? null;
    })
  );
  return { modes: modes.filter(Boolean) as ModeRow[], game: params.game };
}

const columns: Column<ModeRow>[] = [
  { key: "name", header: "Name" },
  { key: "description", header: "Description", render: (m) => m.description ?? "" },
];

export default function ModesIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{loaderData.game} Modes</h1>
        <Link to={`/${loaderData.game}/modes/new`}>
          <Button>New Mode</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={loaderData.modes} baseUrl={`/${loaderData.game}/modes`} />
    </div>
  );
}
