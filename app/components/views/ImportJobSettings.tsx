import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { previewImport, type PreviewItem } from "~/lib/imports";
import type { CronJob, FieldRule } from "~/schemas/cron";
import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** The settings an import job's form edits; name and id stay with the form. */
export type JobSettings = Pick<
  CronJob,
  "schema_id" | "api_endpoint" | "source_format" | "items_path" | "id_from" | "max_items" | "schedule" | "active" | "field_mappings"
>;

export const DEFAULT_SETTINGS: JobSettings = {
  schema_id: "",
  api_endpoint: "",
  source_format: "html",
  items_path: "",
  id_from: "",
  max_items: 10,
  schedule: "manual",
  active: true,
  field_mappings: {},
};

/** A saved job's settings, with defaults for settings it predates. */
export function settingsOf(job: Partial<CronJob>): JobSettings {
  return {
    schema_id: job.schema_id ?? "",
    api_endpoint: job.api_endpoint ?? "",
    source_format: job.source_format ?? "json",
    items_path: job.items_path ?? "",
    id_from: job.id_from ?? "",
    max_items: job.max_items ?? 10,
    schedule: job.schedule ?? "manual",
    active: job.active ?? true,
    field_mappings: job.field_mappings ?? {},
  };
}

const UNMAPPABLE = new Set(["abilities", "weapon"]);

/** Only rules for the schema's fields, without empty ones. */
export function pruneMappings(schema: DynamicSchemaFile, mappings: Record<string, FieldRule>): Record<string, FieldRule> {
  const pruned: Record<string, FieldRule> = {};
  for (const field of schema.fields) {
    const rule = mappings[field.key];
    if (typeof rule === "string" && rule.trim()) pruned[field.key] = rule.trim();
    if (rule && typeof rule === "object" && rule.each.trim()) {
      const subKeys = new Set((field.subFields ?? []).map((f) => f.key));
      const fields = Object.fromEntries(
        Object.entries(rule.fields)
          .filter(([key, value]) => subKeys.has(key) && value.trim())
          .map(([key, value]) => [key, value.trim()]),
      );
      pruned[field.key] = { each: rule.each.trim(), fields };
    }
  }
  return pruned;
}

const inputClass =
  "block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors";
const labelClass = "block text-sm font-bold text-ink mb-2";

interface Props {
  game: string;
  /** The job's id, or the one it will get, so the preview can tell what's already imported. */
  jobId: string;
  schemas: DynamicSchemaFile[];
  value: JobSettings;
  onChange: (next: JobSettings) => void;
}

export function ImportJobSettings({ game, jobId, schemas, value, onChange }: Props) {
  const schema = schemas.find((s) => s.id === value.schema_id);
  const set = <K extends keyof JobSettings>(key: K, next: JobSettings[K]) => onChange({ ...value, [key]: next });
  const html = value.source_format === "html";
  const idFields = schema?.fields.filter((f) => f.type === "string" || f.type === "number") ?? [];

  return (
    <>
      <Card className="border-orange-500/20 shadow-sm">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelClass} htmlFor="job-schema">Target Schema</label>
              <select
                id="job-schema"
                value={value.schema_id}
                onChange={(e) => set("schema_id", e.target.value)}
                className={inputClass}
                required
              >
                <option value="" disabled>Select a schema…</option>
                {schemas.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="job-schedule">Schedule</label>
              <select
                id="job-schedule"
                value={value.schedule}
                onChange={(e) => set("schedule", e.target.value as JobSettings["schedule"])}
                className={inputClass}
              >
                <option value="manual">Manual Trigger Only</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>

          <fieldset>
            <legend className={labelClass}>Source</legend>
            <div className="inline-flex rounded-lg border border-border-strong p-1 gap-1" role="radiogroup">
              {(["html", "json"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  role="radio"
                  aria-checked={value.source_format === format}
                  onClick={() => set("source_format", format)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                    value.source_format === format ? "bg-orange-500 text-white" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {format === "html" ? "Web page (HTML)" : "API (JSON)"}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelClass} htmlFor="job-url">{html ? "Page URL" : "API Endpoint URL"}</label>
              <input
                id="job-url"
                value={value.api_endpoint}
                onChange={(e) => set("api_endpoint", e.target.value)}
                placeholder={html ? "https://overwatch.blizzard.com/en-us/news/patch-notes/" : "https://api.example.com/data"}
                className={inputClass}
                type="url"
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="job-items">{html ? "Item selector (CSS)" : "Items path (JSON)"}</label>
              <input
                id="job-items"
                value={value.items_path}
                onChange={(e) => set("items_path", e.target.value)}
                placeholder={html ? ".PatchNotes-patch" : "data.items (empty for the whole response)"}
                className={`${inputClass} font-mono`}
                required={html}
              />
              <p className="text-xs text-ink-muted mt-1">
                {html ? "Each element it matches becomes one draft." : "An array: each element becomes one draft."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelClass} htmlFor="job-id-from">Record id comes from</label>
              <select
                id="job-id-from"
                value={value.id_from}
                onChange={(e) => set("id_from", e.target.value)}
                className={inputClass}
                disabled={!schema}
                required
              >
                <option value="" disabled>{schema ? "Select a field…" : "Select a schema first"}</option>
                {idFields.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <p className="text-xs text-ink-muted mt-1">Turned into a slug; items whose id already exists are skipped.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="job-max">New drafts per run, at most</label>
              <input
                id="job-max"
                type="number"
                min={1}
                max={50}
                value={value.max_items}
                onChange={(e) => set("max_items", Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="active"
              checked={value.active}
              onChange={(e) => set("active", e.target.checked)}
              className="w-5 h-5 rounded border-border-strong text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="active" className="text-sm font-bold text-ink cursor-pointer">
              Job is Active
            </label>
          </div>
        </CardContent>
      </Card>

      {schema && (
        <FieldMappings
          schema={schema}
          html={html}
          mappings={value.field_mappings}
          onChange={(field_mappings) => set("field_mappings", field_mappings)}
        />
      )}

      {schema && <ImportPreview game={game} jobId={jobId} schema={schema} settings={value} />}
    </>
  );
}

function FieldMappings({
  schema,
  html,
  mappings,
  onChange,
}: {
  schema: DynamicSchemaFile;
  html: boolean;
  mappings: Record<string, FieldRule>;
  onChange: (next: Record<string, FieldRule>) => void;
}) {
  const setRule = (key: string, rule: FieldRule) => onChange({ ...mappings, [key]: rule });
  const example = (f: DynamicField) =>
    f.options?.length ? `=${f.options[0]}` : html ? (f.type === "string" ? ".title" : ".value") : `data.${f.key}`;

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h2 className="text-xl font-bold text-ink tracking-tight">Field Mapping</h2>
        <p className="text-sm text-ink-muted mt-2">
          Where each field of <strong>{schema.name}</strong> comes from, inside one item.{" "}
          {html ? (
            <>A CSS selector reads its text (<code>.date</code>); <code>a@href</code> reads an attribute; <code>.</code> is the item itself.</>
          ) : (
            <>A dot path reads a value (<code>stats.health</code>, <code>tags[0]</code>).</>
          )}{" "}
          <code>=Live</code> is a constant. Add <code>| date</code>, <code>| slug</code>, <code>| number</code>, <code>| lower</code> or{" "}
          <code>| upper</code> to transform. Leave a field empty to fill it in during review.
        </p>
      </div>

      <div className="space-y-4">
        {schema.fields.map((field) => {
          const rule = mappings[field.key];
          return (
            <div key={field.key} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-surface rounded-xl border border-border shadow-sm">
              <div className="flex flex-col justify-center">
                <span className="font-bold text-ink">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                </span>
                <span className="text-xs text-ink-muted font-mono mt-1">
                  {field.key} ({field.type})
                </span>
                {field.options?.length ? (
                  <span className="text-xs text-ink-muted mt-1">Options: {field.options.join(", ")}</span>
                ) : null}
              </div>
              {UNMAPPABLE.has(field.type) ? (
                <p className="text-sm text-ink-muted self-center">Filled in during review; this field type isn't imported yet.</p>
              ) : field.type === "object_array" ? (
                <div className="space-y-2">
                  <input
                    aria-label={`Each entry of ${field.label}`}
                    value={typeof rule === "object" ? rule.each : ""}
                    onChange={(e) =>
                      setRule(field.key, { each: e.target.value, fields: typeof rule === "object" ? rule.fields : {} })
                    }
                    placeholder={html ? "Each entry: ul li" : "Each entry: changes"}
                    className={`${inputClass} font-mono`}
                  />
                  {(field.subFields ?? []).map((sub) => (
                    <div key={sub.key} className="flex items-center gap-2 pl-3 border-l-2 border-border">
                      <span className="text-xs text-ink-muted w-32 shrink-0 truncate" title={sub.label}>{sub.label}</span>
                      <input
                        aria-label={`${sub.label} in ${field.label}`}
                        value={typeof rule === "object" ? rule.fields[sub.key] ?? "" : ""}
                        onChange={(e) =>
                          setRule(field.key, {
                            each: typeof rule === "object" ? rule.each : "",
                            fields: { ...(typeof rule === "object" ? rule.fields : {}), [sub.key]: e.target.value },
                          })
                        }
                        placeholder={html ? "e.g. ." : `e.g. ${sub.key}`}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <input
                  aria-label={`Source for ${field.label}`}
                  value={typeof rule === "string" ? rule : ""}
                  onChange={(e) => setRule(field.key, e.target.value)}
                  placeholder={`e.g. ${example(field)}`}
                  className={`${inputClass} font-mono self-center`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS: Record<PreviewItem["status"], { label: string; className: string }> = {
  new: { label: "New", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  draft: { label: "In review", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  published: { label: "Published", className: "bg-surface-raised text-ink-muted" },
  dismissed: { label: "Dismissed", className: "bg-surface-raised text-ink-muted" },
  duplicate: { label: "Duplicate", className: "bg-surface-raised text-ink-muted" },
  invalid: { label: "No id", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

/** What a run would import right now, with this (possibly unsaved) mapping. */
function ImportPreview({ game, jobId, schema, settings }: { game: string; jobId: string; schema: DynamicSchemaFile; settings: JobSettings }) {
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; items: PreviewItem[]; total: number }
  >({ status: "idle" });
  const titleField = schema.fields.find((f) => f.type === "string" && f.key !== settings.id_from)?.key;

  async function run() {
    setState({ status: "loading" });
    try {
      const result = await previewImport(game, {
        ...settings,
        id: jobId,
        field_mappings: pruneMappings(schema, settings.field_mappings),
      });
      setState({ status: "done", ...result });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">Preview</h2>
          <p className="text-sm text-ink-muted mt-1">Fetches the source and maps it with the settings above. Nothing is saved.</p>
        </div>
        <Button type="button" variant="outline" onClick={run} disabled={state.status === "loading" || !settings.api_endpoint}>
          {state.status === "loading" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
          Preview
        </Button>
      </div>

      {state.status === "error" && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
          {state.message}
        </div>
      )}

      {state.status === "done" && (
        <div className="space-y-3" aria-live="polite">
          <p className="text-sm text-ink">
            Found <strong>{state.total}</strong> item{state.total === 1 ? "" : "s"}
            {state.total > state.items.length ? `, showing the first ${state.items.length}` : ""};{" "}
            <strong>{state.items.filter((i) => i.status === "new").length}</strong> would become drafts
            {settings.max_items < state.items.filter((i) => i.status === "new").length ? ` (${settings.max_items} per run)` : ""}.
          </p>
          {state.items.map((item, index) => (
            <details key={`${item.id ?? "no-id"}-${index}`} className="rounded-xl border border-border bg-surface p-4">
              <summary className="flex flex-wrap items-center gap-3 cursor-pointer list-none">
                <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${STATUS[item.status].className}`}>
                  {STATUS[item.status].label}
                </span>
                <span className="font-semibold text-ink">{String((titleField && item.record[titleField]) ?? item.id ?? "Untitled")}</span>
                <span className="font-mono text-xs text-ink-muted">{item.id ?? "—"}</span>
                {item.problems.length > 0 && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    {item.problems.length} to check
                  </span>
                )}
              </summary>
              {item.problems.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
                  {item.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-surface-raised p-3 text-xs text-ink">
                {JSON.stringify(item.record, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
