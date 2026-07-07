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

export default function CronJobNew() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [schemas, setSchemas] = useState<DynamicSchemaFile[]>([]);
  const [selectedSchema, setSelectedSchema] =
    useState<DynamicSchemaFile | null>(null);

  const [name, setName] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [schemaId, setSchemaId] = useState("");
  const [schedule, setSchedule] = useState("manual");
  const [active, setActive] = useState(true);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(
    {},
  );

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

  useEffect(() => {
    if (schemaId) {
      const schema = schemas.find((s) => s.id === schemaId);
      setSelectedSchema(schema || null);
      if (schema) {
        const newMappings: Record<string, string> = {};
        schema.fields.forEach((f) => {
          newMappings[f.key] = fieldMappings[f.key] || "";
        });
        setFieldMappings(newMappings);
      }
    } else {
      setSelectedSchema(null);
      setFieldMappings({});
    }
  }, [schemaId, schemas]);

  const handleMappingChange = (key: string, value: string) => {
    setFieldMappings((prev) => ({ ...prev, [key]: value }));
  };

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setCommitError(null);

    if (!name.trim()) {
      setCommitError("Name is required.");
      setSubmitting(false);
      return;
    }

    const generatedId = `cron-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}`;

    const newCron = {
      id: generatedId,
      name: name.trim(),
      schema_id: schemaId,
      api_endpoint: apiEndpoint,
      schedule: schedule as any,
      active,
      field_mappings: fieldMappings,
    };

    const parsed = CronJobSchema.safeParse(newCron);
    if (!parsed.success) {
      setCommitError("Validation failed. Please check your inputs.");
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
      navigate(`/${game}/cron`);
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
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate(`/${game}/cron`)}
              className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Cron Jobs
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              <Clock className="w-8 h-8 text-orange-500" />
              New Cron Job - <span className="capitalize">{game}</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(`/${game}/cron`)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="shadow-lg shadow-orange-500/20 px-8"
            >
              {submitting ? "Creating..." : "Create Cron Job"}
            </Button>
          </div>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 text-yellow-800 dark:text-yellow-200 p-4 rounded-xl flex gap-3">
          <span className="text-xl">🚧</span>
          <p className="text-sm">
            <strong>Not yet wired up:</strong> Cron job configurations are currently saved to the database but are not yet executed by the worker. The worker's current implementation uses a hardcoded configuration.
          </p>
        </div>

        {/* Basic Settings Section */}
        <Card className="border-orange-500/20 shadow-sm">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Cron Job Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sync Heroes Daily"
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Target Schema
                </label>
                <select
                  value={schemaId}
                  onChange={(e) => setSchemaId(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  required
                >
                  <option value="" disabled>
                    Select a schema...
                  </option>
                  {schemas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  API Endpoint URL
                </label>
                <input
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="https://api.example.com/data"
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  type="url"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Schedule
                </label>
                <select
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                >
                  <option value="manual">Manual Trigger Only</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 dark:border-gray-700 text-orange-600 focus:ring-orange-500"
              />
              <label
                htmlFor="active"
                className="text-sm font-bold text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Job is Active
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Schema Field Mappings Section */}
        {selectedSchema && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                API Data Mapping
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              Define the JSON path from the API response that maps to each field
              in the <strong>{selectedSchema.name}</strong> schema.
            </p>

            <div className="space-y-4">
              {selectedSchema.fields.map((field) => (
                <div
                  key={field.key}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm"
                >
                  <div className="flex flex-col justify-center">
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {field.label}
                    </span>
                    <span className="text-xs text-gray-500 font-mono mt-1">
                      {field.key} ({field.type})
                    </span>
                  </div>
                  <div>
                    <input
                      value={fieldMappings[field.key] || ""}
                      onChange={(e) =>
                        handleMappingChange(field.key, e.target.value)
                      }
                      placeholder={`e.g. data.attributes.${field.key}`}
                      className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
