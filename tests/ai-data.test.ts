import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importedMessage, promptFileName } from "../app/lib/ai-data";

// The AI data bar's words (app/lib/ai-data.ts): the mode and hero pages share
// it, and a mode's import said it imported hero data.

void describe("the AI data bar", () => {
  void it("names the prompt file after the entity", () => {
    assert.equal(promptFileName("hero"), "athena_hero_data_prompt.md");
    assert.equal(promptFileName("mode"), "athena_mode_data_prompt.md");
  });

  void it("says which entity's data it imported, and from where", () => {
    assert.equal(importedMessage("hero", "file"), "Imported hero data from file!");
    assert.equal(importedMessage("mode", "pasted text"), "Imported mode data from pasted text!");
  });
});
