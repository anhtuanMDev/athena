import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, installChunkReload, shouldReloadForChunk } from "../app/lib/chunk-reload";
import { copyText } from "../app/lib/clipboard";

// A game's pages load each view's code when it's opened (_admin.$game.tsx):
// importing them all with the route made one 400 kB chunk for any game page.

const ROUTE = new URL("../app/routes/_admin.$game.tsx", import.meta.url);
const APP = new URL("../app/", import.meta.url);

describe("the game route", () => {
  const source = readFileSync(ROUTE, "utf8");

  it("imports no view with itself: each is loaded when it's opened", () => {
    const statics = [...source.matchAll(/^import\s[^;]*?from\s+"(~\/[^"]+)"/gm)].map((m) => m[1]);
    const views = statics.filter((path) => path.startsWith("~/components/views/") || path === "~/RawEdit");
    assert.deepEqual(views, ["~/components/views/ViewSkeletons"]);
  });

  it("loads lazily every view it shows, each a module with a default export", () => {
    const lazy = [...source.matchAll(/const (\w+) = lazy\(\(\) => import\("~\/([^"]+)"\)\);/g)].map((m) => [m[1], m[2]] as const);
    assert.equal(lazy.length, 25);
    for (const [name, path] of lazy) {
      const file = new URL(`${path}.tsx`, APP);
      assert.ok(existsSync(file), path);
      assert.match(readFileSync(file, "utf8"), /^export default function /m, path);
      assert.ok(new RegExp(`<${name}\\b`).test(source), `${name} is never shown`);
    }
  });

  it("shows a list's own placeholder while its code loads", () => {
    for (const [view, key] of [["HeroesList", "heroes"], ["MapsList", "maps"], ["ModesList", "modes"], ["EnumsList", "enums"]]) {
      assert.ok(source.includes(`[<${view} />, <EntityListSkeleton {...LIST_SKELETONS.${key}} />]`), view);
      const own = readFileSync(new URL(`components/views/${view}.tsx`, APP), "utf8");
      assert.ok(own.includes(`<EntityListSkeleton {...LIST_SKELETONS.${key}} />`), `${view} shows another placeholder while its data loads`);
    }
  });
});

/** A sessionStorage in memory. */
function store(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("a view whose code is gone after a deploy", () => {
  it("reloads the page once, and not again within a minute", () => {
    const s = store();
    assert.equal(shouldReloadForChunk(s, 1_000_000), true);
    assert.equal(s.items.get(CHUNK_RELOAD_KEY), "1000000");
    assert.equal(shouldReloadForChunk(s, 1_000_000 + CHUNK_RELOAD_WINDOW_MS - 1), false);
    assert.equal(shouldReloadForChunk(s, 1_000_000 + CHUNK_RELOAD_WINDOW_MS), true);
  });

  it("never reloads without a store to note it in, so it can't loop", () => {
    assert.equal(shouldReloadForChunk(null, 1), false);
    const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    assert.equal(shouldReloadForChunk(full, 1), false);
  });

  it("is handled on Vite's preload error event: reloaded, and the error not thrown", () => {
    const target = new EventTarget();
    let reloads = 0;
    const win = Object.assign(target, { sessionStorage: store(), location: { reload: () => void reloads++ } }) as unknown as Window;
    installChunkReload(win);
    const first = new Event("vite:preloadError", { cancelable: true });
    win.dispatchEvent(first);
    assert.deepEqual([reloads, first.defaultPrevented], [1, true]);
    // Again at once: really missing, so Vite throws and the error page shows.
    const second = new Event("vite:preloadError", { cancelable: true });
    win.dispatchEvent(second);
    assert.deepEqual([reloads, second.defaultPrevented], [1, false]);
  });
});

describe("copying text that is still being read (Copy JSON)", () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const realItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  const withClipboard = async (clipboard: object, item: unknown, run: () => Promise<void>) => {
    Object.defineProperty(globalThis, "navigator", { value: { clipboard }, configurable: true });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = item;
    try {
      await run();
    } finally {
      if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
      (globalThis as { ClipboardItem?: unknown }).ClipboardItem = realItem;
    }
  };

  it("hands the clipboard an item at once, filled when the text arrives", async () => {
    const written: unknown[] = [];
    class Item {
      items: Record<string, Promise<Blob>>;
      constructor(items: Record<string, Promise<Blob>>) {
        this.items = items;
      }
    }
    await withClipboard({ write: async (items: Item[]) => void written.push(await (await items[0].items["text/plain"]).text()) }, Item, () => copyText(Promise.resolve("[1]")));
    assert.deepEqual(written, ["[1]"]);
  });

  it("writes the text once it's there where an item can't hold a promise, and fails when it can't be read", async () => {
    const written: string[] = [];
    const clipboard = { writeText: async (text: string) => void written.push(text) };
    await withClipboard(clipboard, undefined, () => copyText(Promise.resolve("[2]")));
    assert.deepEqual(written, ["[2]"]);
    await withClipboard(clipboard, undefined, async () => {
      await assert.rejects(copyText(Promise.reject(new Error("offline"))), /offline/);
    });
    assert.deepEqual(written, ["[2]"]);
  });
});
