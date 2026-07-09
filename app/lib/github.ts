import { clearDataCache } from "~/lib/use-data";
import type { Game } from "~/schemas/game";

export interface GitHubFile<T = unknown> {
  sha: string;
  content: T;
}

export class ConflictError extends Error {
  path: string;
  constructor(path: string) {
    super(`Conflict on ${path}: the file was modified since you loaded it. Please refresh and re-apply your changes.`);
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

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
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
        window.location.href = "/login";
      }
      throw new Error("Unauthorized: Session expired.");
    }
    if (res.status === 409 && (data as Record<string, unknown>).conflict) {
      const pathMatch = (body as Record<string, unknown>)?.path as string | undefined;
      throw new ConflictError(pathMatch ?? "unknown");
    }
    throw new Error((data as Record<string, unknown>).error as string ?? res.statusText);
  }

  if (method !== "GET") {
    clearDataCache();
  }

  return data as T;
}

export async function getFile<T = unknown>(path: string): Promise<GitHubFile<T> | null> {
  return api<GitHubFile<T> | null>("GET", `data/file?path=${encodeURIComponent(path)}`);
}

export async function fileExists(path: string): Promise<boolean> {
  const file = await getFile(path);
  return file !== null;
}

export async function createFile(path: string, content: unknown, message?: string): Promise<void> {
  await api("POST", "data/file", { path, content, message });
}

export async function updateFile(path: string, content: unknown, sha: string, message?: string): Promise<void> {
  await api("POST", "data/file", { path, content, message, sha });
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

export async function listGames(): Promise<Game[]> {
  return api("GET", "data/games");
}

export async function getDashboardData(): Promise<{ games: (Game & { heroCount: number; patchCount: number })[] }> {
  return api("GET", "data/dashboard");
}

export async function getFileSha(path: string): Promise<string | null> {
  const file = await getFile(path);
  return file?.sha ?? null;
}
