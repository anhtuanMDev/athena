/**
 * The admin's calls to the import endpoints (functions/api, app/lib/importer).
 */
import { api } from "~/lib/github";
import type { CronJob } from "~/schemas/cron";
import type { ImportState, PreviewItem } from "~/lib/importer/run";
import type { PushResult } from "~/lib/push";

export type { ImportDraft, ImportState, PreviewItem } from "~/lib/importer/run";

export function previewImport(game: string, job: Partial<CronJob>) {
  return api<{ items: PreviewItem[]; total: number }>("POST", "imports/preview", { game, job });
}

export function runImport(game: string, jobId: string) {
  return api<NonNullable<ImportState["last_result"]>>("POST", "imports/run", { game, jobId });
}

export function publishImport(game: string, jobId: string, record: Record<string, unknown>, notify: boolean) {
  return api<{ ok: true; path: string; push?: PushResult }>("POST", "imports/publish", { game, jobId, record, ...(notify && { notify: true }) });
}

export function dismissImport(game: string, jobId: string, id: string) {
  return api<{ ok: true }>("POST", "imports/dismiss", { game, jobId, id });
}
