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

import { useMemo } from "react";

const baseColumns: Column<any>[] = [
  {
    key: "portrait",
    header: "Portrait",
    render: (h) => (
      <div className="flex gap-2">
        {h.portrait && typeof h.portrait === "object" ? (
          Object.entries(h.portrait).map(([key, url]) => (
            <div
              key={key}
              className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shrink-0 relative group"
              title={key}
            >
              <img
                src={url as string}
                alt={`${h.name} ${key}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 items-center justify-center text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 hidden group-hover:flex transition-opacity uppercase tracking-wider">
                {key}
              </div>
            </div>
          ))
        ) : h.portrait && typeof h.portrait === "string" ? (
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shrink-0">
            <img
              src={h.portrait}
              alt={h.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shrink-0 flex items-center justify-center text-gray-400 font-bold text-xs">
            ?
          </div>
        )}
      </div>
    ),
  },
  { key: "name", header: "Name" },
];

export default function HeroesIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const {
    data: heroes,
    loading,
    error,
  } = useEntityList<HeroRow>(game!, "heroes");

  if (error)
    return (
      <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400">
        Error loading heroes data.
      </div>
    );

  const columns = useMemo(() => {
    if (!heroes || heroes.length === 0) return baseColumns;

    // Auto-detect columns based on the first hero's keys
    // Exclude standard keys and complex objects
    const exclude = [
      "id",
      "name",
      "game",
      "kit",
      "weapon",
      "abilities",
      "schema_id",
      "real_name",
      "bio",
      "portrait",
    ];

    // We scan all heroes to find up to 3 valid scalar/array keys
    const dynamicKeys = new Set<string>();
    for (const h of heroes) {
      for (const k of Object.keys(h)) {
        if (!exclude.includes(k)) {
          const val = (h as any)[k];
          if (
            typeof val === "string" ||
            typeof val === "number" ||
            typeof val === "boolean" ||
            Array.isArray(val)
          ) {
            dynamicKeys.add(k);
          }
        }
      }
    }

    const cols = [...baseColumns];
    Array.from(dynamicKeys)
      .slice(0, 3)
      .forEach((k) => {
        cols.push({
          key: k,
          header: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "),
          render: (h) => {
            const val = (h as any)[k];
            if (Array.isArray(val)) return val.join(", ");
            if (typeof val === "boolean") return val ? "Yes" : "No";
            return val != null ? String(val) : "";
          },
        });
      });

    return cols;
  }, [heroes]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
            {game} Heroes
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage the hero roster, stats, and abilities.
          </p>
        </div>
        <Link to={`/${game}/heroes/new`}>
          <Button className="gap-2 shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/40">
            <Plus className="w-4 h-4" />
            New Hero
          </Button>
        </Link>
      </div>

      {loading ? (
        <DataTableSkeleton columns={6} rows={8} />
      ) : heroes ? (
        <DataTable
          columns={columns}
          data={heroes}
          baseUrl={`/${game}/heroes`}
        />
      ) : null}
    </div>
  );
}
