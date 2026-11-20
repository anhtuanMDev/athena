import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { schemaAiPrompt } from "../app/lib/schema-prompt";

// The schema editor's "Get AI Prompt" (app/lib/schema-prompt.ts): one prompt
// for a new schema and one being edited, as both pages wrote it before.

const CATEGORIES = [{ category: "hero" }, { category: "map" }, { category: "news" }];
const REFERENCES = ["/api/{game}/heroes", "/api/{game}/maps", "/api/{game}/news"];
const prompt = (category: string, name = "") => schemaAiPrompt({ category, name, categories: CATEGORIES, referenceOptions: REFERENCES });

void describe("the schema editor's AI prompt", () => {
  void it("asks for a category's blueprint by its name, suggesting a schema name when there is none", () => {
    const hero = prompt("hero");
    assert.ok(hero.startsWith("# Athena Schema Generation Guidelines\nYou are an AI Architect. You are tasked with creating the structural blueprint (a JSON schema definition) for a **Hero** in the Athena platform.\n"));
    assert.ok(hero.includes('  "name": "Base Hero Attributes",\n  "category": "hero", // enum: "hero", "map", "news"\n'));
    assert.ok(hero.endsWith("5. Think about roles, health, armor, movement speed, abilities, weapons, and passives. Do not include hero-specific concepts (like passives or weapons) unless this is a Hero schema.\n"));
    assert.ok(prompt("news", "Patch Notes").includes('  "name": "Patch Notes",\n'));
    assert.ok(prompt("news").includes("for a **News Article** in the Athena platform."));
  });

  void it("calls another category's records entities, with no hint", () => {
    const event = prompt("event");
    assert.ok(event.includes("for a **Entity** in the Athena platform."));
    assert.ok(event.endsWith("\n5.  Do not include hero-specific concepts (like passives or weapons) unless this is a Hero schema.\n"));
  });

  void it("lists where reference fields may read their options, and keeps the example's layout", () => {
    const hero = prompt("hero");
    assert.ok(hero.includes('Requires `referenceApiEndpoint` (MUST be one of: "/api/{game}/heroes", "/api/{game}/maps", "/api/{game}/news")'));
    assert.ok(hero.includes('  "fields": [\n    {\n      "key": "example_basic_field",\n'));
  });
});
