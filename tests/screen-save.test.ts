import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { saveErrorMessage, savedContent } from "../app/components/screen-editor/utils/save-content";
import { ConflictError } from "../app/lib/github";

// What the screen editor writes and says when a save fails (screen-editor/utils/save-content.ts),
// as ScreenEdit's save did before it moved to useScreenSave.

void describe("a screen's save", () => {
  void it("writes the file as loaded with the edited screen over it, less its id and unset keys", () => {
    const file = { id: "home", type: "home", blocks: [], extra: { kept: true } };
    const screen = { type: "list" as const, title: undefined, source: { category: "hero" }, blocks: [{ id: "b", type: "text", props: {} }] };
    assert.deepEqual(savedContent(file, screen), { type: "list", blocks: [{ id: "b", type: "text", props: {} }], extra: { kept: true }, source: { category: "hero" } });
    assert.deepEqual(Object.keys(savedContent(file, screen)), ["type", "blocks", "extra", "source"]);
  });

  void it("says a conflict means reloading, and else gives the error's own message", () => {
    assert.match(saveErrorMessage(new ConflictError("data/overwatch/screens/home.json")), /^This screen changed on GitHub after you opened it\./);
    assert.equal(saveErrorMessage(new Error("Stub: down")), "Stub: down");
    assert.equal(saveErrorMessage("plain"), "plain");
  });
});
