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
  mode_name?: string;
  objective_type?: string;
  team_size?: number;
  status?: string;
  win_condition?: string;
  map_layout_type?: string;
}

const columns: Column<ModeRow>[] = [
  { key: "name", header: "Name", render: (m) => m.name || m.mode_name || m.id },
  { key: "status", header: "Status", render: (m) => m.status ? <span className="capitalize px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-xs">{m.status}</span> : '-' },
  { key: "objective_type", header: "Objective", render: (m) => m.objective_type ? <span className="capitalize">{m.objective_type}</span> : '-' },
  { key: "map_layout_type", header: "Map Layout", render: (m) => m.map_layout_type ? <span className="capitalize">{m.map_layout_type}</span> : '-' },
  { key: "team_size", header: "Team Size", render: (m) => m.team_size ? `${m.team_size}v${m.team_size}` : '-' },
  { key: "win_condition", header: "Win Condition", render: (m) => m.win_condition ?? "-" },
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
