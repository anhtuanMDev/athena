import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
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
  { key: "hero", header: "Hero", render: (i) => i.hero ?? "-" },
  { key: "mode", header: "Mode", render: (i) => i.mode ?? "-" },
  {
    key: "description",
    header: "Description",
    render: (i) => i.description ?? "",
  },
];

export default function ItemsIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const {
    data: items,
    loading,
    error,
  } = useEntityList<ItemRow>(game!, "items");

  if (error)
    return (
      <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400">
        Error loading items data.
      </div>
    );

  if (loading) return <EntityListSkeleton columns={4} rows={10} />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
            {game} Items
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage equipment and consumables.
          </p>
        </div>
        <Link to={`/${game}/items/new`}>
          <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
            <Plus className="w-4 h-4" />
            New Item
          </Button>
        </Link>
      </div>

      {items ? (
        <DataTable columns={columns} data={items} baseUrl={`/${game}/items`} />
      ) : null}
    </div>
  );
}
