import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hiddenNote, optionKey, problemCount, sampleNote, screenName, summarizeProps } from "../app/components/screen-editor/utils/screen-text";

// How the screen editor names a screen, a block's props and its problems
// (screen-editor/utils/screen-text.ts), as ScreenEdit wrote them before its split.

void describe("the screen editor's text", () => {
  void it("names a screen by its title, else its id", () => {
    assert.equal(screenName("Heroes", "heroes"), "Heroes");
    assert.equal(screenName("", "heroes"), "heroes");
    assert.equal(screenName(undefined, "heroes"), "heroes");
  });

  void it("counts problems", () => {
    assert.equal(problemCount(1), "1 problem");
    assert.equal(problemCount(3), "3 problems");
  });

  void it("sums up a block's first three props: bound ones by their field, lists by their size, long text cut", () => {
    const block = (props: Record<string, unknown>) => ({ id: "b", type: "text", props });
    assert.equal(summarizeProps(block({})), "No props set");
    assert.equal(summarizeProps(block({ title: "data.name", rows: [1, 2], style: { a: 1 }, size: 3 })), "title ← data.name · rows: 2 entries · size: 3");
    assert.equal(summarizeProps(block({ items: [1] })), "items: 1 entry");
    assert.equal(summarizeProps(block({ text: "a".repeat(30) })), `text: "${"a".repeat(22)}…`);
    assert.equal(summarizeProps(block({ a: "x", b: "y", c: "z", d: "w" })), 'a: "x" · b: "y" · c: "z"');
  });

  void it("keys a record by its id, else its place", () => {
    assert.equal(optionKey({ id: "tracer" }, 2), "tracer");
    assert.equal(optionKey({}, 2), "2");
  });

  void it("notes the preview's sample record and the blocks it leaves out", () => {
    assert.equal(sampleNote("detail", "Tracer"), "Showing Tracer. ");
    assert.equal(sampleNote("detail", undefined), "No records of this category yet, so bound values appear as field names. ");
    assert.equal(sampleNote("list", "Tracer"), "");
    assert.equal(hiddenNote(1), " 1 hidden block is left out.");
    assert.equal(hiddenNote(2), " 2 hidden blocks are left out.");
  });
});
