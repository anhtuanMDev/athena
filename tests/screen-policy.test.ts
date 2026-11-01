import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assetHeaders } from "../app/lib/asset-headers";
import { encodeUtf8Base64 } from "../app/lib/utf8-base64";
import { DEFAULT_CATEGORIES, referenceEndpoints } from "../app/lib/categories";
import { readFileSync, readdirSync } from "node:fs";
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
    const many = Array.from({ length: LIMITS.blocksPerScreen + 1 }, (_, i) => block({}, { id: `b${i}` }));
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
    const six = Array.from({ length: LIMITS.tabs + 1 }, () => ({ screen: "home", label: "H" }));
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
  it("checks screens and navigation only", () => {
    assert.ok(validateDataFile("data/overwatch/screens/home.json", { blocks: "x" }).length > 0);
    assert.ok(validateDataFile("data/overwatch/navigation.json", {}).length > 0);
    assert.deepEqual(validateDataFile("data/overwatch/heroes/ana.json", { anything: true }), []);
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
    assert.deepEqual(dataWriteProblems("data/overwatch/heroes/ana.json", { anything: true }, false), []);
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
