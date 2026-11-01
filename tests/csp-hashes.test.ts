import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { HASHES_TOKEN, fillInlineScriptHashes, inlineScriptHashes } from "../app/lib/csp-hashes";

const HEADERS = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const EMPTY = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='"; // sha256 of nothing
// The shape of React Router's SPA index.html: inline scripts, a module one, and files by src.
const INDEX = `<!DOCTYPE html><html><head><link rel="modulepreload" href="/assets/root-A1.js"/></head><body>
<script>window.__reactRouterContext = {"isSpaMode":true};</script><script type="module" async="">import "/assets/manifest-1.js";
import("/assets/entry.client-2.js");</script><script src="/assets/x.js"></script><SCRIPT></SCRIPT ><script></script></body></html>`;

const policy = (headers: string) => headers.match(/^\s*Content-Security-Policy:\s*(.*)$/m)![1];
const directive = (csp: string, name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

describe("the admin's CSP", () => {
  it("hashes each inline script once, and no script loaded by src", () => {
    const hashes = inlineScriptHashes([INDEX]);
    assert.equal(hashes.length, 3);
    assert.equal(hashes.at(-1), EMPTY);
    assert.ok(hashes.every((h) => /^'sha256-[A-Za-z0-9+/]{43}='$/.test(h)));
  });

  it("fills them into public/_headers, which allows no other inline script and no eval", () => {
    const filled = fillInlineScriptHashes(HEADERS, [INDEX]);
    const scripts = directive(policy(filled), "script-src")!;
    assert.equal(scripts, `script-src 'self' ${inlineScriptHashes([INDEX]).join(" ")}`);
    assert.doesNotMatch(scripts, /unsafe/);
    assert.equal(directive(policy(filled), "frame-ancestors"), "frame-ancestors 'none'");
    assert.match(filled, /^\s*X-Frame-Options: DENY$/m);
    // Pages ignores a header line over 2,000 characters.
    assert.ok(filled.split("\n").every((line) => line.length <= 2000));
  });

  it("fails the build rather than ship a policy without the hashes", () => {
    assert.ok(HEADERS.includes(HASHES_TOKEN));
    assert.throws(() => fillInlineScriptHashes(HEADERS.replace(HASHES_TOKEN, ""), [INDEX]), /no __INLINE_SCRIPT_HASHES__/);
    assert.throws(() => fillInlineScriptHashes(HEADERS, ['<script src="/assets/x.js"></script>']), /No inline script/);
  });
});
