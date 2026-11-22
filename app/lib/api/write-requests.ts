import { STATUS, fieldsOf, json, optionalText, statusOf } from "./http";

// The bodies data/file takes, checked before a handler uses them: a field of the
// wrong type is a 400 that says which, never a 500 from deep in a handler, nor a
// value sent on to GitHub. And how a write GitHub refused reads to the editor.

/** The most of GitHub's reason a refusal repeats. */
const REASON_LENGTH = 300;

/** POST data/file: a file's new content, as JSON or base64. */
export interface WriteRequest {
  path: string;
  content: unknown;
  message?: string;
  /** The file's sha as loaded; left out for a new file. */
  sha?: string;
  /** True for base64 content (pictures); anything else is JSON. */
  isBase64?: unknown;
  /** Asks for a push to players (only true does): read by pushAfterWrite. */
  notify?: unknown;
}

export function writeRequest(body: unknown): WriteRequest | string {
  const fields = fieldsOf(body);
  if (typeof fields.path !== "string" || fields.path === "") {
    return "path is required";
  }
  const message = optionalText(fields.message);
  const sha = optionalText(fields.sha);
  if (message === null) {
    return "Invalid commit message.";
  }
  if (sha === null) {
    return "Invalid sha.";
  }
  return { path: fields.path, content: fields.content, message, sha, isBase64: fields.isBase64, notify: fields.notify };
}

/** DELETE data/file: a file, at the sha it was loaded at. */
export function deleteFileRequest(body: unknown): { path: string; sha: string; message?: string } | string {
  const fields = fieldsOf(body);
  const { path, sha } = fields;
  if (typeof path !== "string" || path === "" || typeof sha !== "string" || sha === "") {
    return "path and sha are required";
  }
  const message = optionalText(fields.message);
  if (message === null) {
    return "Invalid commit message.";
  }
  return { path, sha, message };
}

function reasonText(error: unknown): string {
  const data = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data;
  if (typeof data?.message === "string") {
    return data.message;
  }
  return error instanceof Error ? error.message : "";
}

/** GitHub's reason for refusing a request, on one line, without the link to its docs. */
function githubMessage(error: unknown): string {
  return reasonText(error)
    .replace(/\s*-\s*https:\/\/docs\.github\.com\S*\s*$/, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, REASON_LENGTH);
}

/** A 422's message as the editor hears it: conflicts to reload, or what GitHub said. */
function unprocessable(message: string, path: string): Response {
  const conflict = (error: string) => json({ error: `Conflict on ${path}: ${error}`, conflict: true }, STATUS.conflict);
  if (/"sha" wasn't supplied/i.test(message)) {
    return conflict("the file already exists.");
  }
  if (/\bsha\b/i.test(message)) {
    return conflict("the file was modified or removed since it was loaded.");
  }
  if (/too (large|big)|exceeds/i.test(message)) {
    return json({ error: `${path} is too large for GitHub: ${message}` }, STATUS.payloadTooLarge);
  }
  return json({ error: `GitHub refused ${path}: ${message || "the request isn't valid"}` }, STATUS.badRequest);
}

// A contents write GitHub refused, as the editor should hear it. 409: the file
// changed since its sha was read. 422 is any request GitHub can't take: "sha"
// wasn't supplied means the file was created meanwhile, and another sha
// problem that it changed or went: conflicts too, to reload. The rest (too
// large, invalid) need a different change, not a reload, so they aren't
// conflicts and say what GitHub said.
export function refusedWrite(error: unknown, path: string): Response | null {
  const status = statusOf(error);
  if (status === STATUS.conflict) {
    return json({ error: `Conflict on ${path}: the file was modified since it was loaded.`, conflict: true }, STATUS.conflict);
  }
  if (status !== STATUS.unprocessable) {
    return null;
  }
  return unprocessable(githubMessage(error), path);
}
