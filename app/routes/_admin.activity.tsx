import { Card, CardContent } from "~/components/ui/card";
import { useData } from "~/lib/use-data";

interface Commit { sha: string; message: string; date: string; url: string; }

async function fetchCommits() {
  const res = await fetch("/api/data/commits");
  const data: { commits: Commit[]; error: string | null } = await res.json();
  return data;
}

export default function Activity() {
  const { data, loading } = useData(fetchCommits);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity</h1>
      {data?.error && (
        <Card>
          <CardContent><p className="text-sm text-red-500">{data.error}</p></CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {data?.commits.map((commit) => (
          <Card key={commit.sha}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{commit.message}</p>
                <p className="text-xs text-gray-500">{new Date(commit.date).toLocaleString()}</p>
              </div>
              <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0 ml-4">View</a>
            </CardContent>
          </Card>
        ))}
        {data && data.commits.length === 0 && !data.error && (
          <p className="text-sm text-gray-500">No commits found.</p>
        )}
      </div>
    </div>
  );
}
