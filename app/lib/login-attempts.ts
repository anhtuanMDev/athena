// Failed sign-ins per IP, counted in this data center's cache (caches.default)
// instead of KV: on the Workers Free plan KV takes 1,000 writes a day, and
// every wrong password would spend one. The trade-off: an attacker spread over
// many data centers gets MAX_ATTEMPTS in each, still with exponential backoff
// after that, against a bcrypt hash.

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
const BASE_DELAY_MS = 1000;

interface AttemptRecord {
  count: number;
  firstAt: number;
  lastAt: number;
}

/** The part of the Workers Cache API the counter uses. */
export interface AttemptCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

const keyFor = (ip: string) => new Request(`https://api.internal/login-attempts/${encodeURIComponent(ip)}`);

async function readRecord(cache: AttemptCache, ip: string): Promise<AttemptRecord | null> {
  const cached = await cache.match(keyFor(ip));
  if (!cached) return null;
  try {
    return JSON.parse(await cached.text()) as AttemptRecord;
  } catch {
    return null;
  }
}

/** Whether `ip` may try a password now, and if not, how many seconds until it may. */
export async function checkLoginAttempts(cache: AttemptCache, ip: string, now = Date.now()): Promise<{ allowed: boolean; retryAfter?: number }> {
  const record = await readRecord(cache, ip);
  if (!record || now - record.lastAt > WINDOW_MS) return { allowed: true };
  if (record.count >= MAX_ATTEMPTS) {
    const delay = BASE_DELAY_MS * Math.pow(2, record.count - MAX_ATTEMPTS);
    const elapsed = now - record.lastAt;
    if (elapsed < delay) return { allowed: false, retryAfter: Math.ceil((delay - elapsed) / 1000) };
  }
  return { allowed: true };
}

/** Counts a wrong password for `ip`, or forgets its count after a right one. */
export async function recordLoginAttempt(cache: AttemptCache, ip: string, success: boolean, now = Date.now()): Promise<void> {
  if (success) {
    await cache.delete(keyFor(ip));
    return;
  }
  const existing = await readRecord(cache, ip);
  const record: AttemptRecord =
    existing && now - existing.lastAt <= WINDOW_MS
      ? { ...existing, count: existing.count + 1, lastAt: now }
      : { count: 1, firstAt: now, lastAt: now };
  const response = new Response(JSON.stringify(record), { headers: { "Cache-Control": `max-age=${WINDOW_MS / 1000}` } });
  await cache.put(keyFor(ip), response);
}
