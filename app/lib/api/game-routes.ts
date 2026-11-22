import { gameIconRequest, gamesSaveRequest, saveGames, uploadGameIcon } from "./games";
import { BAD_REQUEST, SAVE_BODY_LIMIT, assertSafeFilePath, json, readJsonBody } from "./http";
import { purgePaths } from "./purge";
import { PICTURE_BODY_LIMIT, PICTURE_TOO_LARGE } from "./records";
import { requireAuth } from "./session";

import type { ApiContext } from "./env";

// games.json's picked icon, uploaded on its own before the save as a blob, as
// a record's pictures are (handleUploadPicture), at the game's own icon path
// (app/lib/api/games.ts). 1 GitHub request.
export async function handleGameIcon(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const request = gameIconRequest(await readJsonBody(context.request, PICTURE_BODY_LIMIT, PICTURE_TOO_LARGE));
  if (typeof request === "string") {
    return json({ error: request }, BAD_REQUEST);
  }
  assertSafeFilePath(request.path);
  const answer = await uploadGameIcon(context.env, request);
  return json(answer.body, answer.status);
}

// games.json and its picked icon in one commit, after the checks the per-file
// write ran on games.json (app/lib/api/games.ts saveGames).
export async function handleSaveGames(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const request = gamesSaveRequest(await readJsonBody(context.request, SAVE_BODY_LIMIT));
  if (typeof request === "string") {
    return json({ error: request }, BAD_REQUEST);
  }
  if (request.icon) {
    assertSafeFilePath(request.icon.path);
  }
  const answer = await saveGames(context.env, request);
  if (answer.written) {
    purgePaths(context, answer.written);
  }
  return json(answer.body, answer.status);
}
