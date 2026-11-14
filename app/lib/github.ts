import { clearDataCache } from "~/lib/use-data";
import type { PushResult } from "~/lib/push";
import type { Game } from "~/schemas/game";
import { droppedAssets, pruneNote, recordAssetDir, type AssetFile, type DeletionRequest, type Listing, type PruneResult } from "~/lib/record-assets";

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

/** Whether the server's token reads folders through GitHub GraphQL (one request each) rather than file by file. */
export async function getGithubStatus(): Promise<{ graphql: boolean }> {
  return api("GET", "github/status");
}

/** Whether the server holds push credentials (FCM_SERVICE_ACCOUNT). */
export async function getPushStatus(): Promise<{ configured: boolean }> {
  return api("GET", "push/status");
}

export async function updateFile(path: string, content: unknown, sha: string, message?: string): Promise<string | null> {
  const res = await api<{ sha?: string | null }>("POST", "data/file", { path, content, message, sha });
  return res.sha ?? null;
}

/** One picture, as a commit of its own: only the games page's icon still uploads this way (the editors use saveRecord). */
export async function uploadAsset(path: string, base64Content: string, sha?: string, message?: string): Promise<void> {
  await api("POST", "data/file", { path, content: base64Content, isBase64: true, sha, message });
}

/** A picture a save adds or replaces: where it goes in the data repo, and its bytes as base64. */
export interface PictureUpload {
  path: string;
  base64: string;
}

/** A record's save, for saveRecord. */
export interface RecordSave {
  game: string;
  /** A category's folder ("heroes"), or "enums". */
  folder: string;
  id: string;
  /** The record file's sha as loaded; null for a new record. */
  sha: string | null;
  /** The record to write; left out, the record stays as it is and only the pictures are saved. */
  content?: unknown;
  message: string;
  /** Asks the server to tell players about a new record. */
  notify?: boolean;
  /** The pictures the save adds or replaces, all in the record's own folder. */
  pictures: PictureUpload[];
}

/**
 * Pictures uploaded at once. They don't conflict (each is only a blob), and
 * a few at a time keeps a save quick without a burst of GitHub's
 * content-creating requests, which it limits.
 */
const UPLOADS_AT_ONCE = 3;

/**
 * Saves a record and its new or replaced pictures in one commit, so it lands
 * whole or not at all and the app's caches are refreshed once. Each picture
 * goes up first as a blob (POST data/picture), which commits nothing, a few
 * at a time; then one request commits them with the record (POST
 * data/save-record), as long as the record is still at `sha`. A picture that
 * can't be uploaded saves nothing. Resolves to the record file's sha.
 */
export async function saveRecord(save: RecordSave): Promise<{ sha: string | null; push?: PushResult }> {
  const { game, folder, id, pictures, notify, ...record } = save;
  const uploaded: unknown[] = new Array(pictures.length);
  let next = 0;
  let failed = false;
  const uploader = async () => {
    while (!failed && next < pictures.length) {
      const i = next++;
      try {
        uploaded[i] = await api("POST", "data/picture", { game, folder, id, path: pictures[i].path, base64: pictures[i].base64 });
      } catch (err) {
        // The others stop taking pictures: nothing will be saved.
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOADS_AT_ONCE, pictures.length) }, uploader));
  const res = await api<{ sha?: string | null; push?: PushResult }>("POST", "data/save-record", { game, folder, id, ...record, ...(notify && { notify: true }), pictures: uploaded });
  return { sha: res.sha ?? null, push: res.push };
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
 * Up to 4 folders of a game, with their records, in one request (one GitHub
 * request when the server can use GraphQL): each folder's records by its
 * subpath, as listDirectory(…, true) gives them, and whether all were read.
 */
export async function listFolders<T = unknown>(game: string, subpaths: string[]): Promise<{ folders: Record<string, T[]>; complete: boolean }> {
  const { data, headers } = await apiResponse<Record<string, T[]>>("GET", `data/folders?game=${encodeURIComponent(game)}&subpaths=${encodeURIComponent(subpaths.join(","))}`);
  const folders = Object.fromEntries(subpaths.map((s) => [s, Array.isArray(data?.[s]) ? data[s] : []]));
  return { folders, complete: !headers.get("X-Incomplete") };
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

/**
 * After a record's save: removes the files of its own folder the save stopped
 * pointing at (`stored` is the record as loaded, `saved` as saved), unless
 * another record, or the saved one, still uses them (POST data/prune-assets).
 * Never throws: the save is done, so a file that couldn't be removed is only
 * said. Null when the save left no file behind (no request).
 */
export async function pruneReplacedAssets(game: string, folder: string, id: string, stored: unknown, saved: unknown): Promise<{ message: string; kept: boolean } | null> {
  const paths = droppedAssets(stored, saved, recordAssetDir(game, folder, id));
  if (paths.length === 0) return null;
  try {
    return pruneNote(await api<PruneResult>("POST", "data/prune-assets", { game, folder, id, paths }));
  } catch {
    return pruneNote({ removed: [], kept: paths.map((path) => ({ path, why: "couldn't check what uses it" })) });
  }
}

/** One enum file of a game, e.g. map-types (GET /api/{game}/enums/{id}: one GitHub read). */
export async function getEnum(game: string, id: string): Promise<unknown> {
  return api("GET", `${encodeURIComponent(game)}/enums/${encodeURIComponent(id)}`);
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
