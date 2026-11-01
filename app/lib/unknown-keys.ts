type Schema = { shape: object } | readonly string[];
const listedKeys = (schema: Schema) => new Set("shape" in schema ? Object.keys(schema.shape) : schema);

/**
 * What an editor saves: `edited`, the output of the schema it checks with,
 * for the keys `schema` lists (a zod object, or the keys themselves), and
 * every other key of the `stored` file as it was. A zod object drops the keys
 * it doesn't list, so saving its output alone deleted them: a hero's
 * passive_abilities and weapons from before the hero schema changed, a game's
 * banner.
 *
 * Keys stay in the stored file's order, so an edit changes only its lines;
 * keys the file didn't have come after. A listed key `edited` leaves out (or
 * leaves undefined, which JSON leaves out) was cleared in the form, and stays
 * out. Only the top level is merged: a listed key's value is `edited`'s whole.
 */
export function keepUnknownKeys(
  stored: Record<string, unknown>,
  edited: Record<string, unknown>,
  schema: Schema,
): Record<string, unknown> {
  const listed = listedKeys(schema);
  const entries: [string, unknown][] = [];
  for (const key of Object.keys(stored)) {
    if (!listed.has(key)) entries.push([key, stored[key]]);
    else if (edited[key] !== undefined) entries.push([key, edited[key]]);
  }
  for (const key of Object.keys(edited)) {
    if (!Object.hasOwn(stored, key) && edited[key] !== undefined) entries.push([key, edited[key]]);
  }
  // fromEntries defines each key, so a stored "__proto__" stays a plain key.
  return Object.fromEntries(entries);
}

/** The keys of `record` that `schema` doesn't list, which a strict schema refuses. */
export function unknownKeys(record: Record<string, unknown>, schema: Schema): string[] {
  const listed = listedKeys(schema);
  return Object.keys(record).filter((key) => !listed.has(key));
}
