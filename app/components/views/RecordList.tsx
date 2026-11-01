import { Link, useParams } from "react-router";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { ButtonLink } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { listDirectory } from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { dateField, recordListOrder, summaryField, titleField } from "~/lib/screen-model";
import { useCategories } from "~/lib/categories-context";
import { useData } from "~/lib/use-data";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/**
 * The records of a category without a form of its own (news, patches, items),
 * newest first when its schema has a date; many arrive through an import
 * job's review queue.
 */
export default function RecordList({ category, noun, icon: Icon }: { category: string; noun: string; icon: LucideIcon }) {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { folder, label } = useCategories().find((c) => c.category === category)!;

  const { data, loading, error } = useData(async () => {
    const [schemas, records] = await Promise.all([
      listDirectory<DynamicSchemaFile>(game!, "schemas", true),
      listDirectory<Record<string, unknown>>(game!, folder, true),
    ]);
    const fields = schemas.filter((s) => s?.category === category).flatMap((s) => s.fields ?? []);
    return {
      records: recordListOrder(records.filter((r) => r && typeof r.id === "string"), fields),
      title: titleField(fields),
      date: dateField(fields),
      summary: summaryField(fields),
    };
  }, [game, category], "RecordList");

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
  if (error) return <LoadErrorState title={`Failed to Load ${label}`} error={error} onBack={() => window.history.back()} />;

  const text = (record: Record<string, unknown>, key: string | undefined) =>
    key && typeof record[key] === "string" ? (record[key] as string) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink capitalize flex items-center gap-2">
          <Icon className="w-6 h-6 text-orange-500" />
          {label} - {game}
        </h1>
        <ButtonLink to={`/${game}/${folder}/new`}>New {noun}</ButtonLink>
      </div>

      {!data || data.records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Icon className="w-8 h-8 text-ink-muted mb-4" />
            <h3 className="text-lg font-semibold text-ink">No {label} Yet</h3>
            <p className="text-sm text-ink-muted mt-2 mb-4 max-w-md">
              Add one here, or let an import job bring them in: new records wait in the job&apos;s review queue until
              you publish them.
            </p>
            <ButtonLink to={`/${game}/cron`}>Open Cron Jobs</ButtonLink>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.records.map((record) => {
            const id = record.id as string;
            const summary = text(record, data.summary);
            return (
              <li key={id}>
                <Link
                  to={`/${game}/${folder}/${id}`}
                  className="block p-4 bg-surface rounded-xl border border-border hover:border-border-strong transition-colors"
                >
                  <p className="font-semibold text-ink">{text(record, data.title) || id}</p>
                  <p className="text-xs text-ink-muted font-mono mt-1">
                    {data.date ? `${text(record, data.date) ?? "No date"} · ` : ""}
                    {id}
                  </p>
                  {summary && <p className="text-sm text-ink-muted mt-2 line-clamp-2">{summary}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
