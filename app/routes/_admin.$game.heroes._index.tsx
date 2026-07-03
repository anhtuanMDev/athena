import { Link, useParams } from "react-router";
import { listDirectory, getFile } from "~/lib/github";
import { DataTable, type Column } from "~/components/DataTable";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";

interface HeroRow {
  id: string;
  name: string;
  roles: string[];
  difficulty?: number;
  tags?: string[];
}

const columns: Column<HeroRow>[] = [
  { key: "name", header: "Name" },
  { key: "roles", header: "Roles", render: (h) => h.roles?.join(", ") ?? "" },
  { key: "difficulty", header: "Difficulty" },
  { key: "tags", header: "Tags", render: (h) => h.tags?.join(", ") ?? "" },
];

export default function HeroesIndex() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data, loading, error } = useData(async () => {
    const ids = await listDirectory(game!, "heroes");
    const heroes = await Promise.all(
      ids.map(async (id) => {
        const file = await getFile<HeroRow>(`data/${game!}/heroes/${id}.json`);
        return file?.content ?? null;
      })
    );
    return { heroes: heroes.filter(Boolean) as HeroRow[], game: game! };
  }, [game]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{data.game} Heroes</h1>
        <Link to={`/${data.game}/heroes/new`}>
          <Button>New Hero</Button>
        </Link>
      </div>
      <DataTable columns={columns} data={data.heroes} baseUrl={`/${data.game}/heroes`} />
    </div>
  );
}
