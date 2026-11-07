import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deferralText, pendingDeferral, readRunLog, runLogPath, type RunLog } from "../app/lib/importer/run-log";
import { CronJobSchema } from "../app/schemas/cron";
import { assertImportIds } from "../app/lib/importer/run";

const log = (run: string, at: string, deferred: string[] = [], unchecked: string[] = []): RunLog => ({ run, at, deferred, unchecked });
const job = { id: "cron-news", schedule: "daily", active: true };

describe("a run's log", () => {
  it("sits beside the jobs' states, under a name no job id can have", () => {
    assert.equal(runLogPath("overwatch", "daily"), "data/overwatch/syncs/_run-daily.json");
    // States are syncs/{jobId}.json: the importer (JOB_ID) and the admin's form refuse "_".
    assert.throws(() => assertImportIds("overwatch", "_run-daily"), /Invalid job id/);
    assert.equal(CronJobSchema.shape.id.safeParse("_run-daily").success, false);
  });

  it("is read only from a file that is one, keeping only the job ids it lists", () => {
    assert.deepEqual(readRunLog({ run: "daily", at: "2026-11-07T00:00:00.000Z", deferred: ["a", 3, "b"], unchecked: "c" }), log("daily", "2026-11-07T00:00:00.000Z", ["a", "b"]));
    // A job's state, or something hand-edited, isn't a log.
    for (const raw of [{ id: "cron-news", last_sync: "2026-11-07T00:00:00.000Z" }, { run: "daily", at: "yesterday" }, null, [], "x"]) assert.equal(readRunLog(raw), null);
  });
});

describe("what the admin shows of a job a run left for later", () => {
  it("is the newest log of its schedule, or a manual run, that left it", () => {
    const logs = [log("daily", "2026-11-06T00:00:00.000Z", ["cron-news"]), log("manual", "2026-11-06T12:00:00.000Z", [], ["cron-news"]), log("hourly", "2026-11-07T00:00:00.000Z", ["cron-news"])];
    assert.deepEqual(pendingDeferral(job, undefined, logs), { run: "manual", at: "2026-11-06T12:00:00.000Z", why: "unchecked" });
  });

  it("is nothing once the job ran after it, or when the job is inactive", () => {
    const logs = [log("daily", "2026-11-07T00:00:00.000Z", ["cron-news"])];
    assert.deepEqual(pendingDeferral(job, { last_sync_attempt: "2026-11-06T00:00:05.000Z" }, logs), { run: "daily", at: "2026-11-07T00:00:00.000Z", why: "deferred" });
    assert.equal(pendingDeferral(job, { last_sync_attempt: "2026-11-07T00:00:05.000Z" }, logs), undefined);
    assert.equal(pendingDeferral({ ...job, active: false }, undefined, logs), undefined);
    assert.equal(pendingDeferral({ ...job, id: "other" }, undefined, logs), undefined);
  });

  it("says which run, when, and what happens next", () => {
    const when = (at: string) => at.slice(0, 10);
    assert.equal(
      deferralText({ run: "daily", at: "2026-11-07T00:00:00.000Z", why: "deferred" }, when),
      "Deferred by the daily run of 2026-11-07: it had no subrequests left for this job. The next daily run takes it first.",
    );
    assert.match(deferralText({ run: "daily", at: "2026-11-07T00:00:00.000Z", why: "unchecked" }, when), /^Not checked by the daily run of 2026-11-07: .* reads it first\.$/);
  });
});
