import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ownKeyIn } from "../app/components/layout-editor/utils/own-entry";
import {
  fieldSectionOf,
  infoRowValue,
  isLinkingValue,
  itemPropOf,
  labelOr,
  listSourceOf,
  propValue,
  referenceIds,
  resolvePath,
  shownText,
  statSlots,
  tabsOf,
} from "../app/components/layout-editor/utils/preview-data";

import type { PreviewContext, PreviewProps } from "../app/components/layout-editor/types";
import type { FieldOption, ScreenBlock } from "../app/lib/screen-model";

// What a block's preview reads (layout-editor/utils/preview-data.ts), as the single
// BlockBody component read it before each block type got a preview of its own.

const role: FieldOption = { key: "role", type: "enum", label: "Role" };
const counters: FieldOption = { key: "counters", type: "reference_list", label: "Counters" };
const health: FieldOption = { key: "stats.health", type: "number", unit: "HP" };
const name: FieldOption = { key: "name", type: "string" };

const ctx: PreviewContext = {
  data: { name: "Ana", role: "support", stats: { health: "250" }, counters: ["genji", "tracer"] },
  recordsFor: () => [],
  enumOptions: (field) => (field?.key === "role" ? [{ id: "support", name: "Support" }] : []),
  dataFields: [name, role, counters, health],
  itemFieldsFor: () => [name],
  reference: (_field, id) => (id === "genji" ? { label: "Genji", linked: true } : undefined),
  screenSource: { category: "hero" },
  routeStops: 6,
  pictures: { imageHosts: [], imageVariants: [] },
};

const preview = (props: Record<string, unknown>, type = "text"): PreviewProps => {
  const block: ScreenBlock = { id: "b1", type, props };
  return { block, spec: { name: "Text", props: { label: { type: "string", default: "Badge" } } }, ctx };
};

void describe("a block's prop, as its preview reads it", () => {
  void it("reads a bound field from the screen's data, named and with its unit", () => {
    assert.equal(propValue(preview({ title: "data.role" }), "title"), "Support");
    assert.equal(propValue(preview({ title: "data.stats.health" }), "title"), "250 HP");
    assert.deepEqual(propValue(preview({ title: "data.counters" }), "title"), ["genji", "tracer"]);
  });

  void it("reads an item binding from the list entry, and nothing for a field the data lacks", () => {
    assert.equal(propValue(preview({ itemTitle: "item.name" }), "itemTitle", { name: "Mercy" }), "Mercy");
    assert.equal(propValue(preview({ title: "data.missing" }), "title"), undefined);
  });

  void it("keeps its own value, else the manifest's default", () => {
    assert.equal(propValue(preview({ label: "New" }), "label"), "New");
    assert.equal(propValue(preview({ label: "" }), "label"), "Badge");
    assert.equal(propValue(preview({}), "other"), undefined);
  });

  void it("shows as text, an object as JSON, and nothing for no value", () => {
    assert.equal(shownText(0), "0");
    assert.equal(shownText({ a: 1 }), '{"a":1}');
    assert.equal(shownText(""), null);
    assert.equal(shownText(null), null);
  });
});

void describe("paths, references and lists", () => {
  void it("resolves a dotted path, and nothing past a missing or plain value", () => {
    assert.equal(resolvePath(ctx.data, "stats.health"), "250");
    assert.equal(resolvePath(ctx.data, "stats.armor.value"), undefined);
    assert.equal(resolvePath(ctx.data, "name.length"), undefined);
  });

  void it("gives a reference's ids: one, each of a list, or none for anything else", () => {
    assert.deepEqual(referenceIds("genji"), ["genji"]);
    assert.deepEqual(referenceIds([1, "b"]), ["1", "b"]);
    assert.equal(referenceIds([{ id: "a" }]), null);
    assert.equal(referenceIds(undefined), null);
  });

  void it("lists the block's own source, else the screen's", () => {
    assert.deepEqual(listSourceOf(preview({ source: { category: "map" } })), { category: "map" });
    assert.deepEqual(listSourceOf(preview({})), { category: "hero" });
  });

  void it("reads stats, tabs, item props, labels and info row values", () => {
    assert.deepEqual(statSlots({ id: "s", type: "stat_row", props: { stat1Value: 1, stat1Label: "Kills", stat3Value: "data.x" } }), [
      { label: "Kills", valueProp: "stat1Value" },
      { label: undefined, valueProp: "stat3Value" },
    ]);
    assert.deepEqual(tabsOf(" Abilities, ,Lore "), ["Abilities", "Lore"]);
    assert.deepEqual(tabsOf(undefined), []);
    assert.equal(itemPropOf("gallery"), "itemImage");
    assert.equal(itemPropOf("tips_card"), "itemText");
    assert.equal(labelOr("", "Label"), "Label");
    assert.equal(labelOr("Role", "Label"), "Role");
    assert.equal(infoRowValue(ctx, "data.role"), "Support");
    assert.equal(infoRowValue(ctx, "Fixed"), "Fixed");
  });
});

void describe("a field section", () => {
  void it("shows a single enum value by its option", () => {
    const section = fieldSectionOf(preview({ field: "data.role" }, "field_section"), false);
    assert.equal(section.option?.name, "Support");
    assert.equal(section.ids, null);
  });

  void it("shows references by their ids, opened only when linkReferences says so", () => {
    const section = fieldSectionOf(preview({ field: "data.counters" }, "field_section"), isLinkingValue("true"));
    assert.deepEqual(section.ids, ["genji", "tracer"]);
    assert.equal(section.isLinking, true);
    assert.equal(section.entries, null);
    assert.equal(isLinkingValue("false"), false);
  });

  void it("has no field when its prop isn't bound, or its field is missing", () => {
    assert.equal(fieldSectionOf(preview({ field: "Role" }, "field_section"), false).path, undefined);
    const missing = fieldSectionOf(preview({ field: "data.lore" }, "field_section"), false);
    assert.equal(missing.path, "lore");
    assert.equal(missing.field, undefined);
  });
});

/** Names every object inherits: a block type named so must not find Object's members. */
const INHERITED = ["constructor", "toString", "__proto__", "hasOwnProperty"];

// The preview tables hold components (.tsx, which node --test can't load); these stand-ins have
// the same keys, and previewOf picks from them as BlockPreview does: by an own key, else the generic preview.
const HEADER_PREVIEWS: Partial<Record<string, string>> = Object.fromEntries(
  ["screen_header", "welcome_banner", "record_actions", "promo_card", "detail_header", "tab_bar", "text", "badge", "cover_entity_header"].map((type) => [type, `header:${type}`]),
);
const LIST_PREVIEWS: Partial<Record<string, string>> = Object.fromEntries(
  ["featured_carousel", "shortcut_grid", "filter_chips", "record_grid", "info_list", "field_section", "route_timeline", "gallery", "tips_card", "item_list", "stat_row"].map((type) => [type, `list:${type}`]),
);

const previewOf = (type: string) => {
  const key = ownKeyIn([HEADER_PREVIEWS, LIST_PREVIEWS], type);
  return key === undefined ? "GenericPreview" : (HEADER_PREVIEWS[key] ?? LIST_PREVIEWS[key] ?? "GenericPreview");
};

void describe("a block type named after an Object member", () => {
  void it("gets the generic preview, as any type without a preview of its own", () => {
    for (const type of INHERITED) {
      assert.equal(ownKeyIn([HEADER_PREVIEWS, LIST_PREVIEWS], type), undefined, type);
    }
    for (const type of [...INHERITED, "mystery_block"]) {
      assert.equal(previewOf(type), "GenericPreview", type);
    }
  });

  void it("still finds a known type's own preview, in either table", () => {
    assert.equal(previewOf("screen_header"), "header:screen_header");
    assert.equal(previewOf("gallery"), "list:gallery");
  });

  void it("shows its entries' text, as a tips card does", () => {
    for (const type of INHERITED) {
      assert.equal(itemPropOf(type), "itemText", type);
    }
    assert.equal(itemPropOf("route_timeline"), "itemLabel");
  });
});
