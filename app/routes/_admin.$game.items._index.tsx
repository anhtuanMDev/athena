import { Link } from "react-router";
import type { Route } from "./+types/_admin.$game.items._index";
import { listDirectory, getFile } from "~/lib/github.server";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";

interface ItemRow {
  id: string;
  name: string;
  hero?: string;
  mode?: string;
  description?: string;
}

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  const ids = await listDirectory(params.game, "items");
  const items = await Promise.all(
    ids.map(async (id) => {
      const file = await getFile<ItemRow>(`data/${params.game}/items/${id}.json`);
      return file?.content ?? null;
    })
  );
  return { items: items.filter(Boolean) as ItemRow[], game: params.game };
}

const columns: Column<ItemRow>[] = [
  { key: "name", header: "Name" },
  { key: "hero", header: "Hero", render: (i) => i.hero ?? "—" },
  { key: "mode", header: "Mode", render: (i) => i.mode ?? "—" },
  { key: "description", header: "Description", render: (i) => i.description ?? "" },
];

export default function ItemsIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{loaderData.game} Items</h1>
        <Link to={`/${loaderData.game}/items/new`}>
          <Button>New Item</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={loaderData.items} baseUrl={`/${loaderData.game}/items`} />
    </div>
  );
}
