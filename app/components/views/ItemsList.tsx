import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { ButtonLink } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

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
      <LoadErrorState
        title="Failed to Load Items"
        error={error}
        onBack={() => window.history.back()}
      />
    );

  if (loading) return <EntityListSkeleton columns={4} rows={10} />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink capitalize tracking-tight">
            {game} Items
          </h1>
          <p className="text-ink-muted mt-1">
            Manage equipment and consumables.
          </p>
        </div>
        <ButtonLink to={`/${game}/items/new`}>
            <Plus aria-hidden="true" className="w-4 h-4" />
            New Item
          </ButtonLink>
      </div>

      {items ? (
        <DataTable columns={columns} data={items} baseUrl={`/${game}/items`} />
      ) : null}
    </div>
  );
}
