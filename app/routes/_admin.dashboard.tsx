import { getDashboardData } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Link } from "react-router";
import { useData } from "~/lib/use-data";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

async function fetchDashboardData() {
  return await getDashboardData();
}

export default function Dashboard() {
  const { data, loading, error } = useData(fetchDashboardData, [], "dashboard");

  if (loading) return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-border rounded animate-pulse motion-reduce:animate-none" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse motion-reduce:animate-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="h-6 w-32 bg-border rounded" />
                <div className="h-5 w-16 bg-border rounded-full" />
              </div>
              <div className="h-4 w-24 bg-border rounded mt-2" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="h-5 w-16 bg-border rounded" />
                <div className="h-5 w-16 bg-border rounded" />
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-4 w-12 bg-border rounded" />
                <div className="h-4 w-12 bg-border rounded" />
                <div className="h-4 w-12 bg-border rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
  if (error) return (
    <LoadErrorState
      title="Failed to Load Dashboard"
      error={error}
      onBack={() => window.history.back()}
    />
  );
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.games.map((game) => (
          <Card key={game.slug}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink" style={game.primary ? { color: game.primary } : {}}>{game.name}</h2>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${game.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {game.active ? "Active" : "Inactive"}
                </span>
              </div>
              {game.developer && <p className="text-sm text-ink-muted">{game.developer}</p>}
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="font-semibold text-ink">{game.heroCount}</span>
                  <span className="text-ink-muted ml-1">heroes</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">{game.patchCount}</span>
                  <span className="text-ink-muted ml-1">patches</span>
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
