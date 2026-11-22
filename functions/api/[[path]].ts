import { STATUS, HttpError, json } from "../../app/lib/api/http";
import { notFound, routeOf } from "../../app/lib/api/routes";
import { AuthError, isForeignWrite } from "../../app/lib/api/session";

import type { ApiContext } from "../../app/lib/api/env";

// The admin API (/api/*): one Function, its routes in app/lib/api/routes.ts and
// their handlers beside it (not under functions/, where every file is a route).

/** A thrown error as the API's answer: 401 without a session, a route's own answer, else a 500 with its message. */
function errorAnswer(error: unknown): Response {
  if (error instanceof AuthError) {
    return json({ error: "Unauthorized" }, STATUS.unauthorized);
  }
  if (error instanceof HttpError) {
    return error.response;
  }
  if (error instanceof Response) {
    return error;
  }
  return json({ error: error instanceof Error ? error.message : "Internal server error" }, STATUS.serverError);
}

export async function onRequest(context: ApiContext): Promise<Response> {
  const { request } = context;
  const path = new URL(request.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  try {
    if (isForeignWrite(request)) {
      return json({ error: "Changes can only be made from the admin itself." }, STATUS.forbidden);
    }
    const handle = routeOf(request.method, path);
    return handle ? await handle(context, path) : notFound();
  } catch (error) {
    return errorAnswer(error);
  }
}
