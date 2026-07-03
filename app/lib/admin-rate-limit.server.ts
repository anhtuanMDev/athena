import { getClientIp, checkRateLimit, recordAttempt } from "~/lib/rate-limit.server";

export function checkAdminRateLimit(request: Request): { allowed: boolean; retryAfter?: number } {
  const ip = getClientIp(request);
  const result = checkRateLimit(ip);
  if (!result.allowed) {
    return result;
  }
  return { allowed: true };
}

export function recordAdminAttempt(request: Request, success: boolean): void {
  const ip = getClientIp(request);
  recordAttempt(ip, success);
}
