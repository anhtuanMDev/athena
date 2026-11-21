import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateScreen, type PrimitiveManifest, type ScreenFile } from "../app/lib/screen-model";

// A layout's block type is data: one named after a member every object has
// ("constructor", "toString"…) is an unknown block, not Object's member (REQ-08).

const INHERITED = ["constructor", "toString", "__proto__", "hasOwnProperty"];

const manifest: PrimitiveManifest = {
  text: { name: "Text", props: { text: { type: "string", required: true } } },
};

const screenOf = (types: string[]): ScreenFile => ({
  type: "page",
  blocks: types.map((type, i) => ({ id: `b${String(i)}`, type, props: { title: "Hello" } })),
});

void describe("a block type named after an Object member", () => {
  void it("is an unknown block, and the check doesn't throw", () => {
    const issues = validateScreen(screenOf(INHERITED), manifest, [], [], []);
    assert.deepEqual(
      issues.map((issue) => `${issue.sectionId}:${issue.kind}`),
      INHERITED.map((_, i) => `b${String(i)}:unknown-type`),
    );
    assert.match(issues[0].message, /"constructor" is not in mobile_primitives\.json/);
  });

  void it("leaves a known block checked against its own props", () => {
    const issues = validateScreen(screenOf(["text"]), manifest, [], [], []);
    assert.deepEqual(
      issues.map((issue) => `${issue.prop ?? ""}:${issue.kind}`),
      ["text:required", ":ignored-prop"],
    );
  });
});
