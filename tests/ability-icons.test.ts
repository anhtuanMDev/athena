import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { abilityIcons, abilityKey, abilityLists, applyAbilityIcons, iconForSave, iconKeyProblem, withAbilityKeys } from "../app/lib/ability-icons";
import { asStored } from "../app/lib/as-stored";
import { computeDiff } from "../app/lib/diff";
import { heroRecordSchema } from "../app/lib/record-schema";
import { keepUnknownKeys } from "../app/lib/unknown-keys";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}`, import.meta.url), "utf8"));
const heroFields = fixture("schemas/hero-hero.json").fields;
const heroSchema = heroRecordSchema(heroFields);
const LISTS = abilityLists(heroFields);
const ICONS = "/api/assets/overwatch/heroes/ana/abilities";
type Item = Record<string, unknown>;

/** Ana with icons, and an ability id ("groggy") in two lists, the second without an icon. */
function loadedHero(): Item {
  const ana = fixture("heroes/ana.json");
  ana.abilities[0].icon = { main: `${ICONS}/sleep-dart.png` };
  ana.minor_perks[0].icon = { main: `${ICONS}/groggy.png`, "2d": `${ICONS}/groggy_2d.png` };
  ana.major_perks.push({ id: "groggy", name: "Groggy (major)", type: "Major Perk", params: {} });
  return ana;
}
/** A form's values: react-hook-form keeps _clientId; what it submits is the schema's output, which drops it. */
const formOf = (hero: Item) => withAbilityKeys(hero, LISTS) as Record<string, Item[]>;
const reader = (form: Record<string, unknown>) => (path: string) => path.split(".").reduce<any>((v, k) => v?.[k], form);
const picked = (name: string) => ({ id: `new-${name}`, key: "main", name, base64: "iVBORw0K", previewUrl: "data:image/png;base64,iVBORw0K" });

describe("ability pictures in the editors", () => {
  it("lists the ability lists of a schema", () => {
    assert.deepEqual(LISTS, ["abilities", "minor_perks", "major_perks"]);
  });

  it("key every loaded ability by a key of its own, which renaming its id doesn't change (a)", () => {
    const form = formOf(loadedHero());
    const before = abilityKey("major_perks", form.major_perks[2], 2);
    form.major_perks[2].id = "groggy-2";
    assert.equal(abilityKey("major_perks", form.major_perks[2], 2), before);
  });

  it("save a picture uploaded before the ability's id was renamed, under the new id (a)", () => {
    const hero = loadedHero();
    const form = formOf(hero);
    const icons = abilityIcons(form, LISTS);
    icons[abilityKey("major_perks", form.major_perks[2], 2)] = [picked("groggy-major.png")];
    form.major_perks[2].id = "groggy-2";
    const output = heroSchema.parse(structuredClone(form)) as Record<string, Item[]>;
    const { uploads } = applyAbilityIcons(output, reader(form), LISTS, icons, "overwatch/heroes/ana");
    assert.equal(output.major_perks[2].icon, "/api/assets/overwatch/heroes/ana/major_perks/groggy-2.png");
    assert.deepEqual(uploads.map((u) => u.path), ["public/assets/overwatch/heroes/ana/major_perks/groggy-2.png"]);
  });

  it("keep the same id's pictures apart in two lists, in the map and in their files (b)", () => {
    const hero = loadedHero();
    const form = formOf(hero);
    const icons = abilityIcons(form, LISTS);
    const minor = abilityKey("minor_perks", form.minor_perks[0], 0);
    const major = abilityKey("major_perks", form.major_perks[2], 2);
    assert.notEqual(minor, major);
    assert.deepEqual(icons[minor].map((e) => [e.key, e.previewUrl]), Object.entries((hero.minor_perks as Item[])[0].icon as object));
    assert.equal(icons[major], undefined);

    icons[major] = [picked("major.png")];
    const output = heroSchema.parse(structuredClone(form)) as Record<string, Item[]>;
    const { uploads } = applyAbilityIcons(output, reader(form), LISTS, icons, "overwatch/heroes/ana");
    // The minor perk keeps its own pictures, as stored; the upload goes to the major perks' folder.
    assert.deepEqual(output.minor_perks[0].icon, (hero.minor_perks as Item[])[0].icon);
    assert.deepEqual(uploads.map((u) => u.path), ["public/assets/overwatch/heroes/ana/major_perks/groggy.png"]);
    // The abilities list keeps the folder its pictures always had.
    assert.equal(iconForSave([picked("x.webp")], undefined, "overwatch/heroes/ana/abilities", "sleep-dart").uploads[0].path, "public/assets/overwatch/heroes/ana/abilities/sleep-dart.webp");
  });

  it("only a new ability's id follows its name: the field marks it _isNew, loaded ones get _clientId only", () => {
    const form = formOf(loadedHero());
    assert.ok(form.abilities.every((a) => typeof a._clientId === "string" && !("_isNew" in a)));
  });
});

describe("an ability's icon when saved (c)", () => {
  const stored = { main: `${ICONS}/sleep-dart.png` };

  it("stays exactly as stored when its pictures weren't touched", () => {
    const icons = abilityIcons({ abilities: [{ id: "a", icon: stored }] }, ["abilities"]);
    assert.equal(iconForSave(icons["abilities:a"], stored, "d", "a").icon, stored);
    assert.equal(iconForSave(abilityIcons({ abilities: [{ id: "a", icon: "/x.png" }] }, ["abilities"])["abilities:a"], "/x.png", "d", "a").icon, "/x.png");
    assert.equal(iconForSave([], undefined, "d", "a").icon, undefined);
  });

  it("is removed with its last picture, and leaves out entries without one", () => {
    assert.deepEqual(iconForSave([], stored, "d", "a"), { icon: undefined, uploads: [] });
    assert.deepEqual(iconForSave([{ id: "1", key: "main" }], stored, "d", "a"), { icon: undefined, uploads: [] });
  });

  it("keeps the URLs of pictures already there, and names new ones after the ability", () => {
    const { icon, uploads } = iconForSave([{ id: "1", key: "main", previewUrl: stored.main }, { id: "2", key: "2d", name: "b.PNG", base64: "AA" }], stored, "g/heroes/h/abilities", "a");
    assert.deepEqual(icon, { main: stored.main, "2d": "/api/assets/g/heroes/h/abilities/a_2d.png" });
    assert.deepEqual(uploads, [{ path: "public/assets/g/heroes/h/abilities/a_2d.png", base64: "AA" }]);
  });

  it("accepts only keys the server accepts in a file name", () => {
    assert.equal(iconKeyProblem([{ id: "1", key: "main" }, { id: "2", key: "2d" }]), undefined);
    assert.match(iconKeyProblem([{ id: "1", key: "" }])!, /Give the picture a key/);
    assert.match(iconKeyProblem([{ id: "1", key: "big splash" }])!, /can't be a key/);
    assert.match(iconKeyProblem([{ id: "1", key: "a.b" }])!, /can't be a key/);
    assert.match(iconKeyProblem([{ id: "1", key: "main" }, { id: "2", key: "main" }])!, /Two pictures/);
    assert.throws(() => applyAbilityIcons({ abilities: [{ id: "a" }] }, () => ({ id: "a" }), ["abilities"], { "abilities:a": [{ id: "1", key: "x y", base64: "AA" }] }, "d"), /can't be a key/);
  });
});

describe("saving a hero nobody edited (c)", () => {
  it("reviews and saves it unchanged, without _clientId", () => {
    const hero = loadedHero();
    const form = formOf(hero);
    const output = heroSchema.parse(structuredClone(form)) as Item;
    applyAbilityIcons(output, reader(form), LISTS, abilityIcons(form, LISTS), "overwatch/heroes/ana");
    const saved = asStored(hero, keepUnknownKeys(hero, output, heroSchema), heroSchema) as Item;
    assert.ok(LISTS.every((list) => (saved[list] as Item[]).every((item) => !("_clientId" in item) && !("_isNew" in item))));
    // Only the coercions the schema means to make: numbers stored as text.
    assert.deepEqual(computeDiff(hero, saved).map((d) => d.path), ["ages", "perk_level_xp"]);
    for (const list of LISTS) assert.equal(JSON.stringify(saved[list]), JSON.stringify(hero[list]), list);
  });
});
