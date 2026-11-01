/**
 * Push notifications to players (FCM HTTP v1), sent when an admin publishes a
 * new record with "Notify players" ticked. The text comes from the record's
 * category (categories.json `notify`) and the record as saved: a request can
 * ask for a push, never say what it says.
 *
 * Credentials are a service account's JSON key in the FCM_SERVICE_ACCOUNT
 * secret. Each push signs a fresh token: pushes are rare and manual, so a
 * cached one isn't worth storing. The key, the signed assertion and the
 * access token never reach a log, a reply or an error message.
 */
import { CATEGORIES_PATH, normalizeCategories } from "./categories";
import { renderNotification } from "./notify-template";

/** At most this many pushes per game in any hour, whatever admins publish. */
export const PUSHES_PER_GAME_PER_HOUR = 3;
/** Every player who has notifications on (zms subscribes to it). */
export const PUSH_TOPIC = "all_users";
/** The channel zms creates at start-up (src/notifications, setupNotificationChannels). */
export const ANDROID_CHANNEL_ID = "default";
/** For getting a token and sending, together: a publish doesn't wait longer on a push. */
export const PUSH_TIMEOUT_MS = 5_000;
export const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_API = "https://fcm.googleapis.com";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const HOUR_MS = 3_600_000;
// Firebase project ids; the id is part of the send URL.
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const RECORD_PATH = /^data\/([^/]+)\/([^/]+)\/([^/]+)\.json$/;

export type PushStatus = "sent" | "skipped" | "not_configured" | "failed";
/** What happened to the push a publish asked for; the publish itself stands either way. */
export interface PushResult {
  status: PushStatus;
  warning?: string;
}

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  key: CryptoKey;
}

/** Where sends are counted (RATE_LIMIT_KV). */
export interface PushStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Google's side, passed in so tests talk to a stand-in. */
export interface PushDeps {
  fetcher?: typeof fetch;
  oauthUrl?: string;
  fcmUrl?: string;
  now?: () => number;
}

export interface PushData {
  game: string;
  category: string;
  folder: string;
  id: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The service account in FCM_SERVICE_ACCOUNT, or null when it's missing or
 * unusable: pushes are then "not configured", and nothing is logged.
 */
export async function readServiceAccount(raw: string | undefined): Promise<ServiceAccount | null> {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = parsed;
    if (typeof projectId !== "string" || !PROJECT_ID.test(projectId) || typeof clientEmail !== "string" || !clientEmail.includes("@")) return null;
    const pem = typeof privateKey === "string" ? /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(privateKey) : null;
    if (!pem) return null;
    const der = Uint8Array.from(atob(pem[1].replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    return { projectId, clientEmail, key };
  } catch {
    // JSON.parse, atob and importKey can quote their input: none of it may leave.
    return null;
  }
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** The RS256 assertion a service account trades for an access token at `audience`. */
export async function signJwt(account: ServiceAccount, audience: string, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({ iss: account.clientEmail, scope: FCM_SCOPE, aud: audience, iat, exp: iat + 3600 })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", account.key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** The FCM v1 send body. Data values are strings: zms opens the record from them. */
export function fcmMessage(notification: { title: string; body: string }, data: PushData) {
  return {
    message: {
      topic: PUSH_TOPIC,
      notification: notification.body ? { title: notification.title, body: notification.body } : { title: notification.title },
      data: { game: data.game, category: data.category, folder: data.folder, id: data.id },
      android: { notification: { channel_id: ANDROID_CHANNEL_ID } },
    },
  };
}

/**
 * Counts a push for `game` if fewer than PUSHES_PER_GAME_PER_HOUR went out in
 * the past hour (a sliding hour, so a burst can't straddle two). Taken before
 * sending: a send that timed out may still have reached players.
 */
export async function takePushSlot(kv: PushStore, game: string, now: number): Promise<boolean> {
  const key = `push_sent:${game}`;
  let sent: unknown;
  try {
    sent = JSON.parse((await kv.get(key)) ?? "[]");
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
  }
  const recent = (Array.isArray(sent) ? sent : []).filter((t): t is number => typeof t === "number" && now - t < HOUR_MS);
  if (recent.length >= PUSHES_PER_GAME_PER_HOUR) return false;
  await kv.put(key, JSON.stringify([...recent, now]), { expirationTtl: HOUR_MS / 1000 });
  return true;
}

/** Gets an access token and sends `message`, within PUSH_TIMEOUT_MS for both. */
export async function sendPush(account: ServiceAccount, message: unknown, deps: PushDeps = {}): Promise<PushResult> {
  const { fetcher = fetch, oauthUrl = OAUTH_TOKEN_URL, fcmUrl = FCM_API, now = Date.now } = deps;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
  // Whatever a request is doing when time runs out, the push gives up then.
  const timedOut = new Promise<PushResult>((resolve) =>
    controller.signal.addEventListener("abort", () => resolve({ status: "failed", warning: `The push service didn't answer within ${PUSH_TIMEOUT_MS / 1000} s.` })),
  );
  const send = async (): Promise<PushResult> => {
    const assertion = await signJwt(account, oauthUrl, now());
    const tokenResponse = await fetcher(oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      signal: controller.signal,
    });
    if (!tokenResponse.ok) return { status: "failed", warning: `Google refused the service account (${tokenResponse.status}).` };
    const token = ((await tokenResponse.json().catch(() => null)) as { access_token?: unknown } | null)?.access_token;
    if (typeof token !== "string" || !token) return { status: "failed", warning: "Google sent no access token." };
    const response = await fetcher(`${fcmUrl}/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    return response.ok ? { status: "sent" } : { status: "failed", warning: `The push service answered ${response.status}.` };
  };
  try {
    return await Promise.race([send().catch((): PushResult => ({ status: "failed", warning: "The push service couldn't be reached." })), timedOut]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** What a publish asked for and wrote: the data/file write's body, or a published import draft. */
export interface PushWrite {
  path: string;
  content: unknown;
  sha?: unknown;
  isBase64?: unknown;
  notify?: unknown;
}

export interface PushEnv {
  /** FCM_SERVICE_ACCOUNT. */
  credentials: string | undefined;
  kv: PushStore | undefined;
  /** A data repo file's text; rejects with a `status` of 404 when it doesn't exist. */
  read: (path: string) => Promise<string>;
}

const skipped = (warning: string): PushResult => ({ status: "skipped", warning });

async function readJson(read: PushEnv["read"], path: string): Promise<unknown> {
  try {
    return JSON.parse(await read(path));
  } catch (err) {
    if ((err as { status?: unknown } | null)?.status === 404) return null;
    throw err;
  }
}

function readGames(file: unknown): Record<string, unknown>[] {
  return isObject(file) && Array.isArray(file.games) ? file.games.filter(isObject) : [];
}

async function pushNewRecord(write: PushWrite, env: PushEnv, deps: PushDeps): Promise<PushResult> {
  const match = RECORD_PATH.exec(write.path);
  // Only a file created by this write: an edit carries the sha it replaces, and
  // GitHub refuses to create a file that already exists.
  if (write.sha || write.isBase64 === true || !match || !isObject(write.content)) {
    return skipped("Only publishing a new record notifies players; edits never do.");
  }
  const [, game, folder, id] = match;
  const record = write.content;
  const account = await readServiceAccount(env.credentials);
  if (!account) return { status: "not_configured" };

  const categoriesFile = await readJson(env.read, CATEGORIES_PATH);
  const category = (categoriesFile === null ? [] : normalizeCategories(categoriesFile).categories).find((c) => c.folder === folder);
  if (!category?.notify) return skipped(`${category?.label ?? folder} has no notification set up on the Categories page.`);
  const listed = readGames(await readJson(env.read, "data/_meta/games.json")).find((g) => g.slug === game);
  if (!listed || listed.active === false) return skipped("This game is hidden in the app, so players weren't notified.");
  if (record.id !== id) return skipped("The record's id doesn't match its file name.");
  const { title, body } = renderNotification(category.notify, record);
  if (!title) return skipped("The notification's title came out empty for this record.");

  if (!env.kv) return { status: "failed", warning: "The push limit can't be checked: RATE_LIMIT_KV isn't bound." };
  let allowed: boolean;
  try {
    allowed = await takePushSlot(env.kv, game, (deps.now ?? Date.now)());
  } catch {
    return { status: "failed", warning: "The push limit couldn't be checked." };
  }
  if (!allowed) return skipped(`${PUSHES_PER_GAME_PER_HOUR} notifications were already sent for this game in the last hour.`);
  return sendPush(account, fcmMessage({ title, body }, { game, category: category.category, folder, id }), deps);
}

/**
 * The push a write asked for with `notify: true`, after the write succeeded;
 * undefined when it asked for none. Never throws: a publish never fails
 * because of its push.
 */
export async function pushAfterWrite(write: PushWrite, env: PushEnv, deps: PushDeps = {}): Promise<PushResult | undefined> {
  if (write.notify !== true) return undefined;
  let result: PushResult;
  try {
    result = await pushNewRecord(write, env, deps);
  } catch (err) {
    // GitHub reads failing; the name says enough and can't carry a secret.
    console.error("Push not sent:", err instanceof Error ? err.name : "unknown error");
    return { status: "failed", warning: "The notification couldn't be sent." };
  }
  if (result.status === "failed") console.error("Push not sent:", result.warning);
  return result;
}
