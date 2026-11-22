// What every route of the admin API shares: JSON answers, bodies read within a
// limit, the shapes bodies may have, and paths the API may touch.

const KIB = 1024;
const MIB = KIB * KIB;
const WRITE_MIB = 3;

/** The most a small request's body may hold: a sign-in, or deleting one file. */
export const SMALL_BODY_LIMIT = 65_536;

/** The most a data/file write's body may hold: any data file, or a picture at its limit as base64. */
export const WRITE_BODY_LIMIT = WRITE_MIB * MIB;

/** The most a save's body may hold: the record, and its pictures' shas and tokens (never their bytes). */
export const SAVE_BODY_LIMIT = MIB;

export const BAD_REQUEST = 400;

const PAYLOAD_TOO_LARGE = 413;

// Safe path validation allows `data/...` and `public/assets/...`
const SAFE_FILE_PATH = /^(data\/|public\/assets\/)[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\.[A-Za-z0-9]+$/;

/** An answer a route gives up with from deep in its work: onRequest answers with its response. */
export class HttpError extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super(`HTTP ${String(response.status)}`);
    this.name = "HttpError";
    this.response = response;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** A JSON object: not null, not a list. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A body's fields: none when it isn't a JSON object. */
export function fieldsOf(body: unknown): Record<string, unknown> {
  return isJsonObject(body) ? body : {};
}

/** An optional text field: undefined when left out, null when it's something else. */
export function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

/** Refuses (400) a path outside data/ and public/assets/, or one that climbs out of them. */
export function assertSafeFilePath(path: string): void {
  const decoded = decodeURIComponent(path);
  const isUnsafe = decoded.includes("..") || decoded.startsWith("/") || decoded.includes("\0");
  if (isUnsafe || !SAFE_FILE_PATH.test(decoded)) {
    throw new HttpError(new Response(null, { status: BAD_REQUEST }));
  }
}

/** The body's bytes, read up to `limit`: past it, the rest is never read. */
async function readUpTo(reader: ReadableStreamDefaultReader<Uint8Array>, limit: number, chunks: Uint8Array[] = []): Promise<Uint8Array[] | null> {
  const { done: isDone, value } = await reader.read();
  if (isDone) {
    return chunks;
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, value.byteLength);
  if (size > limit) {
    // The cancel's own failure changes nothing: the body is refused either way.
    await reader.cancel().catch((reason: unknown) => reason);
    return null;
  }
  return readUpTo(reader, limit, [...chunks, value]);
}

function joined(chunks: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  chunks.reduce((at, chunk) => {
    bytes.set(chunk, at);
    return at + chunk.byteLength;
  }, 0);
  return bytes;
}

/**
 * The request's JSON body, or {} when it isn't JSON (the handler then says
 * what's missing). Read only up to `limit` bytes: a larger body is refused
 * (413) before any of it is parsed, so it can't spend the Function's CPU or
 * memory (10 ms and 128 MB on Workers Free).
 */
export async function readJsonBody(request: Request, limit: number, tooLargeError = "The request is too large."): Promise<unknown> {
  const tooLarge = () => new HttpError(json({ error: tooLargeError }, PAYLOAD_TOO_LARGE));
  if (Number(request.headers.get("Content-Length")) > limit) {
    throw tooLarge();
  }
  if (!request.body) {
    return {};
  }
  const chunks = await readUpTo(request.body.getReader(), limit);
  if (chunks === null) {
    throw tooLarge();
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined(chunks))) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {};
    }
    throw error;
  }
}
