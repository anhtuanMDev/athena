import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { DataTableSkeleton } from "~/components/DataTableSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";

interface HeroRow {
  id: string;
  name: string;
  roles: string[];
  difficulty?: number;
  tags?: string[];
}

const columns: Column<HeroRow>[] = [
  { key: "name", header: "Name" },
  { key: "roles", header: "Roles", render: (h) => h.roles?.join(", ") ?? "" },
  { key: "difficulty", header: "Difficulty" },
  { key: "tags", header: "Tags", render: (h) => h.tags?.join(", ") ?? "" },
];

export default function HeroesIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data: heroes, loading, error } = useEntityList<HeroRow>(game!, "heroes");

  if (error) return (
    <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400">
      Error loading heroes data.
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">{game} Heroes</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage the hero roster, stats, and abilities.</p>
        </div>
        <Link to={`/${game}/heroes/new`}>
          <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
            <Plus className="w-4 h-4" />
            New Hero
          </Button>
        </Link>
      </div>

      {loading ? (
        <DataTableSkeleton columns={5} rows={8} />
      ) : heroes ? (
        <DataTable columns={columns} data={heroes} baseUrl={`/${game}/heroes`} />
      ) : null}
    </div>
  );
}
