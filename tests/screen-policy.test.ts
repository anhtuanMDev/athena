import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { assetHeaders } from "../app/lib/asset-headers";
import { DEFAULT_CATEGORIES, readsCategories, referenceEndpoints } from "../app/lib/categories";
import {
  LIMITS,
  dataWriteProblems,
  httpsHost,
  isAllowedLink,
  validateDataFile,
  validateNavigationFile,
  validateSchemaFile,
  validateScreenFile,
} from "../app/lib/screen-policy";
// P2: the app's policy (limits, its own screens) read from the block manifest.
import * as policy from "../app/lib/screen-policy";
import { encodeUtf8Base64 } from "../app/lib/utf8-base64";

const block = (props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: "b1",
  type: "promo_card",
  props,
  ...extra,
});
const screen = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({ type: "page", blocks, ...extra });

describe("links", () => {
  it("allows https on listed sites and their subdomains", () => {
    assert.ok(isAllowedLink("https://overwatch.blizzard.com/en-us/news/"));
    assert.ok(isAllowedLink("https://www.youtube.com/watch?v=1"));
    assert.ok(isAllowedLink("HTTPS://YouTube.com"));
    assert.ok(isAllowedLink("https://youtu.be:443/x"));
  });

  it("rejects other schemes, look-alike hosts and tricks", () => {
    for (const url of [
      "http://youtube.com",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://youtube.com.evil.com",
      "https://evilyoutube.com",
      "https://youtube.com@evil.com/",
      "https://user:pass@youtube.com",
      "https://youtube.com:8443/",
      "https://127.0.0.1/",
      "https://evil.com/?r=https://youtube.com",
      "https://evil.com#youtube.com",
      " https://evil.com",
      "",
      42,
      null,
      `https://youtube.com/${"a".repeat(3000)}`,
    ]) {
      assert.equal(isAllowedLink(url), false, String(url).slice(0, 60));
    }
  });

  it("reads the host only from https URLs", () => {
    assert.equal(httpsHost("https://News.Blizzard.com/a"), "news.blizzard.com");
    assert.equal(httpsHost("ftp://news.blizzard.com"), undefined);
  });
});

describe("screen files", () => {
  it("accepts a well-formed screen", () => {
    assert.deepEqual(
      validateScreenFile(screen([block({ title: "Hi", action: { url: "https://youtube.com/x" } })], { title: "Home", appearance: "dark", accent: "#FF8200" })),
      [],
    );
  });

  it("rejects links to other sites anywhere in props", () => {
    const errors = validateScreenFile(
      screen([block({ items: [{ label: "Free skins", url: "https://evil.example/login" }] })]),
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /evil\.example/);
  });

  it("accepts links bound to a record, which the app checks when opened", () => {
    assert.deepEqual(validateScreenFile(screen([block({ action: { url: "data.url" } })])), []);
    assert.deepEqual(validateScreenFile(screen([block({ action: { url: "item.links.article" } })])), []);
    assert.equal(validateScreenFile(screen([block({ action: { url: "data.url; javascript:x" } })])).length, 1);
    assert.equal(validateScreenFile(screen([block({ action: { url: "record.url" } })])).length, 1);
  });

  it("rejects styles and callbacks", () => {
    const errors = validateScreenFile(screen([block({ style: { position: "absolute" }, onPress: "x" })]));
    assert.equal(errors.length, 2);
  });

  it("rejects malformed structure", () => {
    assert.deepEqual(validateScreenFile(null), ["A screen must be a JSON object."]);
    assert.ok(validateScreenFile({ type: "home" }).includes("blocks must be a list."));
    assert.ok(validateScreenFile(screen([], { type: "admin" })).some((e) => e.startsWith("type must be")));
    assert.ok(validateScreenFile(screen([], { accent: "red; background:url(x)" })).some((e) => e.startsWith("accent")));
    assert.ok(validateScreenFile(screen([block({}, { id: "b1" }), block({}, { id: "b1" })])).some((e) => e.includes("repeats")));
    assert.ok(validateScreenFile(screen(["oops"])).some((e) => e.includes("must be an object")));
    assert.ok(validateScreenFile(screen([block({}, { props: [] })])).some((e) => e.includes("props as an object")));
  });

  it("caps blocks and size", () => {
    const many = Array.from({ length: policy.APP_POLICY.limits.blocksPerScreen + 1 }, (_, i) => block({}, { id: `b${i}` }));
    assert.ok(validateScreenFile(screen(many)).some((e) => e.includes("at most")));
    assert.ok(validateScreenFile(screen([block({ text: "x".repeat(LIMITS.screenSize) })])).includes("The screen file is too large."));
  });
});

describe("navigation", () => {
  const tabs = (list: unknown[]) => ({ tabs: list });

  it("accepts tabs that open existing screens", () => {
    assert.deepEqual(
      validateNavigationFile(tabs([{ screen: "home", label: "Home" }, { screen: "app:settings", label: "Profile" }]), { home: "home" }),
      [],
    );
  });

  it("rejects missing screens, an app screen first, too many tabs and bad labels", () => {
    assert.ok(validateNavigationFile(tabs([{ screen: "gone", label: "X" }]), { home: "home" })[0].includes("doesn't exist"));
    // Inherited object keys aren't screens.
    assert.ok(validateNavigationFile(tabs([{ screen: "constructor", label: "X" }]), { home: "home" })[0].includes("doesn't exist"));
    assert.ok(validateNavigationFile(tabs([{ screen: "app:settings", label: "P" }])).some((e) => e.startsWith("The first tab")));
    const six = Array.from({ length: policy.APP_POLICY.limits.tabs + 1 }, (_, i) => ({ screen: `s${i}`, label: "H" }));
    assert.ok(validateNavigationFile(tabs(six)).some((e) => e.includes("at most")));
    assert.ok(validateNavigationFile(tabs([{ screen: "home", label: " " }])).some((e) => e.includes("label")));
    assert.ok(validateNavigationFile(tabs([])).some((e) => e.includes("at least one")));
    assert.deepEqual(validateNavigationFile("x"), ["Navigation needs a list of tabs."]);
  });

  it("rejects detail screens, which need an entry picked from a list", () => {
    const types = { home: "home", maps: "list", "hero-detail": "detail" };
    const errors = validateNavigationFile(tabs([{ screen: "home", label: "Home" }, { screen: "hero-detail", label: "Setting" }]), types);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^Tab 2 opens "hero-detail", a detail screen/);
    assert.deepEqual(validateNavigationFile(tabs([{ screen: "home", label: "Home" }, { screen: "maps", label: "Maps" }]), types), []);
  });
});

describe("data files by path", () => {
  void it("checks screens, navigation, games.json and records (their ids)", () => {
    assert.ok(validateDataFile("data/overwatch/screens/home.json", { blocks: "x" }).length > 0);
    assert.ok(validateDataFile("data/overwatch/navigation.json", {}).length > 0);
    assert.deepEqual(validateDataFile("data/overwatch/heroes/ana.json", { id: "ana", anything: true }), []);
    assert.deepEqual(validateDataFile("data/overwatch/screens/nested/x.json", {}), []);
  });
});

describe("schema files", () => {
  const reference = (referenceApiEndpoint: unknown, extra: Record<string, unknown> = {}) => ({
    key: "hero",
    label: "Hero",
    type: "reference",
    referenceApiEndpoint,
    ...extra,
  });

  it("accept the real schemas, whose references read from categories of the game", () => {
    const dir = new URL("./fixtures/overwatch/schemas/", import.meta.url);
    for (const name of readdirSync(dir)) {
      assert.deepEqual(validateSchemaFile(JSON.parse(readFileSync(new URL(name, dir), "utf8"))), [], name);
    }
    assert.deepEqual(referenceEndpoints(DEFAULT_CATEGORIES), ["/api/{game}/heroes", "/api/{game}/maps", "/api/{game}/modes", "/api/{game}/items", "/api/{game}/patches", "/api/{game}/news"]);
  });

  it("refuse references to anything but a category, nested ones included", () => {
    for (const endpoint of ["/api/heroes", "/api/seasons", "/api/{game}/events", "/api/{game}/schemas", "/api/overwatch/heroes", "", undefined]) {
      assert.equal(validateSchemaFile({ id: "x", fields: [reference(endpoint)] }).length, 1, String(endpoint));
    }
    const nested = { id: "x", fields: [{ key: "changes", type: "object_array", subFields: [reference("/api/heroes", { type: "reference_list" })] }] };
    assert.match(validateSchemaFile(nested)[0], /^changes\.hero reads its options from "\/api\/heroes"/);
    assert.deepEqual(validateSchemaFile({ id: "x", fields: [reference("/api/{game}/heroes"), { key: "name", type: "string" }] }), []);
  });

  it("are checked on write, by path", () => {
    const bad = { id: "x", fields: [reference("/api/heroes")] };
    assert.equal(dataWriteProblems("data/overwatch/schemas/item-x.json", bad, false).length, 1);
    assert.equal(dataWriteProblems("data/overwatch/schemas/item-x.json", encodeUtf8Base64(JSON.stringify(bad)), true).length, 1);
    assert.deepEqual(validateDataFile("data/overwatch/heroes/x.json", bad), []);
  });
});

describe("writes", () => {
  const unsafe = screen([block({ action: { url: "https://evil.example" } })]);
  const base64 = (value: unknown) => encodeUtf8Base64(JSON.stringify(value));

  it("check a data file sent as base64 like one sent as JSON", () => {
    const path = "data/overwatch/screens/home.json";
    assert.deepEqual(dataWriteProblems(path, base64(unsafe), true), validateDataFile(path, unsafe));
    assert.equal(dataWriteProblems(path, base64(unsafe), true).length, 1);
    assert.deepEqual(dataWriteProblems(path, base64(screen([block()])), true), []);
    assert.deepEqual(dataWriteProblems("data/overwatch/navigation.json", base64({ tabs: [] }), true), ["Add at least one tab: the first one is Home."]);
  });

  it("refuse a base64 data file that isn't JSON", () => {
    assert.deepEqual(dataWriteProblems("data/overwatch/heroes/ana.json", encodeUtf8Base64("{ nope"), true), ["The file isn't valid JSON."]);
    assert.deepEqual(dataWriteProblems("data/overwatch/heroes/ana.json", "%%% not base64", true), ["The file isn't valid JSON."]);
    assert.deepEqual(dataWriteProblems("data/overwatch/heroes/ana.json", { not: "a string" }, true), ["The file isn't valid JSON."]);
  });

  it("leave assets alone, and check JSON writes as before", () => {
    assert.deepEqual(dataWriteProblems("public/assets/overwatch/heroes/ana/portrait.webp", "UklGRg==", true), []);
    assert.equal(dataWriteProblems("data/overwatch/screens/home.json", unsafe, false).length, 1);
    assert.deepEqual(dataWriteProblems("data/overwatch/heroes/ana.json", { id: "ana", anything: true }, false), []);
  });
});

describe("asset headers", () => {
  it("type files by their extension and sandbox them", () => {
    const svg = assetHeaders("assets/overwatch/enums/role/tank.SVG", "no-cache");
    assert.equal(svg.get("Content-Type"), "image/svg+xml");
    assert.equal(svg.get("X-Content-Type-Options"), "nosniff");
    assert.match(svg.get("Content-Security-Policy") ?? "", /default-src 'none'.*sandbox/);
    assert.equal(assetHeaders("assets/games/overwatch-icon.webp", "no-cache").get("Content-Type"), "image/webp");
    assert.equal(assetHeaders("assets/games/overwatch-icon.ico", "no-cache").get("Content-Type"), "image/x-icon");
    assert.equal(assetHeaders("assets/x/page.html", "no-cache").get("Content-Type"), "application/octet-stream");
    assert.equal(assetHeaders("assets/x/noextension", "no-cache").get("Content-Type"), "application/octet-stream");
  });
});

// A hand-made manifest in the shape worker B generates (zms tools/generate-primitives.js):
// keys athena doesn't read (linkHosts, imageHosts, blockedProps) are ignored; routeStops
// is read for the screen preview's route timeline.
const manifestWithPolicy = {
  $policy: {
    limits: { screensPerGame: 40, blocksPerScreen: 30, tabs: 4, listItems: 80, smallList: 8, text: 1000, routeStops: 9 },
    linkHosts: ["blizzard.com"],
    imageHosts: [],
    appScreens: ["app:settings", "app:search"],
    blockedProps: ["style"],
  },
  screen_header: { name: "ScreenHeader", props: { title: { type: "string" } } },
};

describe("the app's policy, from the block manifest", () => {
  it("is today's app values when the manifest has none", () => {
    assert.deepEqual(policy.APP_POLICY, {
      limits: { screensPerGame: 50, blocksPerScreen: 60, tabs: 5, listItems: 100, smallList: 12, text: 2000, routeStops: 6 },
      appScreens: ["app:settings"],
      imageHosts: ["blz-contentstack-images.akamaized.net", "bnetcmsus-a.akamaihd.net"],
      imageVariants: ["main", "default", "2d", "portrait", "icon"],
    });
    for (const raw of [undefined, null, "x", {}, { screen_header: manifestWithPolicy.screen_header }, { $policy: "x" }, { $policy: [] }]) {
      assert.deepEqual(policy.appPolicy(raw), policy.APP_POLICY, JSON.stringify(raw));
    }
  });

  void it("reads the limits, app screens and picture hosts, and ignores the rest", () => {
    assert.deepEqual(policy.appPolicy(manifestWithPolicy), {
      limits: { screensPerGame: 40, blocksPerScreen: 30, tabs: 4, listItems: 80, smallList: 8, text: 1000, routeStops: 9 },
      appScreens: ["app:settings", "app:search"],
      imageHosts: [],
      imageVariants: ["main", "default", "2d", "portrait", "icon"],
    });
  });

  it("falls back key by key for values that aren't positive whole numbers or app screen ids", () => {
    const read = policy.appPolicy({ $policy: { limits: { tabs: "6", smallList: 0, listItems: 1.5, text: -1, screensPerGame: 45 }, appScreens: ["app:settings", "nope", 3, "app:Bad"] } });
    assert.deepEqual(read.limits, { ...policy.APP_POLICY.limits, screensPerGame: 45 });
    assert.deepEqual(read.appScreens, ["app:settings"]);
    assert.deepEqual(policy.appPolicy({ $policy: { appScreens: "app:settings" } }).appScreens, ["app:settings"]);
  });

  it("is read from the data repo, and is today's values when it can't be", async () => {
    const files: Record<string, string> = { [policy.MANIFEST_PATH]: JSON.stringify(manifestWithPolicy) };
    assert.equal(policy.MANIFEST_PATH, "data/_meta/mobile_primitives.json");
    assert.equal((await policy.readAppPolicy(async (path) => files[path])).limits.tabs, 4);
    const missing = async (): Promise<string> => {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    };
    assert.deepEqual(await policy.readAppPolicy(missing), policy.APP_POLICY);
    assert.deepEqual(await policy.readAppPolicy(async () => "{ not json"), policy.APP_POLICY);
  });

  it("is read for writes of screens and navigation only", () => {
    assert.ok(policy.needsAppPolicy("data/overwatch/screens/home.json"));
    assert.ok(policy.needsAppPolicy("data/overwatch/navigation.json"));
    assert.ok(!policy.needsAppPolicy("data/overwatch/heroes/ana.json"));
    assert.ok(!policy.needsAppPolicy("data/overwatch/schemas/hero-hero.json"));
    assert.ok(!policy.needsAppPolicy("data/_meta/mobile_primitives.json"));
  });
});

describe("screens and tabs against the app's policy", () => {
  // Built lazily, so a missing APP_POLICY fails each test rather than the suite.
  const small = () => ({ ...policy.APP_POLICY, limits: { ...policy.APP_POLICY.limits, blocksPerScreen: 2, tabs: 2 }, appScreens: ["app:settings"] });
  const threeBlocks = screen([block({}, { id: "a" }), block({}, { id: "b" }), block({ action: { url: "https://evil.example" } }, { id: "c" })]);
  const tabs = (list: unknown[]) => ({ tabs: list });

  it("cap blocks and tabs at the policy's limits", () => {
    assert.ok(policy.validateScreenFile(threeBlocks, small()).includes("A screen can have at most 2 blocks."));
    assert.ok(!policy.validateScreenFile(threeBlocks).some((e) => e.includes("at most")));
    const three = tabs([{ screen: "home", label: "Home" }, { screen: "heroes", label: "Heroes" }, { screen: "maps", label: "Maps" }]);
    assert.ok(policy.validateNavigationFile(three, undefined, small()).includes("The tab bar fits at most 2 tabs."));
    assert.deepEqual(policy.validateNavigationFile(three), []);
  });

  it("accept only screens the app has itself", () => {
    const withApp = (screen: string) => tabs([{ screen: "home", label: "Home" }, { screen, label: "X" }]);
    assert.deepEqual(policy.validateNavigationFile(withApp("app:settings"), { home: "home" }), []);
    assert.deepEqual(policy.validateNavigationFile(withApp("app:foo"), { home: "home" }), ['Tab 2 opens "app:foo", which the app doesn\'t have: use app:settings.']);
    const search = { ...policy.APP_POLICY, appScreens: ["app:settings", "app:search"] };
    assert.deepEqual(policy.validateNavigationFile(withApp("app:search"), { home: "home" }, search), []);
  });

  it("refuse two tabs that open the same screen, which the app can't tell apart", () => {
    const twice = tabs([{ screen: "home", label: "Home" }, { screen: "heroes", label: "Heroes" }, { screen: "heroes", label: "Again" }]);
    assert.deepEqual(policy.validateNavigationFile(twice, { home: "home", heroes: "list" }), ['Tab 3 opens "heroes", as tab 2 does: the app keeps one tab per screen.']);
    const settingsTwice = tabs([{ screen: "home", label: "Home" }, { screen: "app:settings", label: "A" }, { screen: "app:settings", label: "B" }]);
    assert.equal(policy.validateNavigationFile(settingsTwice).length, 1);
  });

  it("give the same problems in the editor and in the write API, for the same file and policy", () => {
    const nav = tabs([{ screen: "home", label: "Home" }, { screen: "app:foo", label: "X" }, { screen: "home", label: "Again" }]);
    const smallPolicy = small();
    for (const p of [policy.APP_POLICY, smallPolicy]) {
      const screenPath = "data/overwatch/screens/x.json";
      const navPath = "data/overwatch/navigation.json";
      const fromEditor = policy.validateScreenFile(threeBlocks, p);
      assert.ok(fromEditor.length > 0);
      assert.deepEqual(policy.dataWriteProblems(screenPath, threeBlocks, false, DEFAULT_CATEGORIES, {}, p), fromEditor);
      assert.deepEqual(policy.dataWriteProblems(screenPath, encodeUtf8Base64(JSON.stringify(threeBlocks)), true, DEFAULT_CATEGORIES, {}, p), fromEditor);
      const navFromEditor = policy.validateNavigationFile(nav, undefined, p);
      assert.equal(navFromEditor.length, p === smallPolicy ? 3 : 2);
      assert.deepEqual(policy.dataWriteProblems(navPath, nav, false, DEFAULT_CATEGORIES, {}, p), navFromEditor);
      assert.deepEqual(policy.dataWriteProblems(navPath, encodeUtf8Base64(JSON.stringify(nav)), true, DEFAULT_CATEGORIES, {}, p), navFromEditor);
    }
  });
});

describe("the block manifest's shape", () => {
  // The data repo's manifest as the app generates it (zero-backend data/_meta).
  const manifest = () => JSON.parse(readFileSync(new URL("./fixtures/mobile_primitives.json", import.meta.url), "utf8"));

  it("accepts the manifest the app generates", () => {
    assert.deepEqual(policy.manifestProblems(manifest()), []);
  });

  it("refuses what appPolicy would quietly replace with the admin's defaults", () => {
    const m = manifest();
    m.$policy.limits.tabs = "5";
    delete m.$policy.limits.text;
    m.$policy.appScreens = ["app:settings", "app:Settings"];
    assert.deepEqual(policy.manifestProblems(m), [
      '"$policy.limits.tabs" must be a positive whole number.',
      '"$policy.limits.text" must be a positive whole number.',
      '"$policy.appScreens" must list distinct app screens such as "app:settings".',
    ]);
    assert.deepEqual(policy.manifestProblems({ ...manifest(), $policy: undefined }), ['"$policy" must be an object.']);
    assert.deepEqual(policy.manifestProblems([]), ["The block manifest must be a JSON object."]);
  });

  it("refuses link hosts or blocked props that differ from the admin's", () => {
    const m = manifest();
    m.$policy.linkHosts = [...policy.LINK_HOSTS, "evil.example"];
    m.$policy.blockedProps = "^(style)$";
    const problems = policy.manifestProblems(m);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^"\$policy\.linkHosts" must be the admin's link hosts/);
    assert.match(problems[1], /^"\$policy\.blockedProps" must be the admin's/);
    // Order doesn't matter, only the set.
    const reordered = manifest();
    reordered.$policy.linkHosts = [...policy.LINK_HOSTS].reverse();
    assert.deepEqual(policy.manifestProblems(reordered), []);
  });

  it("checks every block's spec", () => {
    const m = manifest();
    m["Bad-Type"] = { name: "X", props: {} };
    m.text = { name: "", props: { value: { type: 3, required: "yes", options: ["a", 1] } } };
    m.gallery = { name: "Gallery" };
    // In the manifest's order: gallery and text are already in it, Bad-Type is added last.
    assert.deepEqual(policy.manifestProblems(m), [
      'Block "gallery" needs props as an object.',
      'Block "text" needs a name.',
      'Block "text": prop "value" needs a type.',
      'Block "text": prop "value": required must be true or false.',
      'Block "text": prop "value": options must be a list of text.',
      'Block "Bad-Type": the type must be lowercase letters, digits and _.',
    ]);
    assert.deepEqual(policy.manifestProblems({ $policy: manifest().$policy }), ["The block manifest lists no blocks."]);
  });
});

// ─── R3: the contract with the app ──────────────────────────────────────

/** The block manifest of the fixtures, as the app generates it. */
const appManifest = (): { $policy: Record<string, unknown> } => JSON.parse(readFileSync(new URL("./fixtures/mobile_primitives.json", import.meta.url), "utf8")) as { $policy: Record<string, unknown> };
const IMAGE_HOSTS = ["blz-contentstack-images.akamaized.net", "bnetcmsus-a.akamaihd.net"];
const CATEGORIES = [...DEFAULT_CATEGORIES, { category: "event", folder: "events", label: "Events", singular: "Event", icon: "list" as const, favoritable: false }];
type ScreenCheck = (raw: unknown, p?: unknown, categories?: unknown) => string[];
const checkScreen = validateScreenFile as unknown as ScreenCheck;

void describe("pictures the app loads (F3)", () => {
  void it("come from the manifest's image hosts and variants, else the contract's", () => {
    const read = policy.appPolicy(appManifest()) as unknown as { imageHosts?: string[]; imageVariants?: string[] };
    assert.deepEqual(read.imageHosts, IMAGE_HOSTS);
    assert.deepEqual(read.imageVariants, ["main", "default", "2d", "portrait", "icon"]);
    const odd = policy.appPolicy({ $policy: { imageHosts: ["cdn.example", 5], imageVariants: "main" } }) as unknown as { imageHosts?: string[]; imageVariants?: string[] };
    assert.deepEqual(odd.imageHosts, ["cdn.example"]);
    assert.deepEqual(odd.imageVariants, ["main", "default", "2d", "portrait", "icon"]);
    assert.deepEqual((policy.APP_POLICY as unknown as { imageHosts?: string[] }).imageHosts, IMAGE_HOSTS);
  });

  void it("must be the admin's in the manifest, as its link hosts are", () => {
    const edited = appManifest();
    edited.$policy.imageHosts = [...IMAGE_HOSTS, "i.imgur.com"];
    assert.equal(policy.manifestProblems(edited).length, 1);
    assert.match(policy.manifestProblems(edited)[0], /^"\$policy\.imageHosts" must be the admin's picture hosts/);
    edited.$policy.imageHosts = [...IMAGE_HOSTS].reverse();
    assert.deepEqual(policy.manifestProblems(edited), []);
  });

  void it("are the only literal pictures a screen may hold", () => {
    const problems = validateScreenFile(
      screen([
        block({ title: "Hi", image: "https://i.imgur.com/a.png" }),
        { id: "c", type: "cover_entity_header", props: { title: "X", backgroundImage: "http://bnetcmsus-a.akamaihd.net/a.png" } },
        { id: "g", type: "record_grid", props: { itemLabel: "item.name", itemImage: "portrait.png" } },
      ]),
    );
    assert.deepEqual(problems, [
      "Block 1: the app won't load the picture https://i.imgur.com/a.png (props.image): use an uploaded picture or one on blz-contentstack-images.akamaized.net, bnetcmsus-a.akamaihd.net.",
      "Block 2: the app won't load the picture http://bnetcmsus-a.akamaihd.net/a.png (props.backgroundImage): use an uploaded picture or one on blz-contentstack-images.akamaized.net, bnetcmsus-a.akamaihd.net.",
      "Block 3: the app won't load the picture portrait.png (props.itemImage): use an uploaded picture or one on blz-contentstack-images.akamaized.net, bnetcmsus-a.akamaihd.net.",
    ]);
    for (const image of ["/api/assets/overwatch/x.webp", "assets/x.png", "https://bnetcmsus-a.akamaihd.net/a.png", "data.portrait", "item.image", "", { main: "/api/assets/a.webp" }]) {
      assert.deepEqual(validateScreenFile(screen([block({ title: "Hi", image })])), [], JSON.stringify(image));
    }
  });
});

void describe("colours (C7)", () => {
  void it("are #RGB or #RRGGBB, or for the accent a record's field", () => {
    assert.deepEqual(validateScreenFile(screen([], { accent: "#12345" })), ['accent must be a hex color such as #FF8200 or #F80, or "data.<field>".']);
    assert.deepEqual(validateScreenFile(screen([], { accent: "data.color" })), []);
    assert.deepEqual(
      validateScreenFile(screen([{ id: "t", type: "text", props: { text: "Hi", color: "teal" } }, { id: "b", type: "badge", props: { label: "New", color: "data.color", textColor: "#1" } }])),
      ['Block 1: color "teal" isn\'t a hex color such as #FF8200 or #F80; the app shows the theme\'s instead.', 'Block 2: textColor "#1" isn\'t a hex color such as #FF8200 or #F80; the app shows the theme\'s instead.'],
    );
    assert.deepEqual(validateScreenFile(screen([{ id: "t", type: "text", props: { text: "Hi", color: "" } }])), []);
  });
});

void describe("a screen's categories (C5)", () => {
  void it("are configured in categories.json, for the screen and its blocks", () => {
    const skins = screen([{ id: "g", type: "record_grid", props: { itemLabel: "item.name", source: { category: "skin" } } }], { type: "list", source: { category: "skin" } });
    assert.deepEqual(checkScreen(skins, policy.APP_POLICY, CATEGORIES), [
      'source names the category "skin", which isn\'t in categories.json: the app shows nothing for it.',
      'Block 1: its source names the category "skin", which isn\'t in categories.json: the app shows nothing for it.',
    ]);
    const events = screen([], { type: "list", source: { category: "event" } });
    assert.deepEqual(checkScreen(events, policy.APP_POLICY, CATEGORIES), []);
    // Without the categories (an editor that hasn't loaded them), nothing is said.
    assert.deepEqual(checkScreen(skins, policy.APP_POLICY), []);
    assert.deepEqual(validateDataFile("data/overwatch/screens/skins.json", skins, CATEGORIES).length, 2);
    assert.equal(readsCategories("data/overwatch/screens/skins.json"), true);
  });
});

void describe("data on home, list and page screens (C4)", () => {
  void it("is the game and the category folders: a record's fields only on detail screens", () => {
    const blocks = [
      { id: "t", type: "text", props: { text: "data.role" } },
      { id: "i", type: "info_list", props: { rows: [{ label: "Role", value: "data.heroes.0.role" }, { label: "Odd", value: "data.health" }] } },
      { id: "h", type: "screen_header", props: { title: "data.game.name" } },
    ];
    const expected = [
      'Block 1: text reads "data.role", but home, list and page screens read only data.game and the category folders (data.heroes…): use item.role in a list block.',
      'Block 2: rows[1].value reads "data.health", but home, list and page screens read only data.game and the category folders (data.heroes…): use item.health in a list block.',
    ];
    for (const type of ["home", "list", "page"]) {
      assert.deepEqual(checkScreen(screen(blocks, { type, source: { category: "hero" } }), policy.APP_POLICY, CATEGORIES), expected, type);
    }
    assert.deepEqual(checkScreen(screen(blocks, { type: "detail", source: { category: "hero" } }), policy.APP_POLICY, CATEGORIES), []);
    assert.deepEqual(checkScreen(screen([], { type: "list", accent: "data.game.secondary", source: { category: "hero" } }), policy.APP_POLICY, CATEGORIES), []);
    assert.deepEqual(checkScreen(screen([], { type: "list", accent: "data.color", source: { category: "hero" } }), policy.APP_POLICY, CATEGORIES), [
      'accent reads "data.color", but home, list and page screens read only data.game and the category folders (data.heroes…).',
    ]);
  });
});

void describe("games.json (F10, C8, F3)", () => {
  const dark = JSON.parse(readFileSync(new URL("./fixtures/palette-cases.json", import.meta.url), "utf8")).dark;
  const game = { slug: "overwatch", name: "Overwatch 2", developer: "Blizzard Entertainment", active: true, icon: "/api/assets/games/overwatch-icon.webp", ...dark };
  const problems = (games: unknown[]) => validateDataFile("data/_meta/games.json", { games });

  void it("passes a game the app shows, its icon checked against the contract's picture hosts (no manifest read)", () => {
    assert.deepEqual(problems([game, { ...game, slug: "marvel-rivals", name: "Marvel Rivals", active: false, icon: "", light: { background: "#FFFFFF" } }]), []);
    assert.equal(policy.needsAppPolicy("data/_meta/games.json"), false);
  });

  void it("refuses what makes the app drop a game or draw it wrong", () => {
    const noDeveloper = Object.fromEntries(Object.entries(game).filter(([key]) => key !== "developer"));
    assert.deepEqual(
      problems([
        { ...game, slug: "ow-", background: "", primary: "orange" },
        { ...noDeveloper, slug: "marvel-rivals", name: " ", active: "yes", icon: "https://i.imgur.com/a.png", light: { surface: "#12345", glow: "#FFF" } },
        { ...game, slug: "marvel-rivals" },
      ]),
      [
        'Game 1: "ow-" can\'t be a slug: 1 to 40 lowercase letters, digits and -, starting and ending with a letter or digit.',
        "Game 1: primary must be a hex color such as #FF8200 or #F80.",
        "Game 1: background must be a hex color such as #FF8200 or #F80.",
        "Game 2: it needs a name.",
        "Game 2: developer must be text (it may be empty).",
        "Game 2: active must be true or false.",
        "Game 2: the app won't load the icon https://i.imgur.com/a.png: use an uploaded picture or one on blz-contentstack-images.akamaized.net, bnetcmsus-a.akamaihd.net.",
        "Game 2: light.surface must be a hex color such as #FF8200 or #F80.",
        'Game 3: the slug "marvel-rivals" is used twice.',
      ],
    );
    assert.deepEqual(validateDataFile("data/_meta/games.json", { games: "x" }), ['games.json needs a "games" list.']);
  });
});

void describe("record files (C8, ids)", () => {
  void it("are named by their id, which is a record id the app accepts", () => {
    assert.deepEqual(dataWriteProblems("data/overwatch/maps/dorado.json", { id: "dorado", name: "Dorado" }, false), []);
    assert.deepEqual(dataWriteProblems("data/overwatch/maps/ana-.json", { id: "ana-", name: "Ana" }, false), [
      'The file name "ana-" isn\'t a record id: 1 to 80 lowercase letters, digits, dots and dashes, starting and ending with a letter or digit, without "..".',
    ]);
    assert.deepEqual(dataWriteProblems("data/overwatch/maps/dorado.json", { id: "dorado-2" }, false), ['The record\'s id must be "dorado", its file\'s name.']);
    assert.deepEqual(dataWriteProblems("data/overwatch/maps/dorado.json", { name: "Dorado" }, false), ['The record\'s id must be "dorado", its file\'s name.']);
    assert.deepEqual(dataWriteProblems("data/overwatch/maps/dorado.json", encodeUtf8Base64(JSON.stringify({ id: "x" })), true), ['The record\'s id must be "dorado", its file\'s name.']);
    assert.deepEqual(dataWriteProblems("data/ow-/maps/dorado.json", { id: "dorado" }, false), ['"ow-" isn\'t a game slug.']);
    // Folders that don't hold records: their own rules, or none.
    assert.deepEqual(dataWriteProblems("data/overwatch/cron_jobs/x.json", { id: "y" }, false), []);
    assert.deepEqual(dataWriteProblems("data/overwatch/syncs/x.json", {}, false), []);
  });
});
