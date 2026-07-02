interface Attempt {
  count: number;
  firstAt: number;
  lastAt: number;
}

const attempts = new Map<string, Attempt>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_DELAY_MS = 1000;

export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || "127.0.0.1";
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = attempts.get(ip);

  if (record) {
    if (now - record.firstAt > WINDOW_MS) {
      attempts.delete(ip);
      return { allowed: true };
    }

    if (record.count >= MAX_ATTEMPTS) {
      const excess = record.count - MAX_ATTEMPTS;
      const delay = BASE_DELAY_MS * Math.pow(2, excess);
      const elapsed = now - record.lastAt;
      if (elapsed < delay) {
        return { allowed: false, retryAfter: Math.ceil((delay - elapsed) / 1000) };
      }
    }
  }

  return { allowed: true };
}

export function recordAttempt(ip: string, success: boolean): void {
  const now = Date.now();
  if (success) {
    attempts.delete(ip);
    return;
  }
  const record = attempts.get(ip);
  if (record) {
    record.count++;
    record.lastAt = now;
  } else {
    attempts.set(ip, { count: 1, firstAt: now, lastAt: now });
  }
}
