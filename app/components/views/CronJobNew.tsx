import { ArrowLeft, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { createFile, getFile, listDirectory } from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { CronJobSchema } from "~/schemas/cron";
import { type DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { CronJobInstructions } from "~/components/views/CronJobInstructions";
import {
  DEFAULT_SETTINGS,
  ImportJobSettings,
  pruneMappings,
  type JobSettings,
} from "~/components/views/ImportJobSettings";

const jobIdFor = (name: string) =>
  `cron-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

export default function CronJobNew() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [schemas, setSchemas] = useState<DynamicSchemaFile[]>([]);
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<JobSettings>(DEFAULT_SETTINGS);

  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSchemas() {
      try {
        const loadedSchemas = await listDirectory<DynamicSchemaFile>(
          game!,
          "schemas",
          true,
        );
        setSchemas(loadedSchemas);
      } catch (e) {
        console.error("Failed to load schemas", e);
      }
    }
    loadSchemas();
  }, [game]);

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setCommitError(null);

    if (!name.trim()) {
      setCommitError("Name is required.");
      setSubmitting(false);
      return;
    }

    const selectedSchema = schemas.find((s) => s.id === settings.schema_id);
    if (!selectedSchema) {
      setCommitError("Please select a valid schema.");
      toastError("Please select a valid schema.");
      setSubmitting(false);
      return;
    }

    const parsed = CronJobSchema.safeParse({
      ...settings,
      id: jobIdFor(name),
      name: name.trim(),
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
      const exists = await getFile(
        `data/${game}/cron_jobs/${parsed.data.id}.json`,
      );
      if (exists) {
        setCommitError(
          `A cron job with ID "${parsed.data.id}" already exists.`,
        );
        toastError("A cron job with this ID already exists.");
        setSubmitting(false);
        return;
      }

      await createFile(
        `data/${game}/cron_jobs/${parsed.data.id}.json`,
        parsed.data,
        `Add cron job: ${parsed.data.name}`,
      );
      toastSuccess(`Cron Job ${parsed.data.name} created successfully!`);
      navigate(`/${game}/cron/${parsed.data.id}`);
    } catch (err) {
      setCommitError((err as Error).message);
      toastError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full py-8 pb-32">
      <form onSubmit={handleCommit} className="space-y-8">
            {/* Top Actions */}
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg">
                {submitting ? "Creating..." : "Create Cron Job"}
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
              New Cron Job - <span className="capitalize">{game}</span>
            </h1>
          </div>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

        <CronJobInstructions />

        <Card className="border-orange-500/20 shadow-sm">
          <CardContent className="p-6 md:p-8">
            <label className="block text-sm font-bold text-ink mb-2" htmlFor="job-name">
              Cron Job Name
            </label>
            <input
              id="job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Overwatch Patch Notes"
              className="block w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
              required
            />
          </CardContent>
        </Card>

        <ImportJobSettings
          game={game!}
          jobId={name.trim() ? jobIdFor(name) : "new-job"}
          schemas={schemas}
          value={settings}
          onChange={setSettings}
        />
      </form>
    </div>
  );
}
