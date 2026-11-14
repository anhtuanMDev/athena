import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { githubRepo } from "../app/lib/importer/repo";
import { createSessionToken } from "../app/lib/session";
import { decodeUtf8Base64 } from "../app/lib/utf8-base64";

// The handler is type-checked with Workers' types (functions/tsconfig.json);
// a computed specifier keeps it out of the app's DOM-typed program.
const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

// Every writer of the data repo stores JSON the same way: 2-space indent and a
// final newline, so a file saved by one writer and then another never shows
// "\ No newline at end of file" in its diff.
const MODE = { id: "push", name: "Push", tags: ["é", 2] };
const STORED = '{\n  "id": "push",\n  "name": "Push",\n  "tags": [\n    "é",\n    2\n  ]\n}\n';

describe("JSON files as the data repo stores them", () => {
  const SECRET = "test-session-secret";
  const realFetch = globalThis.fetch;
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let written: { path: string; text: string }[];

  beforeEach(() => {
    written = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const body = init?.body ? JSON.parse(String(init.body)) : input instanceof Request ? await input.clone().json().catch(() => undefined) : undefined;
      const route = url.pathname.replace(/^\/repos\/o\/r/, "");
      if (url.hostname !== "api.github.com" || route === url.pathname) throw new Error(`unexpected request to ${url.href}`);
      // The contents API (the admin's saves).
      if (method === "PUT" && route.startsWith("/contents/")) {
        written.push({ path: decodeURIComponent(route.slice("/contents/".length)), text: decodeUtf8Base64(body.content) });
        return Response.json({ content: { sha: "new-sha" } });
      }
      // The git data API (imports).
      if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: "c1" } });
      if (method === "GET" && route.startsWith("/git/commits/")) return Response.json({ tree: { sha: "t1" } });
      if (method === "POST" && route === "/git/trees") {
        for (const entry of body.tree) written.push({ path: entry.path, text: entry.content });
        return Response.json({ sha: "t2" });
      }
      if (method === "POST" && route === "/git/commits") return Response.json({ sha: "c2" });
      if (method === "PATCH" && route === "/git/refs/heads/main") return Response.json({ object: { sha: "c2" } });
      throw new Error(`unexpected ${method} ${url.href}`);
    }) as typeof fetch;
    (globalThis as { caches?: unknown }).caches = { default: { async match() {}, async put() {}, async delete() { return true; } } };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  const kv = { async get() { return null; }, async put() {} };
  const save = async (body: unknown) => {
    const waits: Promise<unknown>[] = [];
    const response = await api({
      request: new Request("https://athena.example/api/data/file", {
        method: "POST",
        headers: { Cookie: `__admin_session=${await createSessionToken(SECRET, "0")}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET } as never,
      params: {},
      next: async () => new Response(null),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    return response;
  };

  it("an admin save, new or edited, ends with a newline", async () => {
    assert.equal((await save({ path: "data/overwatch/modes/push.json", content: MODE, sha: "old-sha" })).status, 200);
    // A new record (no sha): its file is named by its id, as the write API checks.
    const created = await save({ path: "data/overwatch/modes/push.json", content: MODE });
    assert.equal(created.status, 200);
    assert.deepEqual(written, [
      { path: "data/overwatch/modes/push.json", text: STORED },
      { path: "data/overwatch/modes/push.json", text: STORED },
    ]);
  });

  it("an import's commit writes exactly what an admin save does", async () => {
    const changes = [{ path: "data/overwatch/modes/push.json", content: MODE }];
    await githubRepo({ GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r" }).edit({ reads: [], changes: () => changes, message: "Import" });
    assert.deepEqual(written, [{ path: "data/overwatch/modes/push.json", text: STORED }]);
  });

  it("a picture is stored as the bytes it was sent as", async () => {
    // A PNG's whole signature: anything less isn't taken as a picture (picture-rules.ts).
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64");
    assert.equal((await save({ path: "public/assets/overwatch/x.png", content: png, isBase64: true })).status, 200);
    assert.equal(Buffer.from(written[0].text, "latin1").toString("base64"), png);
  });
});
