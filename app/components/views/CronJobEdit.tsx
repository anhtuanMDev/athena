import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { CronJobSchema, type CronJob } from "~/schemas/cron";
import { type DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { getFile, updateFile, listDirectory, isConflictError } from "~/lib/github";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Clock, ArrowLeft } from "lucide-react";
import { useToast } from "~/components/ToastProvider";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

export default function CronJobEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const { data: loaderData, loading, error: loadError } = useData(async () => {
    if (!id) throw new Error("Cron Job ID missing");
    const [cronFile, schemaFiles, syncFile] = await Promise.all([
      getFile<CronJob>(`data/${game}/cron_jobs/${id}.json`),
      listDirectory<DynamicSchemaFile>(game!, "schemas", true),
      getFile<any>(`data/${game}/syncs/${id}.json`).catch(() => null)
    ]);
    if (!cronFile) throw new Error("Cron Job not found");
    return { cron: cronFile.content, sha: cronFile.sha, schemas: schemaFiles, sync: syncFile?.content };
  }, [game, id], "CronJobEdit-20");

  const [apiEndpoint, setApiEndpoint] = useState("");
  const [schemaId, setSchemaId] = useState("");
  const [schedule, setSchedule] = useState("manual");
  const [active, setActive] = useState(true);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string> | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData && fieldMappings === null) {
      setApiEndpoint(loaderData.cron.api_endpoint);
      setSchemaId(loaderData.cron.schema_id);
      setSchedule(loaderData.cron.schedule || "manual");
      setActive(loaderData.cron.active ?? true);
      setFieldMappings(loaderData.cron.field_mappings || {});
    }
  }, [loaderData, fieldMappings]);

  // When schema changes, update field mappings keys without losing existing mapped values
  useEffect(() => {
    if (loaderData && schemaId && fieldMappings !== null) {
      const schema = loaderData.schemas.find(s => s.id === schemaId);
      if (schema) {
        const newMappings = { ...fieldMappings };
        // Add new keys that might have been introduced in the schema
        schema.fields.forEach(f => {
          if (newMappings[f.key] === undefined) {
            newMappings[f.key] = "";
          }
        });
        // We do not remove old keys here to prevent data loss when switching briefly
        setFieldMappings(newMappings);
      }
    }
  }, [schemaId, loaderData]);

  const handleMappingChange = (key: string, value: string) => {
    setFieldMappings(prev => ({ ...prev, [key]: value }));
  };

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!loaderData || !fieldMappings) return;
    setSubmitting(true);
    setCommitError(null);

    const selectedSchema = loaderData.schemas.find((s) => s.id === schemaId);
    if (!selectedSchema) {
      setCommitError("Please select a valid schema.");
      toastError("Please select a valid schema.");
      setSubmitting(false);
      return;
    }

    let prunedMappings = fieldMappings;
    
    // Prune orphaned keys before saving
    if (selectedSchema) {
      const validKeys = new Set(selectedSchema.fields.map((f) => f.key));
      prunedMappings = {};
      for (const [key, value] of Object.entries(fieldMappings)) {
        if (validKeys.has(key)) {
          prunedMappings[key] = value;
        }
      }
    }

    const updatedCron = {
      ...loaderData.cron,
      schema_id: schemaId,
      category: selectedSchema?.category,
      api_endpoint: apiEndpoint,
      schedule: schedule as any,
      active,
      field_mappings: prunedMappings,
    };

    const parsed = CronJobSchema.safeParse(updatedCron);
    if (!parsed.success) {
      setCommitError("Validation failed. Please check your inputs.");
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

  if (loading) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
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
  if (!loaderData || !fieldMappings) return null;

  const selectedSchema = loaderData.schemas.find(s => s.id === schemaId);

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
              Edit Cron Job: {loaderData.cron.name}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/cron`)}>
              Discard Changes
            </Button>
            <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20 px-8">
              {submitting ? "Saving..." : "Save Cron Job"}
            </Button>
          </div>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

        {loaderData.sync && (
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-2">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">Latest Worker Sync Status</h3>
            {loaderData.sync.last_sync && (
              <p className="text-sm text-green-700 dark:text-green-400">
                <strong>Successful Sync:</strong> {new Date(loaderData.sync.last_sync).toLocaleString()}
              </p>
            )}
            {loaderData.sync.last_error && (
              <div className="text-sm text-red-700 dark:text-red-400">
                <strong>Error:</strong> {loaderData.sync.last_error}
                <p className="opacity-75 text-xs mt-1">
                  Attempted: {new Date(loaderData.sync.last_sync_attempt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Basic Settings Section */}
        <Card className="border-orange-500/20 shadow-sm">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <option value="" disabled>Select a schema...</option>
                  {loaderData.schemas.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
                </select>
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

            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
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
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input 
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 dark:border-gray-700 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="active" className="text-sm font-bold text-gray-900 dark:text-gray-100 cursor-pointer">
                Job is Active
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Schema Field Mappings Section */}
        {selectedSchema && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">API Data Mapping</h2>
            </div>
            <p className="text-sm text-gray-500">
              Define the JSON path from the API response that maps to each field in the <strong>{selectedSchema.name}</strong> schema.
            </p>

            <div className="space-y-4">
              {selectedSchema.fields.map((field) => (
                <div key={field.key} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                  <div className="flex flex-col justify-center">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{field.label}</span>
                    <span className="text-xs text-gray-500 font-mono mt-1">{field.key} ({field.type})</span>
                  </div>
                  <div>
                    <input 
                      value={fieldMappings[field.key] || ""} 
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
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
