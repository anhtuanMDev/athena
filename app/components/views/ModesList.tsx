import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { ButtonLink } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

// Keys of the mode schema (mode-base-game-mode-attributes); objective_type is a
// map-types enum id, shown as stored.
interface ModeRow {
  id: string;
  name: string;
  objective_type?: string;
  team_count?: number;
  team_size?: number;
}

const columns: Column<ModeRow>[] = [
  { key: "name", header: "Name", render: (m) => m.name || m.id },
  { key: "objective_type", header: "Objective", render: (m) => m.objective_type ? <span className="capitalize">{m.objective_type}</span> : '-' },
  { key: "team_count", header: "Teams", render: (m) => m.team_count ?? "-" },
  { key: "team_size", header: "Team Size", render: (m) => m.team_size ? `${m.team_size}v${m.team_size}` : '-' },
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
          <h1 className="text-3xl font-bold text-ink capitalize tracking-tight">{game} Modes</h1>
          <p className="text-ink-muted mt-1">Manage game modes, objectives, and rule sets.</p>
        </div>
        <ButtonLink to={`/${game}/modes/new`}>
            <Plus aria-hidden="true" className="w-4 h-4" />
            New Mode
          </ButtonLink>
      </div>

      {modes ? (
        <DataTable columns={columns} data={modes} baseUrl={`/${game}/modes`} />
      ) : null}
    </div>
  );
}
