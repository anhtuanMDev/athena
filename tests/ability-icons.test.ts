import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { abilityKey, kitIcons, withKitKeys } from "../app/lib/ability-icons";
import { computeDiff } from "../app/lib/diff";
import { heroRecordSchema } from "../app/lib/record-schema";
import { keepUnknownKeys } from "../app/lib/unknown-keys";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`./fixtures/overwatch/${path}`, import.meta.url), "utf8"));
const heroSchema = heroRecordSchema(fixture("schemas/hero-hero.json").fields);
const ICONS = "/api/assets/overwatch/heroes/ana/abilities";
// Kit items as the editor saves them (the kit item schema's key order), with icons.
const KIT = [
  { id: "biotic-grenade", name: "Biotic Grenade", type: "Ability", icon: { main: `${ICONS}/biotic-grenade.png` }, params: {} },
  { id: "sleep-dart", name: "Sleep Dart", type: "Ability", icon: { main: `${ICONS}/sleep-dart.png`, "2d": `${ICONS}/sleep-dart_2d.png` }, params: {} },
];
const loadedHero = (): Record<string, unknown> => ({ ...fixture("heroes/ana.json"), kit: structuredClone(KIT) });
type Item = Record<string, unknown>;

describe("ability icons in the hero editor", () => {
  it("leave the loaded hero alone, and key its kit's icons as its form keys the kit", () => {
    const hero = loadedHero();
    const before = structuredClone(hero);
    const form = withKitKeys(hero);
    const icons = kitIcons(hero.kit);
    assert.deepEqual(hero, before);
    assert.deepEqual((form.kit as Item[]).map((item) => item._clientId), ["biotic-grenade", "sleep-dart"]);
    assert.deepEqual(Object.keys(icons), ["biotic-grenade", "sleep-dart"]);
  });

  it("keep an ability's icons when its id is renamed in the form", () => {
    const hero = loadedHero();
    const icons = kitIcons(hero.kit);
    const form = withKitKeys(hero) as { kit: Item[] };
    form.kit[1].id = "sleep-dart-2";
    // The save looks the icons up by the key in the form's values: still the loaded one.
    assert.deepEqual(icons[abilityKey(form.kit[1], 1)].map((entry) => [entry.key, entry.previewUrl]), Object.entries(KIT[1].icon));
    // The schema's output, which the form submits, has no _clientId: looked up by
    // that, the renamed ability's icons (and pictures uploaded for it) were lost.
    const submitted = heroSchema.parse(structuredClone(form)) as { kit: Item[] };
    assert.equal(abilityKey(submitted.kit[1], 1), "sleep-dart-2");
    assert.equal(icons[abilityKey(submitted.kit[1], 1)], undefined);
  });

  it("review an untouched kit as unchanged, and never save _clientId", () => {
    const hero = loadedHero();
    const submitted = heroSchema.parse(structuredClone(withKitKeys(hero))) as Item;
    const saved = keepUnknownKeys(hero, submitted, heroSchema);
    assert.deepEqual(computeDiff(hero, saved).filter((d) => d.path.startsWith("kit")), []);
    assert.ok((saved.kit as Item[]).every((item) => !("_clientId" in item)));
  });

  it("key a new ability by its _clientId, else its id, else its place", () => {
    assert.equal(abilityKey({ _clientId: "k3j9x", id: "" }, 2), "k3j9x");
    assert.equal(abilityKey({ _clientId: "", id: "overrun" }, 2), "overrun");
    assert.equal(abilityKey(undefined, 2), "2");
  });
});
