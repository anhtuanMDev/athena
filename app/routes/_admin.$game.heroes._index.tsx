import { Link } from "react-router";
import type { Route } from "./+types/_admin.$game.heroes._index";
import { listDirectory, getFile } from "~/lib/github.server";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";

interface HeroRow {
  id: string;
  name: string;
  roles: string[];
  difficulty?: number;
  tags?: string[];
}

export async function loader({ params }: Route.LoaderArgs) {
  const ids = await listDirectory(params.game, "heroes");
  const heroes = await Promise.all(
    ids.map(async (id) => {
      const file = await getFile<HeroRow>(`data/${params.game}/heroes/${id}.json`);
      return file?.content ?? null;
    })
  );
  return { heroes: heroes.filter(Boolean) as HeroRow[], game: params.game };
}

const columns: Column<HeroRow>[] = [
  { key: "name", header: "Name" },
  { key: "roles", header: "Roles", render: (h) => h.roles?.join(", ") ?? "" },
  { key: "difficulty", header: "Difficulty" },
  { key: "tags", header: "Tags", render: (h) => h.tags?.join(", ") ?? "" },
];

export default function HeroesIndex({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{loaderData.game} Heroes</h1>
        <Link to={`/${loaderData.game}/heroes/new`}>
          <Button>New Hero</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={loaderData.heroes} baseUrl={`/${loaderData.game}/heroes`} />
    </div>
  );
}
