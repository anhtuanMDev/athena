import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { DataTableSkeleton } from "~/components/DataTableSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import { Plus } from "lucide-react";

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

  if (error) return (
    <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400">
      Error loading items data.
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">{game} Items</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage equipment and consumables.</p>
        </div>
        <Link to={`/${game}/items/new`}>
          <Button className="gap-2 shadow-lg shadow-violet-500/20 transition-all hover:shadow-violet-500/40">
            <Plus className="w-4 h-4" />
            New Item
          </Button>
        </Link>
      </div>

      {loading ? (
        <DataTableSkeleton columns={4} rows={10} />
      ) : data ? (
        <DataTable columns={columns} data={data.items} baseUrl={`/${data.game}/items`} />
      ) : null}
    </div>
  );
}
