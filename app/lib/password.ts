// The admin password check, for POST /api/auth/login (functions/api).
//
// ADMIN_PASSWORD_HASH holds a verifier that `npm run admin-password`
// (tools/admin-password.ts) makes:
//
//   pbkdf2-sha256:<iterations>:<salt>:<hash>      salt and hash in base64url
//
// Why PBKDF2, and why so few iterations: a Function on the Workers Free plan
// gets 10 ms of CPU a request, and Web Crypto runs inside the request, so its
// time counts in full (Cloudflare caps PBKDF2 at 100,000 iterations in
// production because it can't stop it part way: workerd issue #1346). bcrypt
// at cost 10, the hash this replaces, took about 50 ms in Node and in local
// workerd, wrong passwords included. 20,000 iterations took about 1 ms in local
// workerd (1.5 ms in Node). The passphrase is long and random, which is what
// keeps it safe from offline guessing; the iterations add a margin, and the
// verifier says how many it used, so a new one can use more.
//
// A bcrypt hash ($2a$, $2b$, $2y$) is still accepted until it is replaced, so
// a deploy doesn't lock anyone out. No `$` in the new format: it can't be
// expanded by a shell or a .env reader.

export const PBKDF2_ITERATIONS = 20_000;
export const MIN_ITERATIONS = 10_000;
/** Cloudflare's production limit for PBKDF2. */
export const MAX_ITERATIONS = 100_000;

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const VERIFIER = /^pbkdf2-sha256:([1-9][0-9]{0,8}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/;
const BCRYPT = /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/;

/** ADMIN_PASSWORD_HASH isn't something this check can use: a setup problem, never a wrong password. */
export class PasswordConfigError extends Error {
  name = "PasswordConfigError";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `text` decoded to exactly `length` bytes, or null (another length, or bits past the end). */
function fromBase64Url(text: string, length: number): Uint8Array<ArrayBuffer> | null {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return bytes.length === length && toBase64Url(bytes) === text ? bytes : null;
}

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BYTES * 8));
}

/** Whether two hashes are the same, taking as long whichever byte differs. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** A verifier of `passphrase` for ADMIN_PASSWORD_HASH, with a new random salt. */
export async function hashAdminPassword(passphrase: string, { iterations = PBKDF2_ITERATIONS }: { iterations?: number } = {}): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new RangeError(`The iterations must be a whole number from ${MIN_ITERATIONS} to ${MAX_ITERATIONS}.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `pbkdf2-sha256:${iterations}:${toBase64Url(salt)}:${toBase64Url(await derive(passphrase, salt, iterations))}`;
}

/**
 * Whether `input` is the admin's passphrase, by the verifier `stored`.
 * Throws a PasswordConfigError when `stored` isn't one this can check.
 */
export async function verifyAdminPassword(input: string, stored: string): Promise<boolean> {
  if (BCRYPT.test(stored)) {
    // Said on every sign-in until it's replaced; never with the hash itself.
    console.warn(
      "ADMIN_PASSWORD_HASH is a bcrypt hash, which costs about 50 ms of CPU a sign-in on a 10 ms plan. Replace it with a verifier from `npm run admin-password`.",
    );
    const bcrypt = await import("bcryptjs");
    return bcrypt.compareSync(input, stored);
  }
  const match = VERIFIER.exec(stored);
  const iterations = Number(match?.[1]);
  const salt = match && fromBase64Url(match[2], SALT_BYTES);
  const hash = match && fromBase64Url(match[3], HASH_BYTES);
  if (!salt || !hash || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new PasswordConfigError("ADMIN_PASSWORD_HASH isn't a verifier this admin can check; make one with `npm run admin-password`.");
  }
  if (input === "") return false;
  return sameBytes(await derive(input, salt, iterations), hash);
}
