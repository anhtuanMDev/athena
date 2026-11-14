import { readFileSync } from "node:fs";

// Heroes as the admin will hold them once they're filled in, for measuring
// what a folder of them costs to serve: each one baptiste.json (a real hero)
// with five abilities, an ultimate, four perks and a passive, each with an
// icon, two portraits, three media portraits and four pieces of concept art
// as pictures, and a balance log of 6 to 24 entries. About 21 KB a hero, 20
// pictures. The same every run.

const BAPTISTE: Record<string, unknown> = JSON.parse(readFileSync(new URL("./overwatch/heroes/baptiste.json", import.meta.url), "utf8"));

const WORDS = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu".split(" ");
const word = (i: number, k: number) => WORDS[(i * 7 + k * 13) % WORDS.length];
const capital = (w: string) => w[0].toUpperCase() + w.slice(1);

/** `value` with Baptiste's name replaced, so heroes don't share their text. */
function renamed<T>(value: T, name: string): T {
  if (typeof value === "string") return value.replaceAll("Baptiste", name) as T;
  if (Array.isArray(value)) return value.map((v) => renamed(v, name)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renamed(v, name)])) as T;
  return value;
}

type Entry = Record<string, unknown>;
const list = (key: string) => BAPTISTE[key] as Entry[];

/** The `i`th filled-in hero, and its pictures' paths under public/assets. */
export function filledHero(i: number): { id: string; hero: Entry; pictures: string[] } {
  const id = `${word(i, 0)}-${word(i, 2)}-${i}`;
  const name = `Hero ${capital(word(i, 1))} ${i}`;
  const dir = `overwatch/heroes/${id}`;
  const pictures: string[] = [];
  const picture = (file: string) => {
    pictures.push(`${dir}/${file}`);
    return `/api/assets/${dir}/${file}`;
  };
  const hero: Entry = { ...renamed(structuredClone(BAPTISTE), name), id, name, hero_name: name, hero_number: i };
  hero.portrait = { "2d": picture("portrait_2d.webp"), "3d": picture("portrait_3d.webp") };
  const [first, second] = list("abilities");
  hero.abilities = ["Weapon", "Ability", "Ability", "Ability", "Melee"].map((type, k) => {
    const abilityId = `${word(i, k + 3)}-${k}`;
    return { ...renamed(structuredClone(k % 2 ? second : first), name), id: abilityId, name: capital(abilityId.replace("-", " ")), type, icon: picture(`abilities/${abilityId}.png`) };
  });
  hero.ultimate_ability = list("ultimate_ability").map((u) => ({ ...u, icon: picture(`abilities/${String(u.id)}.png`) }));
  hero.minor_perks = list("minor_perks").map((p) => ({ ...p, icon: picture(`perks/${String(p.id)}.png`) }));
  hero.major_perks = list("major_perks").map((p) => ({ ...p, icon: picture(`perks/${String(p.id)}.png`) }));
  hero.passive = [{ ...renamed(structuredClone(first), name), id: "passive", name: "Passive", type: "Passive", icon: picture("abilities/passive.png") }];
  hero.media_portraits = list("media_portraits").map((m, k) => ({ ...m, image_url: picture(`media/portrait_${k}.webp`) }));
  hero.media_concept_art = list("media_concept_art").map((m, k) => ({ ...m, image_url: picture(`media/concept_${k}.webp`) }));
  const log = list("balance_change_log");
  hero.balance_change_log = Array.from({ length: 6 + ((i * 5) % 19) }, (_, k) => renamed(log[k % log.length], name));
  return { id, hero, pictures };
}

/** `count` filled-in heroes: their files' text (as the admin writes them) by path, and every picture's path under public/assets. */
export function filledHeroes(count: number): { files: Record<string, string>; pictures: string[] } {
  const files: Record<string, string> = {};
  const pictures: string[] = [];
  for (let i = 1; i <= count; i++) {
    const { id, hero, pictures: own } = filledHero(i);
    files[`data/overwatch/heroes/${id}.json`] = JSON.stringify(hero, null, 2);
    pictures.push(...own);
  }
  return { files, pictures };
}
