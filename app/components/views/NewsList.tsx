import { Link, useParams } from "react-router";
import { Newspaper } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { ButtonLink } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { listDirectory } from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";

interface NewsRecord {
  id: string;
  title?: string;
  published_at?: string;
  summary?: string;
}

/** News articles, newest first; most arrive through an import job's review queue. */
export default function NewsList() {
  const { game } = useParams();
  assertSafeGameSlug(game!);

  const { data, loading, error } = useData(async () => {
    const records = await listDirectory<NewsRecord>(game!, "news", true);
    return records
      .filter((r) => r && typeof r.id === "string")
      .sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")));
  }, [game], "NewsList");

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse motion-reduce:animate-none">
        <div className="h-8 w-48 bg-border rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-border rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) return <LoadErrorState title="Failed to Load News" error={error} onBack={() => window.history.back()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink capitalize flex items-center gap-2">
          <Newspaper className="w-6 h-6 text-orange-500" />
          News - {game}
        </h1>
        <ButtonLink to={`/${game}/news/new`}>New Article</ButtonLink>
      </div>

      {!data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Newspaper className="w-8 h-8 text-ink-muted mb-4" />
            <h3 className="text-lg font-semibold text-ink">No News Yet</h3>
            <p className="text-sm text-ink-muted mt-2 mb-4 max-w-md">
              Add an article here, or let an import job bring them in: new articles wait in the job&apos;s review queue
              until you publish them.
            </p>
            <ButtonLink to={`/${game}/cron`}>Open Cron Jobs</ButtonLink>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((article) => (
            <li key={article.id}>
              <Link
                to={`/${game}/news/${article.id}`}
                className="block p-4 bg-surface rounded-xl border border-border hover:border-border-strong transition-colors"
              >
                <p className="font-semibold text-ink">{article.title || article.id}</p>
                <p className="text-xs text-ink-muted font-mono mt-1">
                  {article.published_at ?? "No date"} · {article.id}
                </p>
                {article.summary && <p className="text-sm text-ink-muted mt-2 line-clamp-2">{article.summary}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
