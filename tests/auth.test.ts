import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { checkSession, login } from "../app/lib/auth";

// The admin's sign-in and session check (app/lib/auth.ts), against a stubbed
// fetch, window and localStorage. Signing out is tested in admin-api.test.ts.

const globals = globalThis as { window?: unknown; localStorage?: unknown };
const realFetch = globalThis.fetch;
const realWindow = globals.window;
const realStorage = globals.localStorage;

let stored: Map<string, string>;
let events: string[];
let requests: { url: string; method: string | undefined; body: unknown }[];

/** Every request answers `body` with `status`, and is remembered. */
function answer(status: number, body: unknown) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const sent = init?.body;
    requests.push({ url: input instanceof Request ? input.url : input.toString(), method: init?.method, body: typeof sent === "string" ? JSON.parse(sent) : undefined });
    return Response.json(body, { status });
  };
}

beforeEach(() => {
  stored = new Map();
  events = [];
  requests = [];
  const target = new EventTarget();
  target.addEventListener("AUTH_EXPIRED", (event) => events.push(event.type));
  globals.window = target;
  globals.localStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  globals.window = realWindow;
  globals.localStorage = realStorage;
});

void describe("login()", () => {
  void it("posts the password and remembers that this browser has a session", async () => {
    answer(200, { ok: true });
    await login("correct horse");
    assert.equal(requests[0]?.url, "/api/auth/login");
    assert.equal(requests[0]?.method, "POST");
    assert.deepEqual(requests[0]?.body, { password: "correct horse" });
    assert.equal(stored.get("has_session"), "true");
  });

  void it("throws the server's error with its retryAfter, and remembers nothing", async () => {
    answer(429, { error: "Too many attempts.", retryAfter: 30 });
    await assert.rejects(login("guess"), (error: Error & { retryAfter?: number }) => {
      assert.equal(error.message, "Too many attempts.");
      assert.equal(error.retryAfter, 30);
      return true;
    });
    assert.equal(stored.has("has_session"), false);
  });

  void it("says the sign-in failed when the server gives no reason", async () => {
    answer(401, {});
    await assert.rejects(login("guess"), /^Error: Login failed$/u);
  });
});

void describe("checkSession()", () => {
  void it("answers true for a session, and raises nothing", async () => {
    stored.set("has_session", "true");
    answer(200, { authenticated: true });
    assert.equal(await checkSession(), true);
    assert.equal(requests[0]?.url, "/api/auth/check");
    assert.deepEqual(events, []);
  });

  void it("raises AUTH_EXPIRED when this browser had a session that ended", async () => {
    stored.set("has_session", "true");
    answer(200, { authenticated: false });
    assert.equal(await checkSession(), false);
    assert.deepEqual(events, ["AUTH_EXPIRED"]);
  });

  void it("raises nothing for a browser that never signed in", async () => {
    answer(200, { authenticated: false });
    assert.equal(await checkSession(), false);
    assert.deepEqual(events, []);
  });
});
