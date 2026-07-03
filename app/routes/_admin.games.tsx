import { Link } from "react-router";
import { listGames } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";

export default function GamesList() {
  const { data, loading, error } = useData(async () => {
    const games = await listGames();
    return { games };
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading games</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Games</h1>
        <Link to="/games/new">
          <Button>Add Game</Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.games.map((game) => (
          <Card key={game.slug}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{game.name}</h2>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${game.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {game.active ? "Active" : "Inactive"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-2">Slug: <code className="text-gray-700 dark:text-gray-300">{game.slug}</code></p>
              {game.developer && <p className="text-sm text-gray-500">{game.developer}</p>}
              <div className="mt-3">
                <Link to={`/games/${game.slug}/edit`} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">
                  Edit
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
