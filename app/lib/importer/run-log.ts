/**
 * What a scheduled import run left for later, per game and kind of run:
 * data/{game}/syncs/_run-{kind}.json, as { run, at, deferred, unchecked }.
 *
 * A run on the Workers Free plan has 50 subrequests. Jobs it has no room for
 * are "deferred"; job files it had no room even to read (through REST, one
 * request each) are "unchecked". Recording that in each job's state meant
 * reading the state first, a request per job; so through REST, from about 15
 * due jobs, recording the deferrals left no room to run any job, and from
 * about 18 some deferrals went only to the log. The run's log is written
 * without reading anything, in the run's own commit, so a deferral costs
 * nothing, and the admin shows it from there.
 *
 * Kinds of run each have their own file, so runs that start together (hourly
 * and daily at midnight) never write over each other's. A job's state is
 * syncs/{jobId}.json, and a job id can't hold "_" (JOB_ID in run.ts, and the
 * admin's form, schemas/cron.ts), so no state can be named like a log.
 */
import type { ImportState } from "./run";

export interface RunLog {
  /** The kind of run: hourly, daily, weekly, or manual (the worker's /trigger). */
  run: string;
  /** When the run started (ISO). */
  at: string;
  /** Due jobs it had no room to run: the next run of its kind takes them first. */
  deferred: string[];
  /** Job files it had no room to read, so it couldn't tell whether they were due: the next run reads them first. */
  unchecked: string[];
}

export const RUN_LOG_PREFIX = "_run-";

export function runLogPath(game: string, kind: string): string {
  return `data/${game}/syncs/${RUN_LOG_PREFIX}${kind}.json`;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** A run log as stored, or null when `raw` isn't one (a job's state, a hand-edited file). */
export function readRunLog(raw: unknown): RunLog | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { run, at, deferred, unchecked } = raw as Record<string, unknown>;
  if (typeof run !== "string" || typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { run, at, deferred: strings(deferred), unchecked: strings(unchecked) };
}

/** Whether a log leaves anything for later. */
export const leavesAnything = (log: RunLog | null): boolean => !!log && log.deferred.length + log.unchecked.length > 0;

export interface PendingDeferral {
  run: string;
  at: string;
  why: "deferred" | "unchecked";
}

/**
 * What the admin shows of a job left for later: the newest log of a run of
 * its schedule (or a manual one) that left it, if that run came after the
 * job's last attempt. A later run of the job, or "Run now", replaces it; an
 * inactive job has nothing pending.
 */
export function pendingDeferral(
  job: { id: string; schedule?: string; active?: boolean },
  state: Pick<ImportState, "last_sync_attempt"> | null | undefined,
  logs: RunLog[],
): PendingDeferral | undefined {
  if (job.active === false) return undefined;
  const after = state?.last_sync_attempt ? Date.parse(state.last_sync_attempt) : -Infinity;
  let found: PendingDeferral | undefined;
  for (const log of logs) {
    if (log.run !== job.schedule && log.run !== "manual") continue;
    const why = log.deferred.includes(job.id) ? "deferred" : log.unchecked.includes(job.id) ? "unchecked" : null;
    if (!why || !(Date.parse(log.at) > after)) continue;
    if (!found || Date.parse(log.at) > Date.parse(found.at)) found = { run: log.run, at: log.at, why };
  }
  return found;
}

/** The sentence the admin shows for a pending deferral; `when` formats the run's start. */
export function deferralText(pending: PendingDeferral, when: (iso: string) => string): string {
  const run = `the ${pending.run} run`;
  return pending.why === "deferred"
    ? `Deferred by ${run} of ${when(pending.at)}: it had no subrequests left for this job. The next ${pending.run} run takes it first.`
    : `Not checked by ${run} of ${when(pending.at)}: it had no subrequests left to read this job. The next ${pending.run} run reads it first.`;
}
