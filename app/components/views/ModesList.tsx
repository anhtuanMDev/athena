import { Link, useParams } from "react-router";
import { useEntityList, useEnumOptions } from "~/lib/use-entity-list";
import { findEnumOption, type EnumOptionView } from "~/lib/enum-options";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton, LIST_SKELETONS } from "~/components/views/ViewSkeletons";
import { ButtonLink } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

// Keys of the mode schema (mode-base-game-mode-attributes). Its objective_type
// field is bound to the map-types enum (globalEnumId), as the map schema's
// map_type is: the column shows the option's name, as the app does.
const OBJECTIVE_ENUM = "map-types";

interface ModeRow {
  id: string;
  name: string;
  objective_type?: string;
  team_count?: number;
  team_size?: number;
}

// Until the enum is read (or if it can't be), an objective shows as its id.
const columns = (objectives: EnumOptionView[]): Column<ModeRow>[] => [
  { key: "name", header: "Name", render: (m) => m.name || m.id },
  { key: "objective_type", header: "Objective", render: (m) => m.objective_type ? findEnumOption(objectives, m.objective_type)?.name ?? <span className="capitalize">{m.objective_type}</span> : '-' },
  { key: "team_count", header: "Teams", render: (m) => m.team_count ?? "-" },
  { key: "team_size", header: "Team Size", render: (m) => m.team_size ? `${m.team_size}v${m.team_size}` : '-' },
];

export default function ModesIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data: modes, loading, error } = useEntityList<ModeRow>(game!, "modes", "summary");
  const objectives = useEnumOptions(game!, OBJECTIVE_ENUM);

  if (error) return (
    <LoadErrorState
      title="Failed to Load Modes"
      error={error}
      onBack={() => window.history.back()}
    />
  );

  
  if (loading) return <EntityListSkeleton {...LIST_SKELETONS.modes} />;
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
        <DataTable columns={columns(objectives)} data={modes} baseUrl={`/${game}/modes`} />
      ) : null}
    </div>
  );
}
