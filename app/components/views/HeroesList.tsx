import { Link, useParams } from "react-router";
import { useEntityList } from "~/lib/use-entity-list";
import { DataTable, type Column } from "~/components/DataTable";
import { EntityListSkeleton, LIST_SKELETONS } from "~/components/views/ViewSkeletons";
import { Button, ButtonLink } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus, Copy } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { useToast } from "~/components/ToastProvider";
import { listDirectory, listFolders } from "~/lib/github";
import { copyText } from "~/lib/clipboard";
import { useData } from "~/lib/use-data";
import { useCategories } from "~/lib/categories-context";
import { cellText, fieldOf, keyColumns, schemaColumns, schemaForRecord, type ColumnSchema } from "~/lib/record-columns";

interface HeroRow {
  id: string;
  name: string;
  roles: string[];
  difficulty?: number;
  tags?: string[];
}

import { useMemo, useState } from "react";

/** Keys the list shows otherwise, or that are too long for a cell, when the heroes' schema can't be read. */
const EXCLUDE = ["id", "name", "game", "kit", "weapon", "abilities", "schema_id", "real_name", "bio", "portrait"];
const headerOf = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

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
              className="w-10 h-10 rounded-full overflow-hidden bg-surface-raised border border-border shrink-0 relative group"
              title={key}
            >
              <img
                src={url as string}
                alt={`${h.name} ${key}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 items-center justify-center text-xs font-medium text-white opacity-0 group-hover:opacity-100 hidden group-hover:flex transition-opacity uppercase tracking-wider">
                {key}
              </div>
            </div>
          ))
        ) : h.portrait && typeof h.portrait === "string" ? (
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-raised border border-border shrink-0">
            <img
              src={h.portrait}
              alt={h.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-raised border border-border shrink-0 flex items-center justify-center text-ink-muted font-bold text-xs">
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
  const { success, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  // What the list shows of each hero (shape=summary): its lists of abilities,
  // perks and the like are most of a filled-in hero, and no cell shows them.
  const {
    data: heroes,
    loading,
    error,
  } = useEntityList<HeroRow>(game!, "heroes", "summary");
  const [copying, setCopying] = useState(false);
  // The list holds summaries, so "Copy JSON" reads the whole heroes when clicked.
  const copyHeroes = async () => {
    setCopying(true);
    try {
      await copyText(listDirectory<unknown>(game!, "heroes", true).then((all) => JSON.stringify(all.filter(Boolean), null, 2)));
      success("Heroes JSON copied to clipboard!");
    } catch {
      toastError("The heroes' JSON couldn't be copied. Try again.");
    } finally {
      setCopying(false);
    }
  };

  // The hero schemas and the game's enums, in one request (data/folders): the
  // columns are the schema's, and enum values show by name, as in the app.
  // Until they're read, or if they can't be, columns and values are as stored.
  const categories = useCategories();
  const category = categories.find((c) => c.folder === "heroes")?.category ?? "hero";
  const { data: shape } = useData(
    async () => {
      const { folders } = await listFolders(game!, ["schemas", "enums"]);
      return { schemas: folders.schemas as ColumnSchema[], enums: folders.enums };
    },
    [game],
    `${game}-heroes-list-schemas`,
  );

  const columns = useMemo(() => {
    if (!heroes || heroes.length === 0) return baseColumns;
    const rows = heroes as unknown as Record<string, unknown>[];
    const schemas = (shape?.schemas ?? []).filter((s) => s && typeof s === "object" && s.category === category);
    const fields = schemaColumns(schemas, rows);
    if (fields) {
      return [
        ...baseColumns,
        ...fields.map((field): Column<any> => ({
          key: field.key,
          header: field.label || headerOf(field.key),
          // A record of another schema reads the field as its own schema has it.
          render: (h) => cellText(fieldOf(schemaForRecord(h, schemas), field.key) ?? field, h[field.key], shape!.enums),
        })),
      ];
    }
    // No schema: the first keys the heroes hold, as before.
    return [
      ...baseColumns,
      ...keyColumns(rows, EXCLUDE).map((k): Column<any> => ({ key: k, header: headerOf(k), render: (h) => cellText(undefined, h[k], []) })),
    ];
  }, [heroes, shape, category]);

  if (error)
    return (
      <LoadErrorState
        title="Failed to Load Heroes"
        error={error}
        onBack={() => window.history.back()}
      />
    );

  if (loading) return <EntityListSkeleton {...LIST_SKELETONS.heroes} />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink capitalize tracking-tight">
            {game} Heroes
          </h1>
          <p className="text-ink-muted mt-1">
            Manage the hero roster, stats, and abilities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            disabled={copying}
            onClick={copyHeroes}
          >
            <Copy className="w-4 h-4" />
            Copy JSON
          </Button>
          <ButtonLink to={`/${game}/heroes/new`}>
              <Plus aria-hidden="true" className="w-4 h-4" />
              New Hero
            </ButtonLink>
        </div>
      </div>

      {heroes ? (
        <DataTable
          columns={columns}
          data={heroes}
          baseUrl={`/${game}/heroes`}
        />
      ) : null}
    </div>
  );
}
