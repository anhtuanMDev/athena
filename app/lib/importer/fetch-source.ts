/**
 * Fetches an import job's source with the guards a server-side fetch of an
 * admin-supplied URL needs: HTTPS only, no private or local addresses (checked
 * through DNS over HTTPS, so a public name can't point inside), no redirects,
 * a timeout and a size cap.
 */

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

export class SourceError extends Error {
  name = "SourceError";
}

function isInternalIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isInternalIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff")) return true;
  if (lower.startsWith("::ffff:")) return isInternalIPv4(lower.slice("::ffff:".length));
  return false;
}

/** Whether `hostname` resolves only to public addresses. */
async function resolvesPublicly(hostname: string, fetcher: typeof fetch): Promise<boolean> {
  for (const [type, code, internal] of [
    ["A", 1, isInternalIPv4],
    ["AAAA", 28, isInternalIPv6],
  ] as const) {
    const response = await fetcher(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { Answer?: { type: number; data: string }[] };
    if (data.Answer?.some((record) => record.type === code && internal(record.data))) return false;
  }
  return true;
}

/** Whether a server may fetch `urlString` for an import. */
export async function isSafeUrl(urlString: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
    if (host === "localhost" || /\.(local|internal|localhost)$/.test(host) || !host.includes(".")) return false;
    return await resolvesPublicly(host, fetcher);
  } catch {
    return false;
  }
}

/** The body at `url`, as text, or a SourceError saying why not. */
export async function fetchSource(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!(await isSafeUrl(url, fetcher))) {
    throw new SourceError("The source URL must be a public HTTPS address.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Athena-Importer/1.0", Accept: "application/json, text/html;q=0.9" },
      });
    } catch (err) {
      throw new SourceError(
        (err as Error).name === "AbortError" ? "The source took too long to answer." : "The source couldn't be reached.",
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new SourceError("The source redirected; use the address it redirects to.");
    }
    if (!response.ok) throw new SourceError(`The source answered ${response.status}.`);
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
      throw new SourceError("The source is larger than 5 MB.");
    }
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new SourceError("The source is larger than 5 MB.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
