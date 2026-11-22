import { graphqlStatus } from "../github-graphql";
import { readServiceAccount } from "../push";

import { NO_STORE, STATUS, json } from "./http";
import { requireAuth } from "./session";

import type { ApiContext } from "./env";

// Whether the server's token can read folders through GitHub GraphQL (one request
// each, see github-graphql.ts), for checking a deploy: only that, nothing about the token.
export async function handleGithubStatus(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const { env } = context;
  const hasGraphql = await graphqlStatus({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO });
  return json({ graphql: hasGraphql }, STATUS.ok, NO_STORE);
}

// Whether pushes can be sent: only that, never anything about the credentials.
export async function handlePushStatus(context: ApiContext): Promise<Response> {
  await requireAuth(context);
  const isConfigured = (await readServiceAccount(context.env.FCM_SERVICE_ACCOUNT)) !== null;
  return json({ configured: isConfigured }, STATUS.ok, NO_STORE);
}
