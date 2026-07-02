import { Link } from "react-router";
import type { Route } from "./+types/_admin.$game.patches._index";
import { listDirectory, getFile } from "~/lib/github.server";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";

interface PatchRow {
  patch: string;
  date: string;
  summary?: string;
  changes?: unknown[];
}

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  const ids = await listDirectory(params.game, "patches");
  ids.sort().reverse();
  const patches = await Promise.all(
    ids.map(async (id) => {
      const file = await getFile<PatchRow>(`data/${params.game}/patches/${id}.json`);
      return file?.content ?? null;
    })
  );
  return { patches: patches.filter(Boolean) as PatchRow[], game: params.game };
}

const columns: Column<PatchRow>[] = [
  { key: "patch", header: "Patch" },
  { key: "date", header: "Date" },
  { key: "summary", header: "Summary" },
  { key: "changes", header: "Changes", render: (p) => `${p.changes?.length ?? 0} change(s)` },
];

export default function PatchesIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{loaderData.game} Patches</h1>
        <Link to={`/${loaderData.game}/patches/new`}>
          <Button>New Patch</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={loaderData.patches} baseUrl={`/${loaderData.game}/patches`} idKey="patch" emptyMessage="No patches yet." />
    </div>
  );
}
