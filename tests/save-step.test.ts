import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PARTIAL_LOAD_REASON, saveStep } from "../app/lib/screen-save";

// Save in the screen editor (button or ⌘S): refused while any of the game's data
// couldn't be read, since the checks would run, and the save be written, without it.

const ready = { isDirty: true, isSubmitting: false, failed: [], blockingCount: 0 };

void describe("pressing Save", () => {
  void it("is refused, with its reason, while a source couldn't be read", () => {
    assert.deepEqual(saveStep({ ...ready, failed: ["enums"] }), { kind: "refused", reason: PARTIAL_LOAD_REASON });
    assert.deepEqual(saveStep({ ...ready, failed: ["schemas", "maps records"], blockingCount: 2 }), { kind: "refused", reason: PARTIAL_LOAD_REASON });
    assert.equal(PARTIAL_LOAD_REASON, "Saving is off until everything loads. Reload the page.");
  });

  void it("writes when everything loaded and nothing blocks", () => {
    assert.deepEqual(saveStep(ready), { kind: "write" });
  });

  void it("stops at the problems when some block it", () => {
    assert.deepEqual(saveStep({ ...ready, blockingCount: 1 }), { kind: "problems" });
  });

  void it("does nothing without changes, or while a save runs", () => {
    assert.deepEqual(saveStep({ ...ready, isDirty: false, failed: ["enums"] }), { kind: "nothing" });
    assert.deepEqual(saveStep({ ...ready, isSubmitting: true }), { kind: "nothing" });
  });
});
