import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { computeDiff } from "../app/lib/diff";
import { heroRecordSchema, mapRecordSchema, modeRecordSchema, recordFormSchema } from "../app/lib/record-schema";
import { keepUnknownKeys, unknownKeys } from "../app/lib/unknown-keys";
import { CronJobSchema } from "../app/schemas/cron";
import { DynamicSchemaFileSchema } from "../app/schemas/dynamic-schema";
import { EnumSchema } from "../app/schemas/enum";
import { GameSchema } from "../app/schemas/game";

// Ana before she was deleted: she has keys the hero schema no longer lists,
// as Baptiste had when an edit in the form deleted them (zero-backend 93adb16).
const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}`, import.meta.url), "utf8"));
const ana: Record<string, unknown> = fixture("heroes/ana.json");
const heroSchema = heroRecordSchema(fixture("schemas/hero-hero.json").fields);
const LEGACY = ["passive_abilities", "weapons", "ultimate_ability"];

/** What the hero editor saves after the form changed `values`: the schema's output, then the record's other keys. */
const saveHero = (stored: Record<string, unknown>, values: Record<string, unknown>) =>
  keepUnknownKeys(stored, heroSchema.parse(values) as Record<string, unknown>, heroSchema);

describe("saving an edited record", () => {
  it("keeps the keys its schema doesn't list, as they were and where they were", () => {
    const saved = saveHero(ana, { ...structuredClone(ana), nationality: "Egyptian-Canadian" });
    for (const key of LEGACY) assert.deepEqual(saved[key], ana[key], key);
    assert.deepEqual(Object.keys(saved), Object.keys(ana));
    assert.equal(saved.nationality, "Egyptian-Canadian");
    // The review shows the edit, and nothing under the kept keys.
    const diffs = computeDiff(ana, saved);
    assert.ok(diffs.some((d) => d.path === "nationality"));
    assert.deepEqual(diffs.filter((d) => LEGACY.includes(d.path.split(".")[0])), []);
  });

  it("leaves out a key the form cleared, instead of bringing it back", () => {
    const { nationality: _nationality, ...withoutNationality } = structuredClone(ana);
    assert.equal("nationality" in saveHero(ana, withoutNationality), false);
    // Zod gives a cleared optional key as undefined, which JSON leaves out too.
    assert.equal("occupation" in saveHero(ana, { ...structuredClone(ana), occupation: undefined }), false);
  });

  it("adds keys the record didn't have, after the ones it had", () => {
    const { nationality: _nationality, ...stored } = ana;
    const saved = saveHero(stored, { ...structuredClone(stored), nationality: "Egyptian" });
    assert.equal(Object.keys(saved).at(-1), "nationality");
  });

  it("keeps extra keys of list entries and ability params, but never the form's _clientId on an ability", () => {
    const values = structuredClone(ana) as Record<string, any>;
    values.aliases[0].source = "wiki";
    values.abilities[0].params.legacy_note = "kept";
    values.abilities[0]._clientId = "k3j9x";
    values.abilities[0].legacy_item_key = "dropped";
    const saved = saveHero(ana, values) as Record<string, any>;
    assert.equal(saved.aliases[0].source, "wiki");
    assert.equal(saved.abilities[0].params.legacy_note, "kept");
    // An ability is a kit item: its own keys are the kit item's, so the editor's
    // client-side id (and any other key of the item itself) isn't saved.
    assert.equal("_clientId" in saved.abilities[0], false);
    assert.equal("legacy_item_key" in saved.abilities[0], false);
  });

  it("keeps a stored __proto__ key as a plain key", () => {
    const stored = JSON.parse('{"id":"ana","__proto__":{"polluted":true},"name":"Ana"}');
    const saved = keepUnknownKeys(stored, { id: "ana", name: "Ana Amari" }, heroSchema);
    assert.deepEqual(Object.keys(saved), ["id", "__proto__", "name"]);
    assert.equal(Object.getPrototypeOf(saved), Object.prototype);
    assert.equal((saved as { polluted?: boolean }).polluted, undefined);
    assert.equal(JSON.stringify(saved), '{"id":"ana","__proto__":{"polluted":true},"name":"Ana Amari"}');
  });

  it("keeps a game's banner when the Games editor saves it, and drops a light palette the form emptied", () => {
    const stored = { slug: "overwatch", name: "Overwatch 2", active: true, banner: "/api/assets/games/ow-banner.png", primary: "#F99E1A", light: { primary: "#000000" } };
    // The Games editor parses its own fields only; an emptied light palette is left out (lightToSave).
    const edited = GameSchema.parse({ slug: "overwatch", name: "Overwatch 2", active: true, primary: "#FFFFFF" });
    const saved = keepUnknownKeys(stored, edited, GameSchema);
    assert.equal(saved.banner, "/api/assets/games/ow-banner.png");
    assert.equal(saved.primary, "#FFFFFF");
    assert.equal("light" in saved, false);
  });

  it("names the keys the strict forms (maps, modes, news…) refuse, so they can say which", () => {
    const map = { id: "kings-row", name: "King's Row", game: "overwatch", map_type: "hybrid", banner: "kr.png" };
    const mode = { ...fixture("modes/push.json"), legacy_rules: "x" };
    const news = { ...fixture("news/director-s-take-future-formats.json"), source_html: "<p>" };
    for (const [record, schema] of [
      [map, mapRecordSchema(fixture("schemas/map-base-map-attributes.json").fields)],
      [mode, modeRecordSchema(fixture("schemas/mode-base-game-mode-attributes.json").fields)],
      [news, recordFormSchema(fixture("schemas/news-news-article.json").fields)],
    ] as const) {
      const refused = schema.safeParse(record).error?.issues.find((issue) => issue.code === "unrecognized_keys");
      assert.deepEqual(unknownKeys(record, schema), refused && "keys" in refused ? refused.keys : []);
      assert.equal(unknownKeys(record, schema).length, 1);
    }
  });

  it("keeps extra keys of cron jobs, enums and schema files", () => {
    const job = { id: "news", name: "News", schema_id: "news-news-article", category: "news", api_endpoint: "https://example.com/news.json", owner_note: "ask Tuan" };
    const anEnum = { id: "role", name: "Role", options: [{ id: "tank", name: "Tank" }], sort: "manual" };
    const schema = { id: "news-news-article", name: "News", category: "news", fields: [], version: 2 };
    for (const [stored, s] of [
      [job, CronJobSchema],
      [anEnum, EnumSchema],
      [schema, DynamicSchemaFileSchema],
    ] as const) {
      const saved = keepUnknownKeys(stored, s.parse({ ...stored, name: "Renamed" }) as Record<string, unknown>, s);
      assert.equal(saved.name, "Renamed");
      for (const key of ["owner_note", "sort", "version"].filter((k) => k in stored)) assert.equal(saved[key], (stored as Record<string, unknown>)[key]);
    }
  });
});
