import { Card, CardContent } from "~/components/ui/card";
import { useData } from "~/lib/use-data";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EmptyState } from "~/components/ui/EmptyState";

interface Commit { sha: string; message: string; date: string; url: string; }

async function fetchCommits() {
  const res = await fetch("/api/data/commits");
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized: Session expired");
  }
  const data: { commits: Commit[]; error: string | null } = await res.json();
  return data;
}

export default function Activity() {
  const { data, loading } = useData(fetchCommits, [], "_admin.activity-13");

  if (loading) return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-3 w-1/4 bg-gray-200 dark:bg-gray-800 rounded" />
              </div>
              <div className="h-4 w-10 bg-gray-200 dark:bg-gray-800 rounded ml-4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  if (data?.error) return (
    <LoadErrorState
      title="Failed to Load Activity"
      error={data.error}
      onBack={() => window.history.back()}
    />
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity</h1>
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
          <div className="py-8">
            <EmptyState 
              title="No Activity Found"
              description="There are no recent commits or activities in the repository."
            />
          </div>
        )}
      </div>
    </div>
  );
}
