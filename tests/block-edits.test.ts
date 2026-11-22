import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { focusAfterMove, focusAfterRemove, reportedJson, withProp, withoutBlockErrors } from "../app/components/screen-editor/utils/block-edits";

import type { ScreenBlock } from "../app/lib/screen-model";

const block = (id: string, props: Record<string, unknown> = {}): ScreenBlock => ({ id, type: "text", props });

void describe("focus after a block moved", () => {
  void it("stays on the arrow it moved with, or on the other one at an end", () => {
    assert.equal(focusAfterMove({ blockId: "a", target: 1, delta: -1, count: 4 }), "block-a-up");
    assert.equal(focusAfterMove({ blockId: "a", target: 2, delta: 1, count: 4 }), "block-a-down");
    assert.equal(focusAfterMove({ blockId: "a", target: 0, delta: -1, count: 4 }), "block-a-down");
    assert.equal(focusAfterMove({ blockId: "a", target: 3, delta: 1, count: 4 }), "block-a-up");
  });
});

void describe("focus after a block was removed", () => {
  const blocks = [block("a"), block("b"), block("c")];

  void it("goes to the next block, else the previous one, else the add button", () => {
    assert.equal(focusAfterRemove(blocks, 0), "block-b-toggle");
    assert.equal(focusAfterRemove(blocks, 1), "block-c-toggle");
    assert.equal(focusAfterRemove(blocks, 2), "block-b-toggle");
    assert.equal(focusAfterRemove([block("a")], 0), "add-block-button");
  });
});

void describe("a prop's edit", () => {
  void it("keeps the prop in its place, adds a new one last, and removes one set to nothing", () => {
    const edited = withProp(block("a", { title: "x", text: "y" }), "title", "z");
    assert.deepEqual(Object.entries(edited.props), [["title", "z"], ["text", "y"]]);
    assert.deepEqual(Object.keys(withProp(edited, "image", "i").props), ["title", "text", "image"]);
    assert.deepEqual(withProp(edited, "title", undefined).props, { text: "y" });
    assert.deepEqual(withProp(edited, "title", "").props, { title: "", text: "y" });
  });
});

void describe("the JSON boxes that don't parse", () => {
  const errors = { "a:items": "Unexpected token", "b:rows": "Unexpected end" };

  void it("gain or change an error, and lose one that parses; the same object when nothing changed", () => {
    assert.deepEqual(reportedJson(errors, { key: "a:tabs", error: "Bad" }), { ...errors, "a:tabs": "Bad" });
    assert.equal(reportedJson(errors, { key: "a:items", error: "Unexpected token" }), errors);
    assert.deepEqual(reportedJson(errors, { key: "a:items", error: null }), { "b:rows": "Unexpected end" });
    assert.equal(reportedJson(errors, { key: "c:items", error: null }), errors);
  });

  void it("lose a removed block's", () => {
    assert.deepEqual(withoutBlockErrors(errors, "a"), { "b:rows": "Unexpected end" });
  });
});
