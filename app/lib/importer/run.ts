/**
 * What an import job does to the data repository. Under data/{game}/:
 *
 *   cron_jobs/{job}.json      the job
 *   imports/{job}/{id}.json   drafts waiting for review ({ record, source, problems })
 *   syncs/{job}.json          the job's state: its last run, and ids a reviewer dismissed
 *   {folder}/{id}.json        published records, in the schema category's folder
 *
 * A run only ever adds drafts for ids that aren't published, drafted or
 * dismissed yet; nothing reaches the app until a reviewer publishes it.
 */
import type { CronJob } from "../../schemas/cron";
import type { DynamicField, DynamicSchemaFile } from "../../schemas/dynamic-schema";
import { ENTITY_TYPES } from "../safe-path";
import { fetchSource } from "./fetch-source";
import { RECORD_ID, mapDocument, missingRequired, type MappedItem } from "./map";
import type { DataRepo, FileChange } from "./repo";

export interface ImportDraft {
  record: Record<string, unknown>;
  source: { job: string; url: string; fetched_at: string };
  problems: string[];
}

export interface ImportState {
  id: string;
  last_sync?: string;
  last_sync_attempt?: string;
  last_error?: string;
  last_result?: { found: number; added: number; skipped: number };
  dismissed?: string[];
}

export type ItemStatus = "new" | "published" | "draft" | "dismissed" | "duplicate" | "invalid";
export interface PreviewItem extends MappedItem {
  status: ItemStatus;
}

/** A request that can't be carried out as asked; `status` is the HTTP status to answer. */
export class ImportError extends Error {
  name = "ImportError";
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const GAME_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const JOB_ID = /^[a-z0-9-]{1,80}$/;
const MAX_DISMISSED = 500;
const PREVIEW_ITEMS = 20;

const CATEGORY_FOLDERS: Record<string, string> = {
  hero: "heroes",
  map: "maps",
  mode: "modes",
  patch: "patches",
  item: "items",
};

export function assertImportIds(game: string, jobId: string, id?: string): void {
  if (!GAME_SLUG.test(game)) throw new ImportError("Invalid game.");
  if (!JOB_ID.test(jobId)) throw new ImportError("Invalid job id.");
  if (id !== undefined && !RECORD_ID.test(id)) throw new ImportError("Invalid record id.");
}

/** The folder a job publishes into; only content folders, never schemas, screens or jobs. */
export function recordFolder(category: string): string {
  const folder = CATEGORY_FOLDERS[category];
  if (!folder || !(ENTITY_TYPES as readonly string[]).includes(folder)) {
    throw new ImportError(`Records of category "${category}" can't be imported.`);
  }
  return folder;
}

const paths = (game: string, jobId: string) => ({
  job: `data/${game}/cron_jobs/${jobId}.json`,
  drafts: `data/${game}/imports/${jobId}`,
  draft: (id: string) => `data/${game}/imports/${jobId}/${id}.json`,
  state: `data/${game}/syncs/${jobId}.json`,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * A job as the importer runs it, from a saved file or an unsaved form: the
 * settings it needs, checked, with the defaults of settings added after the
 * first jobs were saved.
 */
export function normalizeJob(input: unknown): CronJob {
  if (!isPlainObject(input)) throw new ImportError("Invalid import job.");
  const text = (key: string, fallback?: string): string => {
    const value = input[key] ?? fallback;
    if (typeof value !== "string") throw new ImportError(`The job's ${key} is missing.`);
    return value;
  };
  const mappings: CronJob["field_mappings"] = {};
  for (const [key, rule] of Object.entries(isPlainObject(input.field_mappings) ? input.field_mappings : {})) {
    if (typeof rule === "string") mappings[key] = rule;
    else if (isPlainObject(rule) && typeof rule.each === "string" && isPlainObject(rule.fields)) {
      const fields = Object.fromEntries(Object.entries(rule.fields).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      mappings[key] = { each: rule.each, fields };
    } else throw new ImportError(`The mapping for "${key}" is invalid.`);
  }
  const format = text("source_format", "json");
  if (format !== "json" && format !== "html") throw new ImportError("The source format must be JSON or HTML.");
  const maxItems = Number(input.max_items ?? 10);
  return {
    ...(input as CronJob),
    id: text("id"),
    schema_id: text("schema_id"),
    api_endpoint: text("api_endpoint"),
    source_format: format,
    items_path: text("items_path", ""),
    id_from: text("id_from", ""),
    max_items: Number.isInteger(maxItems) ? Math.min(Math.max(maxItems, 1), 50) : 10,
    field_mappings: mappings,
  };
}

/** A saved job and the schema it fills. */
export async function loadJob(repo: DataRepo, game: string, jobId: string): Promise<{ job: CronJob; schema: DynamicSchemaFile }> {
  assertImportIds(game, jobId);
  const saved = await repo.read(paths(game, jobId).job);
  if (!saved) throw new ImportError("Import job not found.", 404);
  const job = normalizeJob(saved);
  return { job, schema: await loadSchema(repo, game, job) };
}

export async function loadSchema(repo: DataRepo, game: string, job: Pick<CronJob, "schema_id">): Promise<DynamicSchemaFile> {
  if (!/^[a-z0-9-]+$/.test(job.schema_id)) throw new ImportError("Invalid schema id.");
  const schema = await repo.read<DynamicSchemaFile>(`data/${game}/schemas/${job.schema_id}.json`);
  if (!schema) throw new ImportError(`Schema "${job.schema_id}" not found.`, 404);
  return schema;
}

/** Which mapped items are new, given what is already published, drafted or dismissed. */
async function classify(repo: DataRepo, game: string, job: CronJob, schema: DynamicSchemaFile, items: MappedItem[]): Promise<PreviewItem[]> {
  const p = paths(game, job.id);
  const [published, drafted, state] = await Promise.all([
    repo.list(`data/${game}/${recordFolder(schema.category)}`),
    repo.list(p.drafts),
    repo.read<ImportState>(p.state),
  ]);
  const known = {
    published: new Set(published),
    draft: new Set(drafted),
    dismissed: new Set(state?.dismissed ?? []),
  };
  const seen = new Set<string>();
  return items.map((item) => {
    const status: ItemStatus = !item.id
      ? "invalid"
      : seen.has(item.id)
        ? "duplicate"
        : known.published.has(item.id)
          ? "published"
          : known.draft.has(item.id)
            ? "draft"
            : known.dismissed.has(item.id)
              ? "dismissed"
              : "new";
    if (item.id) seen.add(item.id);
    return { ...item, status };
  });
}

async function fetchAndMap(job: CronJob, schema: DynamicSchemaFile, fetcher?: typeof fetch): Promise<MappedItem[]> {
  const body = await fetchSource(job.api_endpoint, fetcher);
  try {
    return mapDocument(body, job, schema.fields ?? []);
  } catch (err) {
    throw new ImportError((err as Error).message);
  }
}

/** What a run of `job` would find, without writing anything. */
export async function previewImport(opts: {
  repo: DataRepo;
  game: string;
  job: unknown;
  fetcher?: typeof fetch;
}): Promise<{ items: PreviewItem[]; total: number }> {
  const { repo, game } = opts;
  const job = normalizeJob(opts.job);
  assertImportIds(game, job.id);
  const schema = await loadSchema(repo, game, job);
  const items = await classify(repo, game, job, schema, await fetchAndMap(job, schema, opts.fetcher));
  return { items: items.slice(0, PREVIEW_ITEMS), total: items.length };
}

/**
 * Fetches the source and adds a draft for each new item, up to the job's
 * limit, in one commit with the job's state. A failure is recorded in the
 * state and thrown.
 */
export async function runImport(opts: {
  repo: DataRepo;
  game: string;
  jobId: string;
  fetcher?: typeof fetch;
  now?: Date;
}): Promise<NonNullable<ImportState["last_result"]>> {
  const { repo, game, jobId } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const p = paths(game, jobId);
  const { job, schema } = await loadJob(repo, game, jobId);
  const previous = (await repo.read<ImportState>(p.state)) ?? { id: jobId };
  try {
    const items = await classify(repo, game, job, schema, await fetchAndMap(job, schema, opts.fetcher));
    const fresh = items.filter((item) => item.status === "new").slice(0, job.max_items);
    const result = { found: items.length, added: fresh.length, skipped: items.length - fresh.length };
    const drafts: FileChange[] = fresh.map((item) => ({
      path: p.draft(item.id!),
      content: {
        record: item.record,
        source: { job: job.id, url: job.api_endpoint, fetched_at: now },
        problems: item.problems,
      } satisfies ImportDraft,
    }));
    const state: ImportState = { ...previous, id: jobId, last_sync: now, last_sync_attempt: now, last_result: result };
    delete state.last_error;
    await repo.commit(
      [...drafts, { path: p.state, content: state }],
      fresh.length > 0 ? `Import ${fresh.length} draft(s) from ${job.id}` : `Import run: ${job.id} (nothing new)`,
    );
    return result;
  } catch (err) {
    const message = err instanceof Error && (err.name === "ImportError" || err.name === "SourceError") ? err.message : "The run failed unexpectedly.";
    const state: ImportState = { ...previous, id: jobId, last_sync_attempt: now, last_error: message };
    await repo.commit([{ path: p.state, content: state }], `Import run failed: ${job.id}`).catch(() => {});
    throw err instanceof ImportError ? err : new ImportError(message, 502);
  }
}

/** Drops a draft and remembers its id, so later runs don't bring it back. */
export async function dismissDraft(repo: DataRepo, game: string, jobId: string, id: string): Promise<void> {
  assertImportIds(game, jobId, id);
  const p = paths(game, jobId);
  const [draft, previous] = await Promise.all([repo.read<ImportDraft>(p.draft(id)), repo.read<ImportState>(p.state)]);
  const dismissed = [...(previous?.dismissed ?? []).filter((d) => d !== id), id].slice(-MAX_DISMISSED);
  await repo.commit(
    [...(draft ? [{ path: p.draft(id), content: null }] : []), { path: p.state, content: { ...previous, id: jobId, dismissed } }],
    `Dismiss import draft ${id} from ${jobId}`,
  );
}

/** Why `value` doesn't fit `field`, if it doesn't. */
function fieldProblem(field: DynamicField, value: unknown): string | undefined {
  const label = field.label || field.key;
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
  switch (field.type) {
    case "string":
    case "reference":
      return typeof value === "string" ? undefined : `${label} must be text.`;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : `${label} must be a number.`;
    case "boolean":
      return typeof value === "boolean" ? undefined : `${label} must be yes or no.`;
    case "enum":
      return typeof value === "string" && (!field.options?.length || field.options.includes(value))
        ? undefined
        : `${label} must be one of ${field.options?.join(", ")}.`;
    case "list":
    case "reference_list":
      if (!strings(value)) return `${label} must be a list of text.`;
      return field.options?.length && !(value as string[]).every((v) => field.options!.includes(v))
        ? `${label} has a value that isn't one of ${field.options.join(", ")}.`
        : undefined;
    case "object_array":
    case "abilities":
    case "weapon":
      if (!Array.isArray(value) || !value.every(isPlainObject)) return `${label} must be a list of entries.`;
      for (const row of value) {
        const problems = recordProblems(field.subFields ?? [], row, false);
        if (problems.length > 0) return `${label}: ${problems[0]}`;
      }
      return undefined;
  }
}

/** Everything wrong with `record` as a record of `fields`; empty when it can be published. */
export function recordProblems(fields: DynamicField[], record: Record<string, unknown>, withId = true): string[] {
  const allowed = new Set([...(withId ? ["id"] : []), ...fields.map((f) => f.key)]);
  const problems: string[] = [];
  if (withId && (typeof record.id !== "string" || !RECORD_ID.test(record.id))) problems.push("The record id is invalid.");
  for (const key of Object.keys(record)) if (!allowed.has(key)) problems.push(`"${key}" is not a field of this schema.`);
  problems.push(...missingRequired(fields, record));
  for (const field of fields) {
    const value = record[field.key];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    const problem = fieldProblem(field, value);
    if (problem) problems.push(problem);
  }
  return problems;
}

/**
 * Publishes a reviewed draft as a record, and drops the draft, in one commit.
 * Returns the record's path. Fails if the record breaks the schema or
 * already exists.
 */
export async function publishDraft(
  repo: DataRepo,
  game: string,
  jobId: string,
  record: Record<string, unknown>,
): Promise<string> {
  const id = typeof record.id === "string" ? record.id : "";
  assertImportIds(game, jobId, id);
  const { schema } = await loadJob(repo, game, jobId);
  const problems = recordProblems(schema.fields ?? [], record);
  if (problems.length > 0) throw new ImportError(problems.join(" "));
  const path = `data/${game}/${recordFolder(schema.category)}/${id}.json`;
  if (await repo.read(path)) throw new ImportError(`A record with the id "${id}" already exists.`, 409);
  const p = paths(game, jobId);
  const draft = await repo.read(p.draft(id));
  await repo.commit(
    [{ path, content: record }, ...(draft ? [{ path: p.draft(id), content: null }] : [])],
    `Publish ${id} from import ${jobId}`,
  );
  return path;
}
