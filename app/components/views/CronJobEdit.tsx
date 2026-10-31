import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { CronJobSchema, type CronJob } from "~/schemas/cron";
import { type DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { getFile, updateFile, listDirectory, isConflictError } from "~/lib/github";
import { dismissImport, runImport, type ImportDraft, type ImportState } from "~/lib/imports";
import { Button } from "~/components/ui/button";
import { clearDataCache, useData } from "~/lib/use-data";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Clock, ArrowLeft, Play, Loader2, Inbox } from "lucide-react";
import { useToast } from "~/components/ToastProvider";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { CronJobInstructions } from "~/components/views/CronJobInstructions";
import { ImportJobSettings, pruneMappings, settingsOf, type JobSettings } from "~/components/views/ImportJobSettings";

export default function CronJobEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const { data: loaderData, loading, error: loadError } = useData(async () => {
    if (!id) throw new Error("Cron Job ID missing");
    const [cronFile, schemaFiles, syncFile, drafts] = await Promise.all([
      getFile<CronJob>(`data/${game}/cron_jobs/${id}.json`),
      listDirectory<DynamicSchemaFile>(game!, "schemas", true),
      getFile<ImportState>(`data/${game}/syncs/${id}.json`).catch(() => null),
      listDirectory<ImportDraft>(game!, `imports/${id}`, true).catch(() => []),
    ]);
    if (!cronFile) throw new Error("Cron Job not found");
    // A hand-edited or half-written draft file shouldn't take the page down.
    const readable = drafts.filter((d) => typeof d?.record?.id === "string" && d.source && Array.isArray(d.problems));
    return { cron: cronFile.content, sha: cronFile.sha, schemas: schemaFiles, sync: syncFile?.content, drafts: readable };
  }, [game, id], "CronJobEdit-20");

  const [settings, setSettings] = useState<JobSettings | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData && settings === null) setSettings(settingsOf(loaderData.cron));
  }, [loaderData, settings]);

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!loaderData || !settings) return;
    setSubmitting(true);
    setCommitError(null);

    const selectedSchema = loaderData.schemas.find((s) => s.id === settings.schema_id);
    if (!selectedSchema) {
      setCommitError("Please select a valid schema.");
      toastError("Please select a valid schema.");
      setSubmitting(false);
      return;
    }

    const parsed = CronJobSchema.safeParse({
      ...loaderData.cron,
      ...settings,
      category: selectedSchema.category,
      field_mappings: pruneMappings(selectedSchema, settings.field_mappings),
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Please check your inputs.";
      setCommitError(`Validation failed: ${message}`);
      toastError("Validation failed.");
      setSubmitting(false);
      return;
    }

    try {
      await updateFile(`data/${game}/cron_jobs/${id}.json`, parsed.data, loaderData.sha, `Update cron job: ${id}`);
      toastSuccess(`Cron Job ${loaderData.cron.name} updated successfully!`);
      navigate(`/${game}/cron`);
    } catch (err) {
      if (isConflictError(err)) {
        setCommitError(err.message);
        toastError(err.message);
      } else {
        setCommitError((err as Error).message);
        toastError((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    try {
      const result = await runImport(game!, id!);
      toastSuccess(
        result.added > 0
          ? `Added ${result.added} draft${result.added === 1 ? "" : "s"} for review (${result.found} found).`
          : `Nothing new (${result.found} found).`,
      );
    } catch (err) {
      toastError((err as Error).message);
      clearDataCache(); // a failed run still records its error
    } finally {
      setRunning(false);
    }
  }

  async function handleDismiss(draftId: string) {
    setBusyDraft(draftId);
    try {
      await dismissImport(game!, id!, draftId);
      toastSuccess("Draft dismissed; later runs won't bring it back.");
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setBusyDraft(null);
    }
  }

  if (loading && !loaderData) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-64 bg-border rounded-lg"></div>
        <div className="h-32 bg-border rounded-xl"></div>
        <div className="h-64 bg-border rounded-xl"></div>
      </div>
    );
  }

  if (loadError) return (
    <LoadErrorState
      title="Failed to Load Cron Job"
      error={loadError}
      onBack={() => window.history.back()}
    />
  );
  if (!loaderData || !settings) return null;

  const { sync, drafts } = loaderData;
  const schema = loaderData.schemas.find((s) => s.id === settings.schema_id);
  const titleField = schema?.fields.find((f) => f.type === "string" && f.key !== settings.id_from)?.key;

  return (
    <div className="w-full py-8 pb-32">
      <form onSubmit={handleCommit} className="space-y-8">
            {/* Top Actions */}
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg">
                {submitting ? "Saving..." : "Save Cron Job"}
              </Button>
            </div>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate(`/${game}/cron`)}
              className="flex items-center text-sm font-medium text-ink-muted hover:text-ink transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Cron Jobs
            </button>
            <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
              <Clock className="w-8 h-8 text-orange-500" />
              Edit Cron Job: {loaderData.cron.name}
            </h1>
          </div>

          <Button type="button" variant="outline" onClick={handleRun} disabled={running} className="shrink-0 whitespace-nowrap">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run now
          </Button>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

        {sync && (sync.last_sync || sync.last_error) && (
          <div className="bg-surface-raised border border-border p-4 rounded-xl flex flex-col gap-2">
            <h3 className="font-bold text-ink text-sm">Latest Run</h3>
            {sync.last_sync && (
              <p className="text-sm text-green-700 dark:text-green-400">
                <strong>Succeeded:</strong> {new Date(sync.last_sync).toLocaleString()}
                {sync.last_result
                  ? ` — ${sync.last_result.found} found, ${sync.last_result.added} added for review`
                  : ""}
              </p>
            )}
            {sync.last_error && sync.last_sync_attempt && sync.last_sync_attempt !== sync.last_sync && (
              <div className="text-sm text-red-700 dark:text-red-400">
                <strong>Error:</strong> {sync.last_error}
                <p className="opacity-75 text-xs mt-1">
                  Attempted: {new Date(sync.last_sync_attempt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Review queue */}
        <section className="space-y-4" aria-labelledby="drafts-heading">
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <Inbox className="w-5 h-5 text-orange-500" />
            <h2 id="drafts-heading" className="text-xl font-bold text-ink tracking-tight">
              Waiting for Review ({drafts.length})
            </h2>
          </div>
          {drafts.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No drafts. New items land here after a run; nothing reaches the app until it's published.
            </p>
          ) : (
            <ul className="space-y-3">
              {drafts.map((draft) => {
                const draftId = String(draft.record.id);
                return (
                  <li key={draftId} className="flex flex-wrap items-center gap-3 p-4 bg-surface rounded-xl border border-border">
                    <div className="flex-1 min-w-48">
                      <p className="font-semibold text-ink">{String((titleField && draft.record[titleField]) ?? draftId)}</p>
                      <p className="text-xs text-ink-muted font-mono mt-1">
                        {draftId} · fetched {new Date(draft.source.fetched_at).toLocaleDateString()}
                      </p>
                      {draft.problems.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          {draft.problems.length} to check before publishing
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/${game}/cron/${id}/review/${draftId}`}
                      className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-deep"
                    >
                      Review
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleDismiss(draftId)}
                      disabled={busyDraft === draftId}
                    >
                      Dismiss
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <CronJobInstructions />

        <ImportJobSettings
          game={game!}
          jobId={id!}
          schemas={loaderData.schemas}
          value={settings}
          onChange={setSettings}
        />
      </form>
    </div>
  );
}
