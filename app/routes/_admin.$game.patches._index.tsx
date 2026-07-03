import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";

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

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{data.game} Patches</h1>
        <Link to={`/${data.game}/patches/new`}>
          <Button>New Patch</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data.patches} baseUrl={`/${data.game}/patches`} idKey="patch" emptyMessage="No patches yet." />
    </div>
  );
}
