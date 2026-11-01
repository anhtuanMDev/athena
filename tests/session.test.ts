import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SESSION_TTL_SECONDS,
  SESSION_VERSION_KEY,
  createSessionToken,
  readSessionVersion,
  revokeSessions,
  verifySessionToken,
} from "../app/lib/session";

const SECRET = "test-secret";
const NOW = Date.UTC(2026, 10, 1, 12);
const HOUR = 60 * 60 * 1000;

function memoryKv(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    },
  };
}

/** The token with its payload's JSON changed by `edit`, keeping the original signature. */
function withClaims(token: string, edit: (claims: Record<string, unknown>) => void): string {
  const [payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  edit(claims);
  return `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
}

describe("session tokens", () => {
  it("verify for their lifetime under the version they were issued for", async () => {
    const token = await createSessionToken(SECRET, "v1", NOW);
    assert.equal(await verifySessionToken(token, SECRET, "v1", NOW), true);
    assert.equal(await verifySessionToken(token, SECRET, "v1", NOW + 7 * HOUR), true);
    assert.equal(SESSION_TTL_SECONDS, 8 * 60 * 60);
  });

  it("expire, and aren't accepted before they were issued", async () => {
    const token = await createSessionToken(SECRET, "v1", NOW);
    assert.equal(await verifySessionToken(token, SECRET, "v1", NOW + 8 * HOUR), false);
    assert.equal(await verifySessionToken(token, SECRET, "v1", NOW + 30 * 24 * HOUR), false);
    assert.equal(await verifySessionToken(token, SECRET, "v1", NOW - 30_000), true); // clock skew
    assert.equal(await verifySessionToken(token, SECRET, "v1", NOW - 5 * 60_000), false);
  });

  it("reject tampering with the claims or the signature, and other secrets", async () => {
    const token = await createSessionToken(SECRET, "v1", NOW);
    const later = NOW + 9 * HOUR;
    assert.equal(await verifySessionToken(withClaims(token, (c) => (c.exp = later + HOUR)), SECRET, "v1", later), false);
    assert.equal(await verifySessionToken(withClaims(token, (c) => (c.v = "v2")), SECRET, "v2", NOW), false);
    const [payload, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    assert.equal(await verifySessionToken(`${payload}.${flipped}`, SECRET, "v1", NOW), false);
    assert.equal(await verifySessionToken(token, "another-secret", "v1", NOW), false);
  });

  it("reject a signed token that claims to last longer than a session", async () => {
    // Signed like createSessionToken does, but with a month's lifetime (e.g. issued before the session got shorter).
    const payload = Buffer.from(JSON.stringify({ iat: NOW, exp: NOW + 30 * 24 * HOUR, v: "v1" })).toString("base64url");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))).toString("base64url");
    assert.equal(await verifySessionToken(`${payload}.${signature}`, SECRET, "v1", NOW + 9 * HOUR), false);
    const fresh = Buffer.from(JSON.stringify({ iat: NOW, exp: NOW + HOUR, v: "v1" })).toString("base64url");
    const freshSignature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(fresh))).toString("base64url");
    assert.equal(await verifySessionToken(`${fresh}.${freshSignature}`, SECRET, "v1", NOW), true);
  });

  it("reject malformed tokens and the old fixed cookie", async () => {
    for (const token of ["", "true", "a.b.c", "..", "%%%.%%%", "eyJpYXQiOjF9.", "true.8f3c5bd0d26a44d6a3a6c1e0e2f0b3e1c5d7b2a9f4e6d8c0b2a4f6e8d0c2b4a6"]) {
      assert.equal(await verifySessionToken(token, SECRET, "0", NOW), false, JSON.stringify(token));
    }
  });
});

describe("session versions", () => {
  it("start at 0 and change when sessions are revoked, ending every earlier session", async () => {
    const kv = memoryKv();
    assert.equal(await readSessionVersion(kv), "0");
    const token = await createSessionToken(SECRET, "0", NOW);
    await revokeSessions(kv);
    const next = await readSessionVersion(kv);
    assert.ok(next && next !== "0");
    assert.equal(kv.values.get(SESSION_VERSION_KEY), next);
    assert.equal(await verifySessionToken(token, SECRET, next!, NOW), false);
    assert.equal(await verifySessionToken(await createSessionToken(SECRET, next!, NOW), SECRET, next!, NOW), true);
  });

  it("can't be read without KV or when KV fails, so callers fail closed", async () => {
    assert.equal(await readSessionVersion(undefined), null);
    const failing = {
      async get(): Promise<string | null> {
        throw new Error("KV down");
      },
      async put() {},
    };
    assert.equal(await readSessionVersion(failing), null);
  });
});
