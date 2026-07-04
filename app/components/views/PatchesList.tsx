import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { DataTableSkeleton } from "~/components/DataTableSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import { Plus } from "lucide-react";

interface PatchRow {
  patch: string;
  date: string;
  summary?: string;
  changes?: unknown[];
}

const columns: Column<PatchRow>[] = [
  { key: "patch", header: "Patch" },
  { key: "date", header: "Date" },
  { key: "summary", header: "Summary" },
  { key: "changes", header: "Changes", render: (p) => `${p.changes?.length ?? 0} change(s)` },
];

export default function PatchesIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data, loading, error } = useData(async () => {
    const ids = await listDirectory(game!, "patches");
    ids.sort().reverse();
    const patches = await Promise.all(
      ids.map(async (id) => {
        const file = await getFile<PatchRow>(`data/${game!}/patches/${id}.json`);
        return file?.content ?? null;
      })
    );
    return { patches: patches.filter(Boolean) as PatchRow[], game: game! };
  }, [game]);

  if (error) return (
    <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400">
      Error loading patches data.
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">{game} Patches</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage patch notes and balance changes.</p>
        </div>
        <Link to={`/${game}/patches/new`}>
          <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
            <Plus className="w-4 h-4" />
            New Patch
          </Button>
        </Link>
      </div>

      {loading ? (
        <DataTableSkeleton columns={5} rows={6} />
      ) : data ? (
        <DataTable columns={columns} data={data.patches} baseUrl={`/${data.game}/patches`} idKey="patch" emptyMessage="No patches yet." />
      ) : null}
    </div>
  );
}
