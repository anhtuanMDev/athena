import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { focusHandlers } from "../app/lib/field-focus";

import type { FocusEvent } from "react";

// A FormField's focus handlers. MUI applies the input slot's handlers after
// the field's own onFocus and onBlur, so the slot's replace them: the field's
// (react-hook-form's, from register) must be called from the slot's, or
// react-hook-form never marks the field touched, and the "follow the name until
// the id is typed" fields keep overwriting a typed id.

/** A focus event on an input holding `value`. */
const focusEvent = (value: string) => ({ target: { value } }) as unknown as FocusEvent<HTMLInputElement>;

/** The handlers, with what each target received. */
function recorded() {
  const calls: string[] = [];
  const handlers = focusHandlers({
    onFocus: (event) => calls.push(`field focus ${event.target.value}`),
    onBlur: (event) => calls.push(`field blur ${event.target.value}`),
    setShrink: (shrink) => calls.push(`shrink ${String(shrink)}`),
  });
  return { calls, handlers };
}

void describe("a FormField's focus handlers", () => {
  void it("call the field's own blur handler, so react-hook-form marks the field touched", () => {
    const { calls, handlers } = recorded();
    handlers.onBlur(focusEvent("tracer"));
    assert.deepEqual(calls, ["shrink true", "field blur tracer"]);
  });

  void it("call the field's own focus handler too", () => {
    const { calls, handlers } = recorded();
    handlers.onFocus(focusEvent(""));
    assert.deepEqual(calls, ["shrink true", "field focus "]);
  });

  void it("let the label settle back on an empty field, with or without the field's handlers", () => {
    const { calls, handlers } = recorded();
    handlers.onBlur(focusEvent(""));
    assert.deepEqual(calls, ["shrink undefined", "field blur "]);

    const shrinks: (true | undefined)[] = [];
    const bare = focusHandlers({ setShrink: (shrink) => shrinks.push(shrink) });
    bare.onFocus(focusEvent(""));
    bare.onBlur(focusEvent("x"));
    assert.deepEqual(shrinks, [true, true]);
  });
});
