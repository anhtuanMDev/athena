import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The admin's CSP (public/_headers) lets React Router's inline scripts in
// index.html run by their sha256 hashes. One of them imports the build's
// hashed chunk files, so the hashes change with every build: the build fills
// them in (react-router.config.ts) where _headers has this token.
export const HASHES_TOKEN = "__INLINE_SCRIPT_HASHES__";

/** A CSP source for each distinct inline script of the `pages` (HTML), hashed as a browser hashes it. */
export function inlineScriptHashes(pages: string[]): string[] {
  const hashes = new Set<string>();
  for (const html of pages) {
    for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\bsrc\s*=/i.test(attributes)) continue;
      hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
    }
  }
  return [...hashes];
}

/**
 * `headers` (a _headers file) with the token replaced by the hashes of the
 * pages' inline scripts. Throws without a token or an inline script, so a
 * build never ships a CSP that blocks the app's bootstrap without saying so.
 */
export function fillInlineScriptHashes(headers: string, pages: string[]): string {
  if (!headers.includes(HASHES_TOKEN)) throw new Error(`_headers has no ${HASHES_TOKEN} for the inline scripts' hashes.`);
  const hashes = inlineScriptHashes(pages);
  if (hashes.length === 0) throw new Error("No inline script found in the built pages; the CSP's hashes can't be filled in.");
  return headers.replaceAll(HASHES_TOKEN, hashes.join(" "));
}

/** Fills in `clientDir`/_headers from the HTML pages beside it. */
export async function writeInlineScriptHashes(clientDir: string): Promise<void> {
  const names = (await readdir(clientDir)).filter((name) => name.endsWith(".html"));
  const pages = await Promise.all(names.map((name) => readFile(join(clientDir, name), "utf8")));
  const path = join(clientDir, "_headers");
  await writeFile(path, fillInlineScriptHashes(await readFile(path, "utf8"), pages));
}
