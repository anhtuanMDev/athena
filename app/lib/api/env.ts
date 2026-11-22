import { Octokit } from "@octokit/rest";

import { githubReader, type RepoReader } from "../mobile-payload";

import type { KVNamespace } from "@cloudflare/workers-types";

/** The admin API's settings and bindings (Cloudflare Pages). */
export interface Env {
  RATE_LIMIT_KV?: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET: string;
  COOKIE_SECURE?: string;
  /** A Firebase service account's JSON key; without it, publishing never notifies players. */
  FCM_SERVICE_ACCOUNT?: string;
}

/** A constant origin for the cache keys of pictures, so a Vite proxy's Host header can't change them. */
export const INTERNAL_ORIGIN = "https://api.internal";

/** A request to the admin API, as Pages hands it to the Function. */
export interface ApiContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
  next: () => Promise<Response>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** This data center's cache (Workers' caches.default, which the DOM's CacheStorage type doesn't have). */
export function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

/** The data branch every read and write goes to. */
export function dataBranch(env: Env): string {
  return env.GITHUB_BRANCH ?? "main";
}

/** The data repo as the API reads it; folders through GraphQL when the token allows (mobile-payload.ts). */
export function dataReader(env: Env): RepoReader {
  return githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, dataBranch(env), { token: env.GITHUB_TOKEN });
}
