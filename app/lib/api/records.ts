import { gitBlobSha } from "../asset-headers";
import { RepoError, githubRepo } from "../importer/repo";
import { jsonFileText } from "../json-file";
import { MAX_PICTURE_BASE64, pictureProblem } from "../picture-rules";
import { pushAfterWrite } from "../push";
import { recordAssetDir, pictureRequest, saveRequest, type SaveRequest } from "../record-assets";
import { dataWriteProblems } from "../screen-policy";
import { isPictureToken, pictureToken } from "../session";

import { commitChecked } from "./commit";
import { pushEnv, type ApiContext } from "./env";
import { SAVE_BODY_LIMIT, STATUS, assertSafeFilePath, json, readJsonBody } from "./http";
import { purgePaths } from "./purge";
import { requireAuth } from "./session";

// A record's pictures, uploaded one by one, and the record saved with them in one commit.

const KIB = 1024;
const PICTURE_OVERHEAD_KIB = 16;

/** The most a picture upload's body may hold: a picture at its limit as base64, and where it goes. */
export const PICTURE_BODY_LIMIT = MAX_PICTURE_BASE64 + PICTURE_OVERHEAD_KIB * KIB;

export const PICTURE_TOO_LARGE = "The picture is over 2 MB; a picture can be at most 2 MB.";

/** What a record's save says when the record isn't as its editor loaded it, or the branch kept moving. */
const RECORD_CONFLICTS = {
  exists: "a record with this id already exists.",
  deleted: "the record was deleted since it was loaded.",
  modified: "the record was modified since it was loaded.",
  moving: "the data kept changing while saving. Save again.",
} as const;

// A picture for a record's save (app/lib/github.ts saveRecord), uploaded on its
// own before the save: GitHub keeps it as a blob, which commits nothing and
// moves no branch, so uploads can run side by side. (Contents API writes, one
// commit each, conflicted when made in parallel, and a save could fail with
// some of its pictures committed.) It must be a file of the record's own
// folder that passes the picture rules (app/lib/picture-rules.ts), checked from
// the base64 as sent: the file is never decoded here, GitHub decodes it. The
// token returned is the server's word for that blob at that path, which the
// save checks (handleSaveRecord). 1 GitHub request.
export async function handleUploadPicture(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const request = pictureRequest(await readJsonBody(context.request, PICTURE_BODY_LIMIT, PICTURE_TOO_LARGE));
  if (typeof request === "string") {
    return json({ error: request }, STATUS.badRequest);
  }
  assertSafeFilePath(request.path);
  const problem = pictureProblem(request.path, request.base64);
  if (problem) {
    return json({ error: problem.error }, problem.status);
  }
  try {
    const sha = await githubRepo(context.env).createBlob(request.base64);
    return json({ path: request.path, sha, token: await pictureToken(context.env.SESSION_SECRET, request.path, sha) });
  } catch (error) {
    if (error instanceof RepoError && error.status === STATUS.unprocessable) {
      return json({ error: `GitHub refused ${request.path}.` }, STATUS.badRequest);
    }
    throw error;
  }
}

/** Why a save can't go ahead: a picture not uploaded for its path, or a record its folder's checks refuse. */
async function saveProblem(context: ApiContext, request: SaveRequest, record: string): Promise<Response | null> {
  for (const path of [record, ...request.pictures.map((picture) => picture.path)]) {
    assertSafeFilePath(path);
  }
  const tokens = await Promise.all(request.pictures.map((picture) => isPictureToken(picture.token, context.env.SESSION_SECRET, picture.path, picture.sha)));
  const forged = request.pictures.find((_, i) => !tokens[i]);
  if (forged) {
    return json({ error: `${forged.path} wasn't uploaded for this path. Pick the picture again.` }, STATUS.badRequest);
  }
  if (request.content !== undefined) {
    const problems = dataWriteProblems(record, request.content, false);
    if (problems.length > 0) {
      return json({ error: `This file can't be saved: ${problems.join(" ")}` }, STATUS.badRequest);
    }
  }
  return null;
}

/** The commit of a record and its pictures, and the files of its folder it was made on; or why there's none. */
async function commitSave(context: ApiContext, request: SaveRequest, record: string) {
  const { game, folder, id, content, pictures } = request;
  const changes = [...(content === undefined ? [] : [{ path: record, content }]), ...pictures.map((picture) => ({ path: picture.path, blob: picture.sha }))];
  try {
    return await commitChecked(githubRepo(context.env), { path: record, sha: request.sha, reads: [recordAssetDir(game, folder, id)], changes, message: request.message });
  } catch (error) {
    if (error instanceof RepoError && error.status === STATUS.unavailable) {
      return json({ error: error.message }, STATUS.unavailable);
    }
    // A tree GitHub won't build: a picture's blob it doesn't have.
    if (error instanceof RepoError && error.status === STATUS.unprocessable) {
      return json({ error: "GitHub refused the save's pictures. Pick them again and save." }, STATUS.badRequest);
    }
    throw error;
  }
}

/** After the commit: the caches, the push, and the record's sha as committed. */
async function savedAnswer(context: ApiContext, request: SaveRequest, { record, saved }: { record: string; saved: { commit: string | null; files: Record<string, string> } }): Promise<Response> {
  const { content, pictures } = request;
  // Replaced pictures first: theirs are the copies that may be cached.
  const isReplaced = (path: string) => path in saved.files;
  const paths = pictures.map((picture) => picture.path);
  purgePaths(context, [...(content === undefined ? [] : [record]), ...paths.filter(isReplaced), ...paths.filter((path) => !isReplaced(path))]);
  // Only once the record is saved; a push never fails the save.
  const push = content === undefined ? undefined : await pushAfterWrite({ path: record, content, notify: request.notify, sha: request.sha ?? undefined }, pushEnv(context.env));
  // The record file's sha as committed (commitOn writes jsonFileText), so an editor can keep saving.
  const sha = content === undefined ? request.sha : await gitBlobSha(new TextEncoder().encode(jsonFileText(content)));
  return json({ ok: true, sha, commit: saved.commit, ...(push && { push }) });
}

// A record and its new or replaced pictures, in one commit: a save lands whole
// or not at all, and the push webhook fires once. The pictures were uploaded
// before as blobs (handleUploadPicture); only those whose token is the
// server's, for that very path, in the record's own folder, are committed. The
// record must still be at the sha the editor loaded (null: it mustn't exist
// yet), or it's a conflict to reload. A branch that moves between the check
// and the commit (an import, another admin's save) is checked and committed on
// once more; a second move is a conflict. Folders whose files need checks that
// read other files (schemas, screens, navigation) aren't record folders, so
// dataWriteProblems reads nothing here.
// Subrequests at most: the session (1), the snapshot (3) and the commit (4),
// twice when the branch moved; a new record's push (2 GitHub reads, 2 KV, 2
// to Google); a KV write per mobile version (2); and the cached copies of
// PURGED_PICTURES pictures (24): 47 of a Function's 50 (Workers Free).
export async function handleSaveRecord(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const request = saveRequest(await readJsonBody(context.request, SAVE_BODY_LIMIT));
  if (typeof request === "string") {
    return json({ error: request }, STATUS.badRequest);
  }
  const record = `data/${request.game}/${request.folder}/${request.id}.json`;
  const problem = await saveProblem(context, request, record);
  if (problem) {
    return problem;
  }
  const saved = await commitSave(context, request, record);
  if (saved instanceof Response) {
    return saved;
  }
  return "conflict" in saved ? json({ error: `Conflict on ${record}: ${RECORD_CONFLICTS[saved.conflict]}`, conflict: true }, STATUS.conflict) : savedAnswer(context, request, { record, saved });
}
