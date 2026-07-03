import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";

interface ItemRow {
  id: string;
  name: string;
  hero?: string;
  mode?: string;
  description?: string;
}

const columns: Column<ItemRow>[] = [
  { key: "name", header: "Name" },
  { key: "hero", header: "Hero", render: (i) => i.hero ?? "—" },
  { key: "mode", header: "Mode", render: (i) => i.mode ?? "—" },
  { key: "description", header: "Description", render: (i) => i.description ?? "" },
];

export default function ItemsIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data, loading, error } = useData(async () => {
    const ids = await listDirectory(game!, "items");
    const items = await Promise.all(
      ids.map(async (id) => {
        const file = await getFile<ItemRow>(`data/${game!}/items/${id}.json`);
        return file?.content ?? null;
      })
    );
    return { items: items.filter(Boolean) as ItemRow[], game: game! };
  }, [game]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{data.game} Items</h1>
        <Link to={`/${data.game}/items/new`}>
          <Button>New Item</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data.items} baseUrl={`/${data.game}/items`} />
    </div>
  );
}
