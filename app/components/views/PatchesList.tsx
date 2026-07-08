import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

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
  const { data: patchesData, loading, error } = useEntityList<PatchRow>(game!, "patches");
  const patches = patchesData ? [...patchesData].sort((a, b) => b.patch.localeCompare(a.patch)) : null;

  if (error) return (
    <LoadErrorState
      title="Failed to Load Patches"
      error={error}
      onBack={() => window.history.back()}
    />
  );

  
  if (loading) return <EntityListSkeleton columns={5} rows={6} />;
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

      {patches ? (
        <DataTable columns={columns} data={patches} baseUrl={`/${game}/patches`} idKey="patch" emptyMessage="No patches yet." />
      ) : null}
    </div>
  );
}
