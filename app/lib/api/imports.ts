import { SourceError } from "../importer/fetch-source";
import { githubRepo } from "../importer/repo";
import { ImportError, dismissDraft, previewImport, publishDraft, runImport } from "../importer/run";
import { pushAfterWrite } from "../push";

import { pushEnv, type ApiContext } from "./env";
import { SAVE_BODY_LIMIT, STATUS, fieldsOf, isJsonObject, json, readJsonBody } from "./http";
import { purgePaths } from "./purge";
import { requireAuth } from "./session";

/** An id sent as text; anything else is "", which the importer refuses as an id. */
function idText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** POST imports/{action}: the ids as text, the job or record as sent. */
function importRequest(body: unknown) {
  const fields = fieldsOf(body);
  return {
    game: idText(fields.game),
    jobId: idText(fields.jobId),
    id: idText(fields.id),
    job: fields.job,
    record: isJsonObject(fields.record) ? fields.record : {},
    notify: fields.notify,
  };
}

type ImportBody = ReturnType<typeof importRequest>;

async function publish(context: ApiContext, body: ImportBody): Promise<Response> {
  const { record } = body;
  const path = await publishDraft(githubRepo(context.env), body.game, body.jobId, record);
  purgePaths(context, [path]);
  const push = await pushAfterWrite({ path, content: record, notify: body.notify }, pushEnv(context.env));
  return json({ ok: true, path, ...(push && { push }) });
}

/** Each import action's work, by its name in the path. */
const ACTIONS: Partial<Record<string, (context: ApiContext, body: ImportBody) => Promise<Response>>> = {
  preview: async (context, body) => json(await previewImport({ repo: githubRepo(context.env), game: body.game, job: body.job })),
  run: async (context, body) => json(await runImport({ repo: githubRepo(context.env), game: body.game, jobId: body.jobId })),
  publish,
  dismiss: async (context, body) => {
    await dismissDraft(githubRepo(context.env), body.game, body.jobId, body.id);
    return json({ ok: true });
  },
};

// Import jobs (app/lib/importer): preview a mapping, run a job now, and the
// reviewer's answers to a draft. Each write is one commit; a published record
// refreshes the mobile caches like any other save.
export async function handleImport(context: ApiContext, action: string): Promise<Response> {
  await requireAuth(context);
  const body = importRequest(await readJsonBody(context.request, SAVE_BODY_LIMIT));
  const work = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
  try {
    return work ? await work(context, body) : json({ error: "Not found" }, STATUS.notFound);
  } catch (error) {
    if (error instanceof ImportError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof SourceError) {
      return json({ error: error.message }, STATUS.badGateway);
    }
    throw error;
  }
}
