import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { duplicateOptionIds, formErrorLines, paramIdFromLabel, reviewButton } from "../app/lib/enum-form";

// The enum editor's logic without React (app/lib/enum-form.ts).

void describe("an enum's option ids", () => {
  void it("may not repeat: the save names each one used twice", () => {
    assert.equal(duplicateOptionIds(["push", "escort", "hybrid"]), null);
    assert.equal(duplicateOptionIds(["push", "escort", "push"]), "Duplicate option ID: push");
    assert.equal(duplicateOptionIds(["push", "push", "escort", "escort"]), "Duplicate option IDs: push, escort");
  });

  void it("of a new param follow its label in snake case", () => {
    assert.equal(paramIdFromLabel("Damage Multiplier (%)"), "damage_multiplier");
  });
});

void describe("Edit's Review button", () => {
  void it("is off with nothing to review, and says so beside it", () => {
    const button = reviewButton({ hasChanges: false, isSubmitting: false });
    assert.equal(button.isDisabled, true);
    assert.equal(button.note, "No changes to review yet.");
  });

  void it("is on whenever there's something to review, right or wrong: a click shows what to fix", () => {
    const button = reviewButton({ hasChanges: true, isSubmitting: false });
    assert.equal(button.isDisabled, false);
    assert.equal(button.note, null);
  });

  void it("is off while the review is worked out, and says it's working", () => {
    const button = reviewButton({ hasChanges: true, isSubmitting: true });
    assert.equal(button.isDisabled, true);
    assert.equal(button.label, "Processing...");
  });
});

void describe("a refused enum", () => {
  void it("lists every reason with where it is, those no field shows included", () => {
    const errors = {
      name: { type: "too_small", message: "Name is required" },
      options: [undefined, { params: [{ id: { type: "invalid_format", message: "Must be lowercase alphanumeric and underscores" } }] }],
    };
    assert.deepEqual(formErrorLines(errors), ["name: Name is required", "options.1.params.0.id: Must be lowercase alphanumeric and underscores"]);
  });

  void it("lists a list's own reason, such as an enum with no options", () => {
    assert.deepEqual(formErrorLines({ options: { type: "too_small", message: "At least one option is required" } }), ["options: At least one option is required"]);
    assert.deepEqual(formErrorLines({ options: { root: { type: "too_small", message: "At least one option is required" } } }), ["options.root: At least one option is required"]);
  });
});
