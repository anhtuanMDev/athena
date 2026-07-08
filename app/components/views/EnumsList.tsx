import { Link, useParams } from "react-router";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { DataTable, type Column } from "~/components/DataTable";
import { useEntityList } from "~/lib/use-entity-list";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";
import type { GlobalEnum } from "~/schemas/enum";
import { EntityListSkeleton } from "~/components/views/EntityListSkeleton";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

export default function EnumsIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const {
    data: enums,
    loading,
    error,
  } = useEntityList<GlobalEnum>(game!, "enums");

  const columns: Column<GlobalEnum>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
    {
      key: "options",
      header: "Options Count",
      render: (item: GlobalEnum) => {
        return <span className="text-gray-500">{Array.isArray(item.options) ? item.options.length : 0} options</span>;
      }
    }
  ];

  if (error) {
    return (
      <LoadErrorState
        title="Failed to Load Enums"
        error={error}
        onBack={() => window.history.back()}
      />
    );
  }
  
  if (loading) {
    return <EntityListSkeleton columns={3} rows={5} />;
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
            Global Enums
          </h1>
          <Link to={`/${game}/enums/new`}>
            <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
              <Plus className="w-4 h-4" />
              New Enum
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns as any}
            data={enums || []}
            baseUrl={`/${game}/enums`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
