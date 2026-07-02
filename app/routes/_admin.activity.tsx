import type { Route } from "./+types/_admin.activity";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { getEnv } from "~/lib/env.server";

export async function loader() {
  const token = getEnv("GITHUB_TOKEN");
  const owner = getEnv("GITHUB_OWNER") ?? "YOUR_ORG";
  const repo = getEnv("GITHUB_REPO") ?? "YOUR_REPO";

  if (!token) {
    return { commits: [], error: "GITHUB_TOKEN not configured" };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "athena-admin" } }
    );
    if (!response.ok) return { commits: [], error: `GitHub API returned ${response.status}` };
    const data = await response.json();
    const commits = Array.isArray(data) ? data.map((c: { sha: string; commit: { message: string; committer: { date: string } }; html_url: string }) => ({
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.committer.date,
      url: c.html_url,
    })) : [];
    return { commits, error: null };
  } catch (err) {
    return { commits: [], error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export default function Activity({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity</h1>
      {loaderData.error && (
        <Card>
          <CardContent><p className="text-sm text-red-500">{loaderData.error}</p></CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {loaderData.commits.map((commit) => (
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
        {loaderData.commits.length === 0 && !loaderData.error && (
          <p className="text-sm text-gray-500">No commits found.</p>
        )}
      </div>
    </div>
  );
}
