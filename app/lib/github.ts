import { clearDataCache } from "~/lib/use-data";
import type { PushResult } from "~/lib/push";
import type { Game } from "~/schemas/game";
import type { AssetFile, DeletionRequest, Listing } from "~/lib/record-assets";

export interface GitHubFile<T = unknown> {
  sha: string;
  content: T;
}

export class ConflictError extends Error {
  path: string;
  /** `message`: the server's own, for a request that isn't about one file. */
  constructor(path: string, message?: string) {
    super(message ?? `Conflict on ${path}: the file was modified since you loaded it. Please refresh and re-apply your changes.`);
    this.name = "ConflictError";
    this.path = path;
  }
}

export function isConflictError(err: unknown): err is ConflictError {
  return err instanceof ConflictError;
}

export function conflictResponse() {
  return { errors: { _form: ["Conflict: file was modified since loading. Refresh and re-apply."] } };
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  return (await apiResponse<T>(method, path, body)).data;
}

/** api(), with the response's headers. */
async function apiResponse<T>(method: string, path: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
  const opts: RequestInit = {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(`/api/${path}`, opts);
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        if (localStorage.getItem("has_session") === "true") {
          window.dispatchEvent(new CustomEvent("AUTH_EXPIRED"));
        } else {
          window.location.href = "/login";
        }
      }
      throw new Error("Unauthorized: Session expired.");
    }
    if (res.status === 409 && (data as Record<string, unknown>).conflict) {
      const pathMatch = (body as Record<string, unknown>)?.path as string | undefined;
      throw new ConflictError(pathMatch ?? "unknown", pathMatch ? undefined : ((data as Record<string, unknown>).error as string | undefined));
    }
    throw new Error((data as Record<string, unknown>).error as string ?? res.statusText);
  }

  if (method !== "GET") {
    clearDataCache();
  }

  return { data: data as T, headers: res.headers };
}

export async function getFile<T = unknown>(path: string): Promise<GitHubFile<T> | null> {
  return api<GitHubFile<T> | null>("GET", `data/file?path=${encodeURIComponent(path)}`);
}

export async function fileExists(path: string): Promise<boolean> {
  const file = await getFile(path);
  return file !== null;
}

// Both resolve to the file's new sha.
export async function createFile(path: string, content: unknown, message?: string): Promise<string | null> {
  const res = await api<{ sha?: string | null }>("POST", "data/file", { path, content, message });
  return res.sha ?? null;
}

/**
 * Creates a record and, with `notify`, asks the server to tell players: the
 * server writes the push's text from the category's settings, never from here.
 */
export async function publishRecord(path: string, content: unknown, message: string, notify: boolean): Promise<{ sha: string | null; push?: PushResult }> {
  const res = await api<{ sha?: string | null; push?: PushResult }>("POST", "data/file", { path, content, message, ...(notify && { notify: true }) });
  return { sha: res.sha ?? null, push: res.push };
}

/** Whether the server holds push credentials (FCM_SERVICE_ACCOUNT). */
export async function getPushStatus(): Promise<{ configured: boolean }> {
  return api("GET", "push/status");
}

export async function updateFile(path: string, content: unknown, sha: string, message?: string): Promise<string | null> {
  const res = await api<{ sha?: string | null }>("POST", "data/file", { path, content, message, sha });
  return res.sha ?? null;
}

export async function uploadAsset(path: string, base64Content: string, sha?: string, message?: string): Promise<void> {
  await api("POST", "data/file", { path, content: base64Content, isBase64: true, sha, message });
}

export async function deleteFile(path: string, sha: string, message?: string): Promise<void> {
  await api("DELETE", "data/file", { path, sha, message });
}

export async function listDirectory<T = string>(game: string, subpath: string, includeContent?: boolean, keysOnly?: string[]): Promise<T[]> {
  let url = `data/directory?game=${encodeURIComponent(game)}&subpath=${encodeURIComponent(subpath)}`;
  if (includeContent) url += '&includeContent=true';
  if (keysOnly && keysOnly.length > 0) url += `&keysOnly=${encodeURIComponent(keysOnly.join(','))}`;
  return api<T[]>("GET", url);
}

/**
 * A folder's records, and whether every one of them could be read: the server
 * leaves out those it couldn't, and says so (X-Incomplete). For checks that
 * must see them all, such as what uses a record before it's deleted.
 */
export async function listDirectoryChecked(game: string, subpath: string, keysOnly?: string[]): Promise<Listing> {
  let url = `data/directory?game=${encodeURIComponent(game)}&subpath=${encodeURIComponent(subpath)}&includeContent=true`;
  if (keysOnly) url += `&keysOnly=${encodeURIComponent(keysOnly.join(","))}`;
  const { data, headers } = await apiResponse<unknown[]>("GET", url);
  return { items: Array.isArray(data) ? data : [], complete: !headers.get("X-Incomplete") };
}

/** A record's own pictures (public/assets/{game}/{folder}/{id}/), its file's sha, and the data commit they were read at. */
export async function getRecordAssets(game: string, folder: string, id: string): Promise<{ head: string; sha: string | null; files: AssetFile[] }> {
  return api("GET", `data/record-assets?game=${encodeURIComponent(game)}&folder=${encodeURIComponent(folder)}&id=${encodeURIComponent(id)}`);
}

/** Deletes a record and those of its pictures, in one commit (see record-assets.ts). */
export async function deleteRecord(request: DeletionRequest): Promise<void> {
  await api("POST", "data/delete-record", request);
}

export async function listGames(): Promise<Game[]> {
  return api("GET", "data/games");
}

/** Every game, with its record count per configured category folder. */
export async function getDashboardData(): Promise<{ games: (Game & { counts: Record<string, number> })[] }> {
  return api("GET", "data/dashboard");
}

export async function getFileSha(path: string): Promise<string | null> {
  const file = await getFile(path);
  return file?.sha ?? null;
}
