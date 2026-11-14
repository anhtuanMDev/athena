import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { appPicture } from "../app/lib/app-pictures";
import { ASSET_VERSION } from "../app/lib/asset-headers";
import { DEFAULT_CATEGORIES, RESERVED_FOLDERS, isCategoryFolderFormat, isCategoryNameFormat } from "../app/lib/categories";
import * as contract from "../app/lib/contract";
import { fieldOptions, findEnumOption } from "../app/lib/enum-options";
import * as importer from "../app/lib/importer/map";
import { ANDROID_CHANNEL_ID, PUSH_TOPIC } from "../app/lib/push";
import { RECORD_ID } from "../app/lib/record-schema";
import { detailScreenFor } from "../app/lib/reference-labels";
import { SAFE_ENTITY_ID, SAFE_SLUG } from "../app/lib/safe-path";
import { SCREEN_ID, previewRecords, valueView, valueWithUnit, type FieldOption } from "../app/lib/screen-model";
import { APP_POLICY, validateScreenFile } from "../app/lib/screen-policy";
import { GameSchema } from "../app/schemas/game";
import { HeroSchema } from "../app/schemas/hero";
import { MapSchema } from "../app/schemas/map";
import { ModeSchema } from "../app/schemas/mode";

// The contract with the app (zms): zms runs this same file
// (__tests__/fixtures/contract-cases.json), byte for byte, against its own
// code. The rules of each section are in the R3 contract spec; its sha256 is
// in the block manifest's $policy.fixtures.

interface EnumCase {
  name: string;
  field: FieldOption;
  value: unknown;
  expected: { options: string[]; name: string | null; icon: string | null };
}
interface ValueCase {
  name: string;
  field: FieldOption;
  record: Record<string, unknown>;
  expected: { bound: string; section?: string };
}
interface Screen {
  id: string;
  type: string;
  source?: { category: string };
}
const cases: {
  enums: { files: unknown[]; cases: EnumCase[] };
  values: ValueCase[];
  pictures: { name: string; value: unknown; expected: string | null }[];
  lists: { name: string; records: Record<string, unknown>[]; source: Record<string, unknown>; schemas: string[]; expected: string[] }[];
  colors: { value: string; expected: boolean }[];
  ids: { kind: string; value: string; expected: boolean }[];
  detailScreens: { name: string; screens: Screen[]; category: string; expected: string | null }[];
} = JSON.parse(readFileSync(new URL("./fixtures/contract-cases.json", import.meta.url), "utf8"));

/** The contract's pattern for each kind of id the cases name. */
const PATTERN: Record<string, keyof typeof contract> = {
  gameSlug: "GAME_SLUG",
  recordId: "RECORD_ID",
  screenId: "SCREEN_ID",
  category: "CATEGORY_NAME",
  folder: "FOLDER_NAME",
  fieldKey: "FIELD_KEY",
  boundLink: "BOUND_LINK",
  assetVersion: "ASSET_VERSION",
};

/** Whether `value` is an id of `kind`: a record folder and a category name by the admin's own checks, the rest by the contract's pattern. */
function isValidId(kind: string, value: string): boolean | undefined {
  if (kind === "recordFolder") {
    return isCategoryFolderFormat(value);
  }
  if (kind === "categoryName") {
    return isCategoryNameFormat(value);
  }
  const pattern = contract[PATTERN[kind]];
  return pattern instanceof RegExp ? pattern.test(value) : undefined;
}

void describe("the contract: enum options", () => {
  void it("are the app's: empty options left out, matched by id, then by name in any case", () => {
    for (const { name, field, value, expected } of cases.enums.cases) {
      const options = fieldOptions(field, cases.enums.files);
      const found = findEnumOption(options, value);
      assert.deepEqual({ options: options.map((option) => option.id), name: found?.name ?? null, icon: found?.icon ?? null }, expected, name);
    }
  });
});

void describe("the contract: values with units", () => {
  const names = { reference: () => undefined, enumName: () => undefined };
  void it("read as the app's blocks and field sections write them", () => {
    for (const { name, field, record, expected } of cases.values) {
      const value = record[field.key];
      assert.equal(String(valueWithUnit(field, value, record)), expected.bound, `${name} (bound)`);
      if (expected.section === undefined) {
        continue;
      }
      const view = valueView(field, value, names, record);
      assert.equal(view?.kind === "text" ? view.text : null, expected.section, `${name} (section)`);
    }
  });
});

void describe("the contract: pictures", () => {
  void it("are the ones the app loads: the variant it picks, on a host it allows", () => {
    for (const { name, value, expected } of cases.pictures) {
      // The admin serves /api/assets on its own origin.
      assert.equal(appPicture(value, APP_POLICY), expected === null ? null : expected.replace("{api}", ""), name);
    }
  });
});

void describe("the contract: lists", () => {
  void it("are sorted, narrowed and capped as the app lists them", () => {
    for (const { name, records, source, schemas, expected } of cases.lists) {
      const shown = previewRecords(records, source as never, schemas.map((id) => ({ id })));
      assert.deepEqual(shown.map((record) => record.id), expected, name);
    }
  });
});

void describe("the contract: colours", () => {
  void it("are #RGB or #RRGGBB, for a screen's accent and a block's colours", () => {
    const hasColourError = (problems: string[]): boolean => problems.some((problem) => /colou?r/i.test(problem));
    for (const { value, expected: isColour } of cases.colors) {
      const accent = validateScreenFile({ type: "home", accent: value, blocks: [] });
      assert.equal(hasColourError(accent), !isColour, `accent ${JSON.stringify(value)}`);
      // An empty colour prop is one that isn't set.
      if (value === "") {
        continue;
      }
      const props = validateScreenFile({
        type: "home",
        blocks: [
          { id: "t", type: "text", props: { text: "Hi", color: value } },
          { id: "b", type: "badge", props: { label: "New", textColor: value } },
        ],
      });
      assert.equal(hasColourError(props), !isColour, `colour props ${JSON.stringify(value)}`);
    }
  });
});

void describe("the contract: ids", () => {
  void it("are checked with one set of patterns, compiled without flags", () => {
    for (const name of Object.values(PATTERN)) {
      const pattern = contract[name];
      assert.ok(pattern instanceof RegExp, `contract.ts exports ${name}`);
      assert.equal(pattern.flags, "", `${name} has no flags`);
    }
    for (const { kind, value, expected: isValid } of cases.ids) {
      assert.equal(isValidId(kind, value), isValid, `${kind} ${JSON.stringify(value)}`);
    }
  });

  void it("hold the app's values for the rest of the contract", () => {
    assert.deepEqual(contract.RESERVED_FOLDERS, ["imports", "syncs", "schemas", "screens", "enums", "assets", "navigation", "cron", "raw"]);
    assert.deepEqual(contract.RESERVED_CATEGORIES, ["cron_job"]);
    assert.deepEqual(contract.IMAGE_VARIANTS, ["main", "default", "2d", "portrait", "icon"]);
    assert.deepEqual(contract.IMAGE_HOSTS, ["blz-contentstack-images.akamaized.net", "bnetcmsus-a.akamaihd.net"]);
    assert.equal(contract.ASSET_VERSION_LENGTH, 12);
    assert.equal(contract.ASSET_VERSION.source, `^[0-9a-f]{${String(contract.ASSET_VERSION_LENGTH)}}$`);
    assert.equal(contract.PUSH_TOPIC, "all_users");
    assert.equal(contract.ANDROID_CHANNEL_ID, "default");
    assert.deepEqual(contract.SHARED_FIXTURES, [
      "categories.json",
      "contract-cases.json",
      "contrast-cases.json",
      "palette-cases.json",
      "reference-folders-golden-items.json",
      "reference-folders-golden.json",
    ]);
  });
});

void describe("the contract: a category's detail screen", () => {
  void it("is its only detail screen, else none", () => {
    for (const { name, screens, category, expected } of cases.detailScreens) {
      assert.equal(detailScreenFor(screens, category)?.id ?? null, expected, name);
    }
  });
});

void describe("the contract's constants", () => {
  // Every place that checks an id, a slug or a colour uses the contract's.
  const recordIds = cases.ids.filter((entry) => entry.kind === "recordId");
  const slugs = cases.ids.filter((entry) => entry.kind === "gameSlug");

  void it("are the forms' and the server's record ids", () => {
    assert.equal(RECORD_ID, contract.RECORD_ID);
    assert.equal(importer.RECORD_ID, contract.RECORD_ID);
    for (const { value, expected: isValid } of recordIds) {
      assert.equal(HeroSchema.shape.id.safeParse(value).success, isValid, `hero ${value}`);
      assert.equal(MapSchema.shape.id.safeParse(value).success, isValid, `map ${value}`);
      assert.equal(ModeSchema.shape.id.safeParse(value).success, isValid, `mode ${value}`);
      assert.equal(SAFE_ENTITY_ID.test(value), isValid, `server ${value}`);
    }
  });

  void it("are the games form's and the server's slugs", () => {
    for (const { value, expected: isValid } of slugs) {
      assert.equal(GameSchema.shape.slug.safeParse(value).success, isValid, `form ${value}`);
      assert.equal(SAFE_SLUG.test(value), isValid, `server ${value}`);
    }
  });

  void it("are the push topic, the picture versions and the screen ids", () => {
    assert.equal(PUSH_TOPIC, contract.PUSH_TOPIC);
    assert.equal(ANDROID_CHANNEL_ID, contract.ANDROID_CHANNEL_ID);
    assert.equal(ASSET_VERSION, contract.ASSET_VERSION);
    assert.equal(SCREEN_ID, contract.SCREEN_ID);
    assert.equal(RESERVED_FOLDERS, contract.RESERVED_FOLDERS);
    assert.ok(DEFAULT_CATEGORIES.every((category) => isCategoryFolderFormat(category.folder)));
  });
});
