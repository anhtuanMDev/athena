// What a screen file holds that the app won't show, for validateScreenFile
// (screen-policy.ts): literal pictures it won't load, colors that aren't hex,
// sources whose category isn't in categories.json, and "data." on home, list
// and page screens reading anything but the game and the category folders
// (zms ScreenView gives those screens { game, <folder>: records }, never one
// record's fields).

import { PICTURE_PROP, pictureAdvice, refusedPicture } from "./app-pictures";
import { HEX_EXAMPLE, colorProblem } from "./colors";
import { CATEGORY_NAME, HEX_COLOR } from "./contract";

import type { PicturePolicy } from "./app-pictures";
import type { Category } from "./categories";

/** The categories of categories.json, as far as a screen's checks need them. */
export type ScreenCategories = readonly Pick<Category, "category" | "folder">[];

const BOUND_ACCENT = /^data\.[a-z0-9_.]+$/;
const DATA_PREFIX = "data.";
const ITEM_PREFIX = "item.";
/** Screen types whose "data." reads { game, <folder>: records }. */
const HOME_DATA_TYPES = new Set<unknown>(["home", "list", "page"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDataBinding = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(DATA_PREFIX) && value.length > DATA_PREFIX.length;

/** A binding: "data.<path>" or "item.<path>" (screen-model.ts isBinding). */
const isBound = (value: unknown): boolean =>
  isDataBinding(value) || (typeof value === "string" && value.startsWith(ITEM_PREFIX) && value.length > ITEM_PREFIX.length);

const notConfigured = (category: string): string =>
  `names the category "${category}", which isn't in categories.json: the app shows nothing for it.`;

const isConfigured = (category: string, categories: ScreenCategories): boolean => categories.some((entry) => entry.category === category);

/** A screen's source: a category name, configured in categories.json when they're given. */
export function screenSourceProblems(source: unknown, categories?: ScreenCategories): string[] {
  if (source === undefined) {
    return [];
  }
  const category = isObject(source) ? source.category : undefined;
  if (typeof category !== "string" || !CATEGORY_NAME.test(category)) {
    return ["source must name a category."];
  }
  return categories === undefined || isConfigured(category, categories) ? [] : [`source ${notConfigured(category)}`];
}

/** A block's own source: a category configured in categories.json, when they're given. */
function blockSourceProblems(source: unknown, where: string, categories?: ScreenCategories): string[] {
  const category = isObject(source) ? source.category : undefined;
  if (categories === undefined || typeof category !== "string" || isConfigured(category, categories)) {
    return [];
  }
  return [`${where}: its source ${notConfigured(category)}`];
}

/** Whether `binding` reads anything but the game or a category folder, which is all a home, list or page screen's "data." has. */
function readsMissingHomeData(binding: string, categories: ScreenCategories): boolean {
  const head = binding.slice(DATA_PREFIX.length).split(".")[0];
  return head !== "game" && !categories.some((entry) => entry.folder === head);
}

/** What a home, list or page screen's "data." holds, for messages. */
function homeDataText(categories: ScreenCategories): string {
  // at(0) is typed as possibly undefined, as an empty list's first entry is.
  const first = categories.at(0);
  return first === undefined ? "data.game and the category folders" : `data.game and the category folders (data.${first.folder}…)`;
}

/** The categories, when a screen of `type` reads home data and they're given: what its "data." bindings are checked against. */
export const homeDataCategories = (type: unknown, categories?: ScreenCategories): ScreenCategories | undefined =>
  HOME_DATA_TYPES.has(type) ? categories : undefined;

/** A screen's accent: a hex color, or a record's field ("data.<field>"), which on a home, list or page screen must be one it has. */
export function accentProblems(accent: unknown, homeData?: ScreenCategories): string[] {
  if (accent === undefined) {
    return [];
  }
  const isWritten = typeof accent === "string" && (HEX_COLOR.test(accent) || BOUND_ACCENT.test(accent));
  const format = isWritten ? [] : [`accent must be ${HEX_EXAMPLE}, or "data.<field>".`];
  const isMissing = homeData !== undefined && typeof accent === "string" && accent.startsWith(DATA_PREFIX) && readsMissingHomeData(accent, homeData);
  const home = isMissing ? [`accent reads "${accent}", but home, list and page screens read only ${homeDataText(homeData)}.`] : [];
  return [...format, ...home];
}

/** Every "data.<path>" inside a prop's value, with where it is ("rows[1].value"). */
function dataBindingsIn(value: unknown, where: string): { where: string; binding: string }[] {
  if (isDataBinding(value)) {
    return [{ where, binding: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => dataBindingsIn(entry, `${where}[${String(index)}]`));
  }
  return isObject(value) ? Object.entries(value).flatMap(([key, nested]) => dataBindingsIn(nested, `${where}.${key}`)) : [];
}

/** "data." in a block of a home, list or page screen that reads what such a screen doesn't have. */
function homeDataProblems(props: Record<string, unknown>, where: string, homeData?: ScreenCategories): string[] {
  if (homeData === undefined) {
    return [];
  }
  return Object.entries(props)
    .flatMap(([name, value]) => dataBindingsIn(value, name))
    .filter(({ binding }) => readsMissingHomeData(binding, homeData))
    .map(({ where: at, binding }) => {
      const field = binding.slice(DATA_PREFIX.length);
      return `${where}: ${at} reads "${binding}", but home, list and page screens read only ${homeDataText(homeData)}: use item.${field} in a list block.`;
    });
}

/** A literal prop the app won't show: a picture it won't load, a color that isn't hex. */
function literalProblems(name: string, value: unknown, pictures: PicturePolicy): string[] {
  const picture = PICTURE_PROP.test(name) ? refusedPicture(value, pictures) : undefined;
  const color = colorProblem(name, value);
  return [
    ...(picture === undefined ? [] : [`the app won't load the picture ${picture} (props.${name}): ${pictureAdvice(pictures)}.`]),
    ...(color === undefined ? [] : [color]),
  ];
}

/** What checking a block's content needs: the app's pictures, and categories.json's categories when they're given. */
export interface BlockContentCheck {
  policy: PicturePolicy;
  categories?: ScreenCategories;
  /** The categories, on a screen whose "data." reads { game, <folder>: records }. */
  homeData?: ScreenCategories;
}

/**
 * What a block's props hold that the app won't show: literal pictures and
 * colors (a bound one comes from a record, which the app checks when it shows
 * it), and a source or "data." it has nothing for.
 */
export function blockContentProblems(props: Record<string, unknown>, where: string, { policy, categories, homeData }: BlockContentCheck): string[] {
  const literals = Object.entries(props).flatMap(([name, value]) =>
    isBound(value) ? [] : literalProblems(name, value, policy).map((problem) => `${where}: ${problem}`),
  );
  return [...literals, ...blockSourceProblems(props.source, where, categories), ...homeDataProblems(props, where, homeData)];
}
