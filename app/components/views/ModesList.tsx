import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

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
  const { data: modes, loading, error } = useEntityList<ModeRow>(game!, "modes");

  if (error) return (
    <LoadErrorState
      title="Failed to Load Modes"
      error={error}
      onBack={() => window.history.back()}
    />
  );

  
  if (loading) return <EntityListSkeleton columns={3} rows={6} />;
return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">{game} Modes</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage game modes, objectives, and rule sets.</p>
        </div>
        <Link to={`/${game}/modes/new`}>
          <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
            <Plus className="w-4 h-4" />
            New Mode
          </Button>
        </Link>
      </div>

      {modes ? (
        <DataTable columns={columns} data={modes} baseUrl={`/${game}/modes`} />
      ) : null}
    </div>
  );
}
