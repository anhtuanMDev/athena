import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ownEntry } from "../app/components/layout-editor/utils/own-entry";
import {
  actionChoice,
  actionFor,
  bindingChoice,
  bindingOf,
  booleanChoice,
  initialMode,
  isSpecialProp,
  jsonText,
  linkFields,
  literalKind,
  moved,
  parseJsonText,
  patchedShortcut,
  propHelp,
  propIds,
  tilePatch,
  textValue,
  unsetLabel,
  updatedSource,
} from "../app/components/layout-editor/utils/prop-values";

// What PropControl's inputs show and send (layout-editor/utils/prop-values.ts), as the
// single PropControl component showed and sent them before its inputs were split out.

const text = { key: "name", type: "string" };
const count = { key: "count", type: "number" };

void describe("a prop's help and ids", () => {
  void it("are the special props' own help, whatever the mode", () => {
    assert.equal(propHelp({ type: "source" }, "value"), "Which records this block lists. Empty uses the screen's records.");
    assert.equal(isSpecialProp("info_rows"), true);
    assert.equal(isSpecialProp("string"), false);
  });

  void it("say where a bound value comes from, or what a value takes and its default", () => {
    assert.equal(propHelp({ type: "string" }, "field"), "Read from the data when the app renders.");
    assert.equal(propHelp({ type: "number", default: 3 }, "value"), "Number · Default 3");
    assert.equal(propHelp({ type: "string", default: "" }, "value"), "Text");
    assert.equal(propHelp({ type: "string", options: ["a"], default: "a" }, "value"), "One of the app's values · Default a");
    assert.equal(propHelp({ type: "ReactNode" }, "value"), "ReactNode");
  });

  void it("offer the app's default as the empty choice", () => {
    assert.equal(unsetLabel({ type: "boolean", default: false }), "Default false (app default)");
    assert.equal(unsetLabel({ type: "boolean" }), "Not set");
  });

  void it("describe the input by its help, and by its error when there is one", () => {
    assert.deepEqual(propIds("b1", "title", undefined), { input: "b1-title", help: "b1-title-help", error: "b1-title-error", describedBy: "b1-title-help" });
    assert.equal(propIds("b1", "title", "Required").describedBy, "b1-title-help b1-title-error");
  });
});

void describe("a prop's mode and input", () => {
  void it("opens bound for a binding, and for an empty item prop of a list block only", () => {
    assert.equal(initialMode("data.name", null, "title"), "field");
    assert.equal(initialMode(undefined, [text], "itemTitle"), "field");
    assert.equal(initialMode(undefined, null, "itemTitle"), "value");
    assert.equal(initialMode("Hello", [text], "itemTitle"), "value");
  });

  void it("gets the app's options first, then an input by its type, else text", () => {
    assert.equal(literalKind({ type: "boolean", options: ["x"] }), "options");
    assert.equal(literalKind({ type: "boolean", options: [] }), "boolean");
    assert.equal(literalKind({ type: "array" }), "array");
    assert.equal(literalKind({ type: "data_binding" }), "text");
  });

  void it("shows text as it is, a stored number or object as JSON, and nothing as empty", () => {
    assert.equal(textValue("12"), "12");
    assert.equal(textValue(12), "12");
    assert.equal(textValue({ a: 1 }), '{"a":1}');
    assert.equal(textValue(null), "");
    assert.equal(booleanChoice(false), "false");
    assert.equal(booleanChoice("true"), "");
  });

  void it("reads and writes a bound field's choice", () => {
    assert.equal(bindingChoice("item.stats.hp"), "item:stats.hp");
    assert.equal(bindingChoice("Hello"), "");
    assert.equal(bindingOf("item:stats.hp"), "item.stats.hp");
    assert.equal(bindingOf("data:a:b"), "data.a:b");
    assert.equal(bindingOf(""), undefined);
  });
});

void describe("a JSON box", () => {
  void it("starts empty for nothing and for an empty object", () => {
    assert.equal(jsonText(undefined, "array"), "");
    assert.equal(jsonText({}, "object"), "");
    assert.equal(jsonText([1], "array"), "[\n  1\n]");
  });

  void it("clears the prop when emptied, keeps the expected JSON, and refuses the rest", () => {
    assert.deepEqual(parseJsonText("  ", "array"), { value: undefined, error: null });
    assert.deepEqual(parseJsonText("", "object"), { value: {}, error: null });
    assert.deepEqual(parseJsonText("[1, 2]", "array"), { value: [1, 2], error: null });
    assert.deepEqual(parseJsonText("[1,", "array"), { error: "This isn't valid JSON yet." });
    assert.deepEqual(parseJsonText("{}", "array"), { error: "Enter a JSON array, such as [1, 2]." });
    assert.deepEqual(parseJsonText("[]", "object"), { error: 'Enter a JSON object, such as {"style": {}}.' });
  });
});

void describe("an action", () => {
  void it("shows as a link read from a field, a fixed link, a screen, or nothing", () => {
    assert.equal(actionChoice({ url: "item.link" }), "field");
    assert.equal(actionChoice({ url: "" }), "url");
    assert.equal(actionChoice({ screen: "heroes" }), "screen:heroes");
    assert.equal(actionChoice({}), "");
  });

  void it("is written back from its choice", () => {
    assert.equal(actionFor("", ["item.link"]), undefined);
    assert.deepEqual(actionFor("url", []), { url: "" });
    assert.deepEqual(actionFor("field", ["item.link", "data.site"]), { url: "item.link" });
    assert.deepEqual(actionFor("screen:settings", []), { screen: "settings" });
  });

  void it("reads links from each entry's text fields first, then the screen's", () => {
    const fields = linkFields({ itemFields: [text, count], dataFields: [{ key: "site", type: "string" }] });
    assert.deepEqual(fields, ["item.name", "data.site"]);
    assert.deepEqual(linkFields({ itemFields: null, dataFields: [count] }), []);
  });
});

void describe("lists of sources, tiles and rows", () => {
  void it("drops a source's emptied keys, and the source without a category", () => {
    assert.deepEqual(updatedSource({ category: "hero", sort: "name" }, { sort: undefined, schema: "" }), { category: "hero" });
    assert.equal(updatedSource({ category: "hero" }, { category: undefined }), undefined);
  });

  void it("swaps a row with its neighbour", () => {
    assert.deepEqual(moved(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
    assert.deepEqual(moved(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  });

  void it("keeps one of a tile's screen and link, and drops what a change clears", () => {
    assert.deepEqual(tilePatch({ screen: "heroes", url: "https://a.b" }), { screen: "heroes", url: undefined });
    assert.deepEqual(tilePatch(undefined), { screen: undefined, url: undefined });
    assert.deepEqual(patchedShortcut({ label: "A", screen: "heroes" }, { screen: undefined, url: "https://a.b" }), { label: "A", url: "https://a.b" });
  });
});

/** Names every object inherits: a block or prop type named so must not find Object's members. */
const INHERITED = ["constructor", "toString", "__proto__", "hasOwnProperty"];

void describe("a prop type named after an Object member", () => {
  void it("finds only a table's own entries", () => {
    const table: Partial<Record<string, string>> = { text: "Text" };
    for (const name of INHERITED) {
      assert.equal(ownEntry(table, name), undefined, name);
    }
    assert.equal(ownEntry(table, "text"), "Text");
  });

  void it("is neither special nor anything but text, and its help is the plain one", () => {
    for (const name of INHERITED) {
      assert.equal(isSpecialProp(name), false, name);
      assert.equal(literalKind({ type: name }), "text", name);
      assert.equal(propHelp({ type: name }, "field"), "Read from the data when the app renders.", name);
    }
    assert.equal(isSpecialProp("shortcuts"), true);
    assert.equal(literalKind({ type: "number" }), "number");
    assert.equal(propHelp({ type: "action" }, "field"), "What tapping does.");
  });
});
