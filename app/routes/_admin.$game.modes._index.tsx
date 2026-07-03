import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";

interface ModeRow {
  id: string;
  name: string;
  description?: string;
}

const columns: Column<ModeRow>[] = [
  { key: "name", header: "Name" },
  { key: "description", header: "Description", render: (m) => m.description ?? "" },
];

export default function ModesIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data, loading, error } = useData(async () => {
    const ids = await listDirectory(game!, "modes");
    const modes = await Promise.all(
      ids.map(async (id) => {
        const file = await getFile<ModeRow>(`data/${game!}/modes/${id}.json`);
        return file?.content ?? null;
      })
    );
    return { modes: modes.filter(Boolean) as ModeRow[], game: game! };
  }, [game]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{data.game} Modes</h1>
        <Link to={`/${data.game}/modes/new`}>
          <Button>New Mode</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data.modes} baseUrl={`/${data.game}/modes`} />
    </div>
  );
}
