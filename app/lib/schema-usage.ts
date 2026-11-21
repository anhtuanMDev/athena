import { normalizeSource } from "./screen-records";
import { readScreen } from "./screen-starters";

import type { RecordSource } from "./screen-model";

// What a schema's deletion would break in the app's screens (R5 F15). A
// screen lists records through sources, its own and its blocks': each names a
// category and may name one of its schemas. A source naming the schema would
// show nothing; when the schema is its category's last, every source listing
// that category would, and the screen editor refuses such a screen ("…
// which no schema has", screen-model.ts validateScreen).

/** A schema about to go: its id, its category, and how many other schemas that category has. */
export interface SchemaGoing {
  id: string;
  category: string;
  others: number;
}

/** A screen that still needs the schema, and which of its sources does. */
export interface ScreenUse {
  screen: string;
  where: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A block's sources: any of its props that is one. */
function blockSources(block: unknown): { where: string; source: RecordSource }[] {
  if (!isObject(block) || !isObject(block.props)) {
    return [];
  }
  const where = `block "${typeof block.id === "string" ? block.id : "?"}"`;
  return Object.values(block.props).flatMap((value) => {
    const source = normalizeSource(value);
    return source === undefined ? [] : [{ where, source }];
  });
}

/** The sources a screen lists records through: its own, then its blocks'. */
function sourcesOf(raw: unknown): { where: string; source: RecordSource }[] {
  const screen = readScreen(raw);
  const own = screen.source === undefined ? [] : [{ where: "its source", source: screen.source }];
  const blocks: unknown[] = screen.blocks;
  return [...own, ...blocks.flatMap(blockSources)];
}

/** Whether `source` would list nothing without the schema: it lists the schema's category, through it or with no other left. */
const needsSchema = (source: RecordSource, schema: SchemaGoing): boolean =>
  source.category === schema.category && (source.schema === schema.id || schema.others === 0);

/** The screens (as their folder's listing gives them, each with its id) whose sources need `schema`. */
export function screensUsingSchema(screens: readonly unknown[], schema: SchemaGoing): ScreenUse[] {
  return screens.flatMap((raw) => {
    const screen = isObject(raw) && typeof raw.id === "string" ? raw.id : "(unnamed)";
    return sourcesOf(raw)
      .filter(({ source }) => needsSchema(source, schema))
      .map(({ where }) => ({ screen, where }));
  });
}
