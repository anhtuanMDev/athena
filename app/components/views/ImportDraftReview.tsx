import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FormProvider } from "react-hook-form";
import { ArrowLeft, ExternalLink, Inbox } from "lucide-react";
import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { useToast } from "~/components/ToastProvider";
import { RecordFields, compact, useRecordForm } from "~/components/views/SchemaRecordForm";
import { getFile } from "~/lib/github";
import { dismissImport, publishImport, type ImportDraft } from "~/lib/imports";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import type { CronJob } from "~/schemas/cron";
import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** One imported draft, edited in the job schema's own form and published as a record. */
export default function ImportDraftReview() {
  const { game, "*": splat } = useParams();
  assertSafeGameSlug(game!);
  const [, jobId, , draftId] = (splat ?? "").split("/");
  const navigate = useNavigate();
  const backToJob = () => navigate(`/${game}/cron/${jobId}`);

  const { data, loading, error } = useData(async () => {
    const job = await getFile<CronJob>(`data/${game}/cron_jobs/${jobId}.json`);
    if (!job) throw new Error("Import job not found.");
    const [schema, draft] = await Promise.all([
      getFile<DynamicSchemaFile>(`data/${game}/schemas/${job.content.schema_id}.json`),
      getFile<ImportDraft>(`data/${game}/imports/${jobId}/${draftId}.json`),
    ]);
    if (!schema) throw new Error("The job's schema was not found.");
    if (!draft) throw new Error("This draft was already published or dismissed.");
    return { job: job.content, fields: schema.content.fields, draft: draft.content };
  }, [game, jobId, draftId], "ImportDraftReview");

  if (loading) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-64 bg-border rounded-lg"></div>
        <div className="h-96 bg-border rounded-xl"></div>
      </div>
    );
  }
  if (error) return <LoadErrorState title="Can't Open This Draft" error={error} onBack={backToJob} />;
  if (!data) return null;

  return (
    <DraftForm
      game={game!}
      jobId={jobId}
      jobName={data.job.name}
      fields={data.fields}
      draft={data.draft}
      onDone={backToJob}
    />
  );
}

function DraftForm({
  game,
  jobId,
  jobName,
  fields,
  draft,
  onDone,
}: {
  game: string;
  jobId: string;
  jobName: string;
  fields: DynamicField[];
  draft: ImportDraft;
  onDone: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [busy, setBusy] = useState<"publish" | "dismiss" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const draftId = String(draft.record.id);
  const methods = useRecordForm(fields, draft.record);

  async function publish(values: Record<string, unknown>) {
    setBusy("publish");
    setSubmitError(null);
    try {
      const { path } = await publishImport(game, jobId, compact(values));
      toastSuccess(`Published ${path.split("/").pop()?.replace(".json", "")}; it's in the app now.`);
      onDone();
    } catch (err) {
      setSubmitError((err as Error).message);
      toastError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    try {
      await dismissImport(game, jobId, draftId);
      toastSuccess("Draft dismissed; later runs won't bring it back.");
      onDone();
    } catch (err) {
      toastError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="w-full py-8 pb-32">
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(publish)} className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={onDone}
                className="flex items-center text-sm font-medium text-ink-muted hover:text-ink transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to {jobName}
              </button>
              <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
                <Inbox className="w-8 h-8 text-orange-500" />
                Review Draft
              </h1>
              <p className="text-sm text-ink-muted mt-2">
                Fetched {new Date(draft.source.fetched_at).toLocaleString()} from{" "}
                <a
                  href={draft.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline hover:text-ink"
                >
                  {hostOf(draft.source.url)}
                  <ExternalLink className="w-3 h-3" aria-hidden />
                </a>
                . Nothing is in the app until you publish.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" onClick={dismiss} disabled={busy !== null}>
                {busy === "dismiss" ? "Dismissing..." : "Dismiss"}
              </Button>
              <Button type="submit" disabled={busy !== null} className="shadow-lg px-8">
                {busy === "publish" ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>

          {draft.problems.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50">
              <h2 className="font-bold mb-2">Flagged when it was imported</h2>
              <ul className="list-disc pl-5 space-y-1">
                {draft.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {submitError && (
            <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
              {submitError}
            </div>
          )}

          <RecordFields
            fields={fields}
            game={game}
            idHelp="The file name in the app's data; can't change after publishing."
            action="publishing"
          />
        </form>
      </FormProvider>
    </div>
  );
}
