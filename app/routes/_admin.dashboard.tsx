import { listGames, listDirectory } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Link } from "react-router";
import { useData } from "~/lib/use-data";

async function fetchDashboardData() {
  const games = await listGames();
  const gameStats = await Promise.all(
    games.map(async (game) => {
      if (!game.active) return { ...game, heroCount: 0, patchCount: 0 };
      const heroes = await listDirectory(game.slug, "heroes");
      const patches = await listDirectory(game.slug, "patches");
      return { ...game, heroCount: heroes.length, patchCount: patches.length };
    })
  );
  return { games: gameStats };
}

export default function Dashboard() {
  const { data, loading, error } = useData(fetchDashboardData, [], "dashboard");

  if (loading) return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded-full" />
              </div>
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mt-2" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-800 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
  if (error) return <div>Error loading dashboard</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.games.map((game) => (
          <Card key={game.slug}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white" style={game.primaryColor ? { color: game.primaryColor } : {}}>{game.name}</h2>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${game.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {game.active ? "Active" : "Inactive"}
                </span>
              </div>
              {game.developer && <p className="text-sm text-gray-500">{game.developer}</p>}
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">{game.heroCount}</span>
                  <span className="text-gray-500 ml-1">heroes</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white">{game.patchCount}</span>
                  <span className="text-gray-500 ml-1">patches</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link to={`/${game.slug}/heroes`} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">Heroes</Link>
                <Link to={`/${game.slug}/patches`} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">Patches</Link>
                <Link to={`/${game.slug}/schemas`} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">Schemas</Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
