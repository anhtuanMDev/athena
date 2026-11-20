import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { entryHandlers, type ImageEntry } from "../app/lib/image-entries";

// A picture-list field's changes (MultiImageUploadField). A picked file is
// read in the background, so two reads can finish before the list renders
// again: each change must apply to the list as it is then, as React's state
// updaters do, or the second overwrites the first.

/** React's state, as far as the field sees it: a value replaces, an updater gets the latest list. */
function reactState(initial: ImageEntry[]) {
  const state = {
    current: initial,
    set: (next: ImageEntry[] | ((entries: ImageEntry[]) => ImageEntry[])) => {
      state.current = typeof next === "function" ? next(state.current) : next;
    },
  };
  return state;
}

const PORTRAITS: ImageEntry[] = [
  { id: "one", key: "2d" },
  { id: "two", key: "3d" },
];

void describe("a picture-list field's changes", () => {
  void it("keep both pictures when two reads finish before the list renders again", () => {
    const state = reactState(PORTRAITS);
    // Both handlers come from the same render.
    const handlers = entryHandlers({ onChange: state.set, defaultKey: "main" });
    handlers.update("one", { name: "2d.png", base64: "AAAA", previewUrl: "data:image/png;base64,AAAA" });
    handlers.update("two", { name: "3d.png", base64: "BBBB", previewUrl: "data:image/png;base64,BBBB" });
    assert.deepEqual(
      state.current.map((entry) => [entry.key, entry.name]),
      [
        ["2d", "2d.png"],
        ["3d", "3d.png"],
      ],
    );
  });

  void it("add an entry named after the default key when the list is empty, and a blank one after", () => {
    const state = reactState([]);
    const handlers = entryHandlers({ onChange: state.set, defaultKey: "main" });
    handlers.add();
    handlers.add();
    assert.deepEqual(
      state.current.map((entry) => entry.key),
      ["main", ""],
    );
    assert.notEqual(state.current[0]?.id, state.current[1]?.id);
  });

  void it("remove one entry, leaving the others as they are", () => {
    const state = reactState(PORTRAITS);
    const handlers = entryHandlers({ onChange: state.set, defaultKey: "main" });
    handlers.update("two", { name: "3d.png" });
    handlers.remove("one");
    assert.deepEqual(state.current, [{ id: "two", key: "3d", name: "3d.png" }]);
  });
});
