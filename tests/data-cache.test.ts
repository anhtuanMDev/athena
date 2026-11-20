import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { CACHE_TTL_MS, MAX_CACHE_SIZE, cachedData, forgetEntries, freshEntry, isInvalidated, loadOnce, storeEntry } from "../app/lib/data-cache";

// The pages' shared answers (useData, use-data.ts): kept for 5 minutes, at
// most 100 of them, and one request for a key however many pages ask at once.

const NOW = 1_000_000;

interface LoadControl {
  starts: number;
  settle: (value: string) => void;
  fail: (error: Error) => void;
}

const nothing = () => undefined;

/** A load that waits until the test settles it, counting how often it started. */
function controlledLoad() {
  const control: LoadControl = { starts: 0, settle: nothing, fail: nothing };
  const load = async () => {
    control.starts += 1;
    return new Promise<string>((resolve, reject) => {
      control.settle = resolve;
      control.fail = reject;
    });
  };
  return { control, load };
}

void describe("the answers useData keeps", () => {
  beforeEach(() => {
    forgetEntries();
  });

  void it("are used for 5 minutes, then loaded again", () => {
    storeEntry("heroes", ["ana"], NOW);
    assert.deepEqual(freshEntry("heroes", NOW + CACHE_TTL_MS - 1), { data: ["ana"] });
    assert.equal(freshEntry("heroes", NOW + CACHE_TTL_MS), undefined);
    assert.equal(freshEntry("maps", NOW), undefined);
  });

  void it("keep an answer that is null, which pages use for a missing file", () => {
    storeEntry("hero-missing", null, NOW);
    assert.deepEqual(freshEntry("hero-missing", NOW), { data: null });
  });

  void it("give a page its fresh answer to start with, or null", () => {
    storeEntry("heroes", ["ana"], NOW);
    assert.deepEqual(cachedData("heroes", NOW), ["ana"]);
    assert.equal(cachedData("heroes", NOW + CACHE_TTL_MS), null);
    assert.equal(cachedData("maps", NOW), null);
  });

  void it("are 100 at most: past that, the key stored first goes, even when it was stored again since", () => {
    storeEntry("first", 1, NOW);
    for (let index = 1; index < MAX_CACHE_SIZE; index += 1) {
      storeEntry(`key-${String(index)}`, index, NOW);
    }
    storeEntry("first", "again", NOW);
    assert.deepEqual(freshEntry("first", NOW), { data: "again" });

    storeEntry("one-too-many", 0, NOW);
    assert.equal(freshEntry("first", NOW), undefined);
    assert.deepEqual(freshEntry("key-1", NOW), { data: 1 });
    assert.deepEqual(freshEntry("one-too-many", NOW), { data: 0 });
  });

  void it("are forgotten by prefix, or all of them", () => {
    storeEntry("overwatch-heroes", 1, NOW);
    storeEntry("overwatch-maps", 2, NOW);
    storeEntry("rivals-heroes", 3, NOW);
    forgetEntries("overwatch-");
    assert.equal(freshEntry("overwatch-heroes", NOW), undefined);
    assert.equal(freshEntry("overwatch-maps", NOW), undefined);
    assert.deepEqual(freshEntry("rivals-heroes", NOW), { data: 3 });
    forgetEntries("");
    assert.equal(freshEntry("rivals-heroes", NOW), undefined);
  });
});

void describe("an invalidation (clearDataCache's event)", () => {
  void it("reloads the keys under its prefix, and every key without one", () => {
    assert.equal(isInvalidated("overwatch-heroes-[]", { keyPrefix: "overwatch-" }), true);
    assert.equal(isInvalidated("rivals-heroes-[]", { keyPrefix: "overwatch-" }), false);
    assert.equal(isInvalidated("rivals-heroes-[]", { keyPrefix: undefined }), true);
    assert.equal(isInvalidated("rivals-heroes-[]", { keyPrefix: "" }), true);
    assert.equal(isInvalidated("rivals-heroes-[]", null), true);
  });
});

void describe("a load of one key", () => {
  void it("is shared by everyone who asks while it runs, and started again once it is done", async () => {
    const { control, load } = controlledLoad();
    const first = loadOnce("heroes", load);
    const second = loadOnce("heroes", load);
    assert.equal(first, second);
    assert.equal(control.starts, 1);
    control.settle("ana");
    assert.equal(await first, "ana");

    const third = loadOnce("heroes", load);
    assert.notEqual(third, first);
    assert.equal(control.starts, 2);
    control.settle("kiriko");
    assert.equal(await third, "kiriko");
  });

  void it("is started again after it failed", async () => {
    const { control, load } = controlledLoad();
    const failed = loadOnce("maps", load);
    control.fail(new Error("offline"));
    await assert.rejects(failed, /offline/u);

    const retried = loadOnce("maps", load);
    assert.equal(control.starts, 2);
    control.settle("ilios");
    assert.equal(await retried, "ilios");
  });

  void it("goes on when its answers are forgotten meanwhile", async () => {
    const { control, load } = controlledLoad();
    const running = loadOnce("modes", load);
    forgetEntries();
    assert.equal(loadOnce("modes", load), running);
    control.settle("push");
    assert.equal(await running, "push");
  });
});
