import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { errorAt } from "../app/lib/form-errors";

// A form's error at a place in its values (app/lib/form-errors.ts): the
// form-field components read an ability's or a list item's errors through it.

const ERRORS = {
  name: { type: "too_small", message: "Name is required" },
  abilities: Object.assign([undefined, { id: { type: "invalid_format", message: "Must be kebab-case" }, params: { damage: { type: "invalid_type", message: "Expected number" } } }], {
    message: "At least one ability",
  }),
};

void describe("a form's error at a place", () => {
  void it("is the message there, down lists and objects", () => {
    assert.equal(errorAt(ERRORS, ["name"]), "Name is required");
    assert.equal(errorAt(ERRORS, ["abilities", 1, "id"]), "Must be kebab-case");
    assert.equal(errorAt(ERRORS, ["abilities", 1, "params", "damage"]), "Expected number");
  });

  void it("is a list's own message, apart from its items'", () => {
    assert.equal(errorAt(ERRORS, ["abilities"]), "At least one ability");
  });

  void it("is nothing where the check found nothing", () => {
    assert.equal(errorAt(ERRORS, ["abilities", 0, "id"]), undefined);
    assert.equal(errorAt(ERRORS, ["abilities", 1]), undefined);
    assert.equal(errorAt(undefined, ["name"]), undefined);
  });
});
