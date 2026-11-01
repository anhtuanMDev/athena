import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { CATEGORIES_PATH, DEFAULT_CATEGORIES, normalizeCategories } from "../app/lib/categories";
import { buildInitPayload, type RepoReader } from "../app/lib/mobile-payload";
import { BODY_LIMIT, TITLE_LIMIT, renderNotification, renderTemplate, templateFieldsByCategory } from "../app/lib/notify-template";
import {
  ANDROID_CHANNEL_ID,
  PUSHES_PER_GAME_PER_HOUR,
  PUSH_TIMEOUT_MS,
  PUSH_TOPIC,
  fcmMessage,
  pushAfterWrite,
  readServiceAccount,
  signJwt,
  takePushSlot,
  type PushEnv,
  type PushStore,
} from "../app/lib/push";
import { createSessionToken } from "../app/lib/session";
import { dataWriteProblems, validateDataFile } from "../app/lib/screen-policy";
import { encodeUtf8Base64 } from "../app/lib/utf8-base64";

// The handler is type-checked with Workers' types (functions/tsconfig.json);
// a computed specifier keeps it out of the app's DOM-typed program.
const handler = "../functions/api/[[path]].ts";
const { onRequest: api } = (await import(handler)) as { onRequest: (context: unknown) => Promise<Response> };

// Google never sees these tests: every request goes to the fetcher passed in,
// at these made-up hosts, and the key is generated here for each run.
const OAUTH = "https://oauth.test/token";
const FCM = "https://fcm.test";
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 1, 9);

const pem = (der: ArrayBuffer) =>
  `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
const keys = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const PRIVATE_PEM = pem(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
const CREDENTIALS = JSON.stringify({
  type: "service_account",
  project_id: "zms-test-1",
  client_email: "pusher@zms-test-1.iam.gserviceaccount.com",
  private_key: PRIVATE_PEM,
});
const ACCESS_TOKEN = "ya29.made-up-access-token";

const NEWS_NOTIFY = { enabled: true, title: "{title}", body: "{summary}" };
const categoriesFile = (notify: unknown = NEWS_NOTIFY) => ({
  categories: DEFAULT_CATEGORIES.map((c) => (c.category === "news" ? { ...c, notify } : c)),
});
const NEWS_SCHEMA = {
  id: "news-news-article",
  category: "news",
  fields: [
    { key: "title", label: "Title", type: "string", required: true },
    { key: "summary", label: "Summary", type: "string" },
    { key: "tags", label: "Tags", type: "list" },
    { key: "highlights", label: "Highlights", type: "object_array" },
    { key: "pinned", label: "Pinned", type: "boolean" },
  ],
};
const ARTICLE = { id: "season-21", title: "Season 21 is live", summary: "New hero, new map." };
const NEWS_PATH = "data/overwatch/news/season-21.json";

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

/** The data repo as pushAfterWrite reads it. */
function repoFiles(files: Record<string, unknown>) {
  const reads: string[] = [];
  return {
    reads,
    read: async (path: string) => {
      reads.push(path);
      if (!(path in files)) throw notFound();
      return JSON.stringify(files[path]);
    },
  };
}

function memoryKv() {
  const values = new Map<string, string>();
  const puts: { key: string; ttl?: number }[] = [];
  const kv: PushStore = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value, options) {
      puts.push({ key, ttl: options?.expirationTtl });
      values.set(key, value);
    },
  };
  return { kv, values, puts };
}

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** A stand-in for Google's token endpoint and FCM, recording what reaches it. */
function fakeGoogle(answer: { token?: number; send?: number } = {}) {
  const requests: Sent[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body ?? "") });
    if (url === OAUTH) {
      return new Response(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 3599, token_type: "Bearer" }), { status: answer.token ?? 200 });
    }
    if (url === `${FCM}/v1/projects/zms-test-1/messages:send`) {
      return new Response(JSON.stringify({ name: "projects/zms-test-1/messages/1" }), { status: answer.send ?? 200 });
    }
    throw new Error(`unexpected request to ${url}`);
  }) as typeof fetch;
  const sends = () => requests.filter((r) => r.url.startsWith(FCM)).map((r) => JSON.parse(r.body));
  return { fetcher, requests, sends };
}

function setup(options: { files?: Record<string, unknown>; credentials?: string; kv?: boolean; google?: { token?: number; send?: number } } = {}) {
  const files = options.files ?? {
    [CATEGORIES_PATH]: categoriesFile(),
    "data/_meta/games.json": { games: [{ slug: "overwatch", active: true }, { slug: "marvel-rivals", active: false }] },
  };
  const repo = repoFiles(files);
  const store = memoryKv();
  const google = fakeGoogle(options.google);
  let now = T0;
  const env: PushEnv = {
    credentials: "credentials" in options ? options.credentials : CREDENTIALS,
    kv: options.kv === false ? undefined : store.kv,
    read: repo.read,
  };
  const deps = { fetcher: google.fetcher, oauthUrl: OAUTH, fcmUrl: FCM, now: () => now };
  const publish = (write: Partial<Parameters<typeof pushAfterWrite>[0]> = {}) =>
    pushAfterWrite({ path: NEWS_PATH, content: ARTICLE, notify: true, ...write }, env, deps);
  return { publish, google, store, repo, setNow: (t: number) => (now = t) };
}

/** Every console call during `run`, as text. */
async function consoleDuring<T>(run: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const calls: unknown[][] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const saved = methods.map((m) => console[m]);
  for (const m of methods) console[m] = (...args: unknown[]) => void calls.push(args);
  try {
    const result = await run();
    return { result, logged: calls.map((args) => args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" ")).join("\n") };
  } finally {
    methods.forEach((m, i) => (console[m] = saved[i] as never));
  }
}

/** Fails when any 8 characters in a row of `secret` appear in `text`. */
function assertNothingOf(secret: string, text: string) {
  for (let i = 0; i + 8 <= secret.length; i++) {
    const piece = secret.slice(i, i + 8);
    assert.ok(!text.includes(piece), `"${piece}" leaked`);
  }
}

describe("notification templates", () => {
  it("fill in fields, join lists, and leave missing ones empty", () => {
    const record = { title: "Patch 2.1", tags: ["Tank", "Support"], count: 3, nested: { a: 1 }, highlights: [{ description: "x" }] };
    assert.equal(renderTemplate("{title}: {tags} ({count})", record, 100), "Patch 2.1: Tank, Support (3)");
    assert.equal(renderTemplate("{missing}{nested}{highlights} {title}", record, 100), "Patch 2.1");
    assert.equal(renderTemplate("{constructor}{toString}", record, 100), "");
  });

  it("strip control and bidi characters and collapse the line", () => {
    const record = { title: "Bad\u0000\u0007 title\nwith\tbreaks\u202Egnp.exe\u2066x\u0085" };
    assert.equal(renderTemplate("  {title}  ", record, 100), "Bad title with breaks gnp.exe x");
  });

  it("cap the title at 65 and the body at 240 characters, by code point", () => {
    assert.equal(TITLE_LIMIT, 65);
    assert.equal(BODY_LIMIT, 240);
    const { title, body } = renderNotification({ enabled: true, title: "{t}", body: "{b}" }, { t: "x".repeat(64) + "😀😀", b: "y".repeat(500) });
    assert.equal(Array.from(title).length, 65);
    assert.equal(title, `${"x".repeat(64)}…`);
    assert.equal(Array.from(body).length, 240);
    assert.ok(body.endsWith("…"));
    const emoji = renderTemplate("{t}", { t: "😀".repeat(70) }, TITLE_LIMIT);
    assert.equal(emoji, `${"😀".repeat(64)}…`);
    assert.equal(renderTemplate("{t}", { t: "x".repeat(65) }, TITLE_LIMIT), "x".repeat(65));
  });
});

describe("notify in categories.json", () => {
  const fields = templateFieldsByCategory([NEWS_SCHEMA, { category: "hero", fields: [{ key: "description", type: "string" }] }]);

  it("keeps every category when notify is malformed, and reports it", () => {
    for (const bad of ["yes", { title: "{title}" }, { enabled: true, title: "  " }, { enabled: true, title: "{Title X}" }, { enabled: true, title: "x", body: 3 }]) {
      const { categories, problems } = normalizeCategories(categoriesFile(bad));
      assert.deepEqual(categories, DEFAULT_CATEGORIES, JSON.stringify(bad));
      assert.ok(problems.length > 0, JSON.stringify(bad));
    }
    const { categories, problems } = normalizeCategories(categoriesFile());
    assert.deepEqual(problems, []);
    assert.deepEqual(categories.find((c) => c.category === "news")?.notify, NEWS_NOTIFY);
  });

  it("refuses templates naming fields the category's schemas don't have, on save", () => {
    assert.deepEqual(validateDataFile(CATEGORIES_PATH, categoriesFile(), DEFAULT_CATEGORIES, fields), []);
    const refused = (notify: unknown) => validateDataFile(CATEGORIES_PATH, categoriesFile(notify), DEFAULT_CATEGORIES, fields);
    assert.match(refused({ enabled: true, title: "{author}", body: "" }).join(" "), /\{author\}/);
    // Not text: a list of entries, or yes/no.
    assert.equal(refused({ enabled: true, title: "{title}", body: "{highlights} {pinned}" }).length, 2);
    // name is built into hero, map and mode records only; every record has an id.
    assert.equal(refused({ enabled: true, title: "{name}", body: "" }).length, 1);
    assert.deepEqual(refused({ enabled: true, title: "{id}: {title}", body: "{tags}" }), []);
    const heroes = { categories: DEFAULT_CATEGORIES.map((c) => (c.category === "hero" ? { ...c, notify: { enabled: false, title: "New hero: {name}", body: "{description}" } } : c)) };
    assert.deepEqual(validateDataFile(CATEGORIES_PATH, heroes, DEFAULT_CATEGORIES, fields), []);
    // As base64 too, and with no schema fields known only the built-ins pass.
    assert.equal(dataWriteProblems(CATEGORIES_PATH, encodeUtf8Base64(JSON.stringify(categoriesFile({ enabled: true, title: "{author}", body: "" }))), true, DEFAULT_CATEGORIES, fields).length, 1);
    assert.equal(validateDataFile(CATEGORIES_PATH, categoriesFile()).length, 2);
  });

  it("isn't sent to the app", async () => {
    const files: Record<string, string> = {
      "data/_meta/games.json": JSON.stringify({ games: [{ slug: "overwatch", active: true }] }),
      [CATEGORIES_PATH]: JSON.stringify(categoriesFile()),
    };
    const reader: RepoReader = {
      async list() {
        throw notFound();
      },
      async read(path) {
        if (!(path in files)) throw notFound();
        return files[path];
      },
      async assets() {
        return new Map();
      },
    };
    const { payload } = await buildInitPayload(reader);
    assert.deepEqual(payload.categories, DEFAULT_CATEGORIES);
    assert.ok(!JSON.stringify(payload).includes("notify"));
  });
});

describe("credentials", () => {
  it("are read from the service account's JSON key", async () => {
    const account = await readServiceAccount(CREDENTIALS);
    assert.equal(account?.projectId, "zms-test-1");
    assert.equal(account?.clientEmail, "pusher@zms-test-1.iam.gserviceaccount.com");
  });

  it("missing or unusable mean not configured: nothing sent, nothing logged", async () => {
    const broken = [
      undefined,
      "",
      "not json",
      JSON.stringify({ ...JSON.parse(CREDENTIALS), private_key: undefined }),
      JSON.stringify({ ...JSON.parse(CREDENTIALS), client_email: "" }),
      JSON.stringify({ ...JSON.parse(CREDENTIALS), project_id: "../other" }),
      JSON.stringify({ ...JSON.parse(CREDENTIALS), private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" }),
    ];
    for (const credentials of broken) {
      const { publish, google, store } = setup({ credentials });
      const { result, logged } = await consoleDuring(() => publish());
      assert.deepEqual(result, { status: "not_configured" }, String(credentials));
      assert.equal(google.requests.length, 0);
      assert.equal(store.puts.length, 0);
      assert.equal(logged, "");
    }
  });

  it("never let any part of a broken secret out, through a result or a log", async () => {
    const secrets = [
      // Not JSON: JSON.parse's message quotes the start ("Unexpected token 'M', "MIIEvQIBAD"…).
      "MIIEvQIBADANSUPERSECRETKEYMATERIAL0123456789",
      // And the text around a mistake further in.
      `{"project_id":"zms-test-1","private_key": MIIEvQIBADANSUPERSECRETKEYMATERIAL0123456789}`,
      // Cut off mid-key.
      `{"type":"service_account","project_id":"zms-test-1","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANSUPERSECRETKEYMATERIAL0123456789`,
      // Valid JSON, but importKey can't read the key.
      JSON.stringify({ project_id: "zms-test-1", client_email: "a@b.c", private_key: "-----BEGIN PRIVATE KEY-----\nU1VQRVJTRUNSRVRLRVlNQVRFUklBTDAxMjM0NTY3ODk=\n-----END PRIVATE KEY-----" }),
      // Not base64 at all.
      JSON.stringify({ project_id: "zms-test-1", client_email: "a@b.c", private_key: "-----BEGIN PRIVATE KEY-----\n!!SUPERSECRET%%KEYMATERIAL!!\n-----END PRIVATE KEY-----" }),
    ];
    for (const secret of secrets) {
      const { result: account, logged: readLog } = await consoleDuring(() => readServiceAccount(secret));
      assert.equal(account, null);
      const { publish } = setup({ credentials: secret });
      const { result, logged } = await consoleDuring(() => publish());
      assert.deepEqual(result, { status: "not_configured" });
      assertNothingOf(secret, `${JSON.stringify(result)}\n${readLog}\n${logged}`);
    }
  });
});

describe("the push", () => {
  it("is signed with an RS256 assertion that the public key verifies", async () => {
    const account = (await readServiceAccount(CREDENTIALS))!;
    const jwt = await signJwt(account, OAUTH, T0);
    const [header, claims, signature] = jwt.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
    assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
    assert.deepEqual(decode(claims), {
      iss: "pusher@zms-test-1.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: OAUTH,
      iat: T0 / 1000,
      exp: T0 / 1000 + 3600,
    });
    const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${claims}`));
    assert.equal(verified, true);
    const tampered = `${header}.${Buffer.from(JSON.stringify({ ...decode(claims), iss: "x@y.z" })).toString("base64url")}`;
    assert.equal(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(tampered)), false);
  });

  it("goes to every player's topic, on the app's channel, with only string data the app opens", () => {
    const message = fcmMessage({ title: "T", body: "B" }, { game: "overwatch", category: "news", folder: "news", id: "season-21" });
    assert.deepEqual(message, {
      message: {
        topic: "all_users",
        notification: { title: "T", body: "B" },
        data: { game: "overwatch", category: "news", folder: "news", id: "season-21" },
        android: { notification: { channel_id: "default" } },
      },
    });
    assert.equal(PUSH_TOPIC, "all_users");
    assert.equal(ANDROID_CHANNEL_ID, "default");
    // FCM refuses these data keys.
    for (const [key, value] of Object.entries(message.message.data)) {
      assert.ok(!["from", "notification", "message_type"].includes(key) && !/^(google|gcm)/i.test(key), key);
      assert.equal(typeof value, "string");
    }
    assert.deepEqual(fcmMessage({ title: "T", body: "" }, { game: "g", category: "c", folder: "f", id: "i" }).message.notification, { title: "T" });
  });

  it("is sent from the category's templates and the saved record, through a fresh token", async () => {
    const { publish, google, store } = setup();
    assert.deepEqual(await publish(), { status: "sent" });
    const [tokenRequest, sendRequest] = google.requests;
    assert.equal(tokenRequest.url, OAUTH);
    const form = new URLSearchParams(tokenRequest.body);
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = form.get("assertion")!.split(".");
    assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${claims}`)));
    assert.equal(sendRequest.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
    assert.deepEqual(google.sends(), [
      fcmMessage({ title: "Season 21 is live", body: "New hero, new map." }, { game: "overwatch", category: "news", folder: "news", id: "season-21" }),
    ]);
    assert.deepEqual(store.puts, [{ key: "push_sent:overwatch", ttl: 3600 }]);
  });

  it("takes its text from the server's config only, whatever the request adds", async () => {
    const { publish, google } = setup();
    const injected = { title: "INJECTED", body: "INJECTED", notification: { title: "INJECTED" }, push: { title: "INJECTED" }, message: "INJECTED" };
    assert.deepEqual(await publish(injected as never), { status: "sent" });
    assert.ok(!JSON.stringify(google.requests).includes("INJECTED"));
    assert.equal(google.sends()[0].message.notification.title, "Season 21 is live");
    // Only notify: true asks for a push.
    for (const notify of [undefined, false, "true", 1, {}]) assert.equal(await publish({ notify }), undefined);
    assert.equal(google.sends().length, 1);
  });

  it("is never sent for an edit or anything but a new record", async () => {
    const { publish, google, store } = setup();
    for (const write of [
      { sha: "a1b2c3" },
      { isBase64: true, content: encodeUtf8Base64(JSON.stringify(ARTICLE)) },
      { path: "data/overwatch/screens/home.json" },
      { path: "data/_meta/games.json" },
      { content: "not a record" },
    ]) {
      const result = await publish(write);
      assert.equal(result?.status, "skipped", JSON.stringify(write));
    }
    assert.equal(google.requests.length, 0);
    assert.equal(store.puts.length, 0);
  });

  it("is skipped when there's nothing right to send, before counting it", async () => {
    const files = (categories: unknown, games = [{ slug: "overwatch", active: true }, { slug: "marvel-rivals", active: false }]) => ({
      [CATEGORIES_PATH]: categories,
      "data/_meta/games.json": { games },
    });
    const cases: [string, ReturnType<typeof setup>, Parameters<ReturnType<typeof setup>["publish"]>[0]][] = [
      ["no notify for the category", setup({ files: files({ categories: DEFAULT_CATEGORIES }) }), {}],
      ["no categories file", setup({ files: { "data/_meta/games.json": { games: [{ slug: "overwatch" }] } } }), {}],
      ["hidden game", setup(), { path: "data/marvel-rivals/news/season-21.json" }],
      ["unknown game", setup(), { path: "data/valorant/news/season-21.json" }],
      ["id isn't the file name", setup(), { content: { ...ARTICLE, id: "other" } }],
      ["empty title", setup(), { content: { id: "season-21", title: " \u0000 " } }],
      ["folder isn't a category", setup(), { path: "data/overwatch/events/season-21.json" }],
    ];
    for (const [name, { publish, google, store }, write] of cases) {
      const result = await publish(write);
      assert.equal(result?.status, "skipped", name);
      assert.ok(result?.warning, name);
      assert.equal(google.requests.length, 0, name);
      assert.equal(store.puts.length, 0, name);
    }
  });

  it("fails without leaking anything when Google or KV says no", async () => {
    const outputs: string[] = [];
    for (const [google, kv, expected] of [
      [{ token: 401 }, true, /refused the service account \(401\)/],
      [{ send: 500 }, true, /answered 500/],
      [{}, false, /RATE_LIMIT_KV/],
    ] as const) {
      const { publish } = setup({ google, kv });
      const { result, logged } = await consoleDuring(() => publish());
      assert.equal(result?.status, "failed");
      assert.match(result!.warning!, expected);
      outputs.push(JSON.stringify(result), logged);
    }
    const all = outputs.join("\n");
    assert.ok(!all.includes(ACCESS_TOKEN));
    assert.ok(!all.includes("eyJ"), "no JWT");
    assertNothingOf(PRIVATE_PEM.replace(/-----[A-Z ]+-----|\s/g, ""), all);
  });
});

describe("the limit", () => {
  it(`allows ${PUSHES_PER_GAME_PER_HOUR} pushes per game in any hour`, async () => {
    assert.equal(PUSHES_PER_GAME_PER_HOUR, 3);
    const { kv } = memoryKv();
    for (let i = 0; i < 3; i++) assert.equal(await takePushSlot(kv, "overwatch", T0 + i * 1000), true);
    assert.equal(await takePushSlot(kv, "overwatch", T0 + 3000), false);
    assert.equal(await takePushSlot(kv, "overwatch", T0 + HOUR - 1), false);
    assert.equal(await takePushSlot(kv, "marvel-rivals", T0 + 3000), true, "per game");
    // The first send leaves the hour: one slot frees up.
    assert.equal(await takePushSlot(kv, "overwatch", T0 + HOUR), true);
    assert.equal(await takePushSlot(kv, "overwatch", T0 + HOUR), false);
  });

  it("skips the 4th publish in an hour and sends again the next hour", async () => {
    const { publish, google, setNow } = setup();
    for (let i = 0; i < 3; i++) {
      setNow(T0 + i * 60_000);
      assert.deepEqual(await publish({ path: `data/overwatch/news/a${i}.json`, content: { ...ARTICLE, id: `a${i}` } }), { status: "sent" });
    }
    setNow(T0 + 30 * 60_000);
    const fourth = await publish({ path: "data/overwatch/news/a3.json", content: { ...ARTICLE, id: "a3" } });
    assert.equal(fourth?.status, "skipped");
    assert.match(fourth!.warning!, /3 notifications were already sent for this game in the last hour/);
    assert.equal(google.sends().length, 3);
    setNow(T0 + HOUR);
    assert.deepEqual(await publish({ path: "data/overwatch/news/a4.json", content: { ...ARTICLE, id: "a4" } }), { status: "sent" });
    assert.equal(google.sends().length, 4);
  });
});

describe("a push that hangs", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it(`fails after ${PUSH_TIMEOUT_MS / 1000} s, and the publish isn't held up longer`, async () => {
    assert.equal(PUSH_TIMEOUT_MS, 5000);
    let calledGoogle!: () => void;
    const called = new Promise<void>((resolve) => (calledGoogle = resolve));
    let aborted = false;
    const hanging = ((_: RequestInfo | URL, init?: RequestInit) => {
      calledGoogle();
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        }),
      );
    }) as typeof fetch;
    const files = repoFiles({ [CATEGORIES_PATH]: categoriesFile(), "data/_meta/games.json": { games: [{ slug: "overwatch" }] } });
    let settled = false;
    const pending = pushAfterWrite({ path: NEWS_PATH, content: ARTICLE, notify: true }, { credentials: CREDENTIALS, kv: memoryKv().kv, read: files.read }, { fetcher: hanging, oauthUrl: OAUTH, fcmUrl: FCM }).then((r) => {
      settled = true;
      return r;
    });
    await called;
    mock.timers.tick(PUSH_TIMEOUT_MS - 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    mock.timers.tick(1);
    const { result } = await consoleDuring(() => pending);
    assert.deepEqual(result, { status: "failed", warning: "The push service didn't answer within 5 s." });
    assert.equal(aborted, true);
  });
});

describe("the API", () => {
  // GitHub, KV and the Workers cache answered in memory; any other request fails the test.
  const SECRET = "test-session-secret";
  const realFetch = globalThis.fetch;
  const realCaches = (globalThis as { caches?: unknown }).caches;
  let files: Record<string, unknown>;
  let requests: string[];
  let written: string[];

  const contents = (path: string) => {
    const dir = Object.keys(files).filter((p) => p.startsWith(`${path}/`));
    if (path in files) {
      const content = Buffer.from(JSON.stringify(files[path])).toString("base64");
      return Response.json({ type: "file", encoding: "base64", content, sha: "sha-1", path, name: path.split("/").pop() });
    }
    if (dir.length > 0) return Response.json(dir.map((p) => ({ type: "file", name: p.split("/").pop(), path: p, sha: "sha-1" })));
    return Response.json({ message: "Not Found" }, { status: 404 });
  };

  beforeEach(() => {
    requests = [];
    written = [];
    files = {
      [CATEGORIES_PATH]: categoriesFile(),
      "data/_meta/games.json": { games: [{ slug: "overwatch", active: true }] },
      "data/overwatch/schemas/news-news-article.json": NEWS_SCHEMA,
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url.href);
      const match = /^\/repos\/o\/r\/contents\/(.+)$/.exec(url.pathname);
      if (url.hostname !== "api.github.com" || !match) throw new Error(`unexpected request to ${url.href}`);
      const path = decodeURIComponent(match[1]);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method === "PUT") {
        written.push(path);
        return Response.json({ content: { sha: "new-sha", path } }, { status: 201 });
      }
      return contents(path);
    }) as typeof fetch;
    (globalThis as { caches?: unknown }).caches = { default: { async match() {}, async put() {}, async delete() { return true; } } };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  const kv = memoryKv().kv;
  const call = async (method: string, path: string, body?: unknown, env: Record<string, unknown> = {}, signedIn = true) => {
    const cookie = signedIn ? `__admin_session=${await createSessionToken(SECRET, "0")}` : "";
    const response = await api({
      request: new Request(`https://athena.example/api/${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
      env: { RATE_LIMIT_KV: kv, GITHUB_TOKEN: "none", GITHUB_OWNER: "o", GITHUB_REPO: "r", SESSION_SECRET: SECRET, ...env } as never,
      params: {},
      next: async () => new Response(null),
    });
    return { status: response.status, body: (await response.json()) as { error?: string; push?: { status: string } } };
  };

  it("says whether pushes are set up, to a signed-in admin only", async () => {
    assert.equal((await call("GET", "push/status", undefined, {}, false)).status, 401);
    assert.deepEqual((await call("GET", "push/status")).body, { configured: false });
    assert.deepEqual((await call("GET", "push/status", undefined, { FCM_SERVICE_ACCOUNT: "{nope" })).body, { configured: false });
    assert.deepEqual((await call("GET", "push/status", undefined, { FCM_SERVICE_ACCOUNT: CREDENTIALS })).body, { configured: true });
  });

  it("saves a record and reports its push; an edit never asks Google", async () => {
    const created = await call("POST", "data/file", { path: NEWS_PATH, content: ARTICLE, notify: true });
    assert.equal(created.status, 200);
    assert.deepEqual(created.body, { ok: true, sha: "new-sha", push: { status: "not_configured" } });
    assert.deepEqual(written, [NEWS_PATH]);

    const edited = await call("POST", "data/file", { path: NEWS_PATH, content: ARTICLE, sha: "sha-1", notify: true }, { FCM_SERVICE_ACCOUNT: CREDENTIALS });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.push?.status, "skipped");
    assert.deepEqual(await call("POST", "data/file", { path: NEWS_PATH, content: ARTICLE, sha: "sha-1" }).then((r) => r.body), { ok: true, sha: "new-sha" });
    assert.ok(requests.every((url) => new URL(url).hostname === "api.github.com"));
  });

  it("refuses a categories.json whose templates name unknown fields, reading every game's schemas", async () => {
    const bad = await call("POST", "data/file", { path: CATEGORIES_PATH, content: categoriesFile({ enabled: true, title: "{author}", body: "" }) });
    assert.equal(bad.status, 400);
    assert.match(String(bad.body.error), /\{author\}/);
    assert.deepEqual(written, []);
    const good = await call("POST", "data/file", { path: CATEGORIES_PATH, content: categoriesFile() });
    assert.equal(good.status, 200);
    assert.deepEqual(written, [CATEGORIES_PATH]);
  });
});
