// The host of an https URL, as both the admin and the app (zms policy.ts
// httpsHost) read one before opening a link or loading a picture.

/** Longer text isn't a URL a screen or a record holds. */
const MAX_URL_LENGTH = 2048;
const HTTPS_AUTHORITY = /^https:\/\/([^/?#\s]+)(?:[/?#]|$)/i;
const PLAIN_HOST = /^[a-z0-9.-]+$/;
const IP_ADDRESS = /^[0-9.]+$/;

/** The host of an https URL, or undefined for anything else (other schemes, credentials, IPs). */
export function httpsHost(url: unknown): string | undefined {
  const match = typeof url === "string" && url.length <= MAX_URL_LENGTH ? HTTPS_AUTHORITY.exec(url.trim()) : null;
  const authority = match?.[1].toLowerCase();
  // https://allowed.com@evil.com
  if (authority === undefined || authority.includes("@")) {
    return undefined;
  }
  const host = authority.replace(/:443$/, "");
  // Ports, IPv4 addresses and odd characters aren't hosts the app opens.
  return PLAIN_HOST.test(host) && !IP_ADDRESS.test(host) ? host : undefined;
}
