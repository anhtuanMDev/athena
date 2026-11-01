/**
 * What an editor saves, changed only where it was edited.
 *
 * A form fills in what a stored record left out, and saving that changed
 * records nobody had touched. react-hook-form gives an absent text field ""
 * and an absent checkbox false; a field array turns an absent or blank value
 * into [] when it mounts. So abilities gained `description: ""`, heroes
 * `passive: []`, a setting's `options: ""` became []. And the schemas output
 * the keys they list first, so every list entry's keys were reordered.
 *
 * So, at every level of `saved`: keys come in `stored`'s order (new ones
 * after), and a blank value ("", [], null, false or none) where `stored` had
 * nothing ("", [], null or no key) is put back as stored. Real edits stay: a
 * value cleared or a list emptied that had content, new content, and the
 * schemas' coercions (a number stored as text saved as a number). New keys
 * with a value stay too, e.g. the schema_id the mode editor gives a record
 * without one.
 *
 * `schema` (the zod object the editor checks with) keeps a blank its top level
 * requires: a required checkbox left unticked is saved as false.
 * List items are paired with the stored ones by id, else by position (see partner).
 */
export function asStored(stored: unknown, saved: unknown, schema?: { shape: Record<string, { safeParse(v: unknown): { success: boolean } }> }): unknown {
  const required = (key: string) => !!schema?.shape[key] && !schema.shape[key].safeParse(undefined).success;
  return merge(stored, saved, required);
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isNothing = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
const isBlank = (value: unknown) => isNothing(value) || value === false;

function merge(stored: unknown, saved: unknown, required: (key: string) => boolean = () => false): unknown {
  if (isObject(stored) && isObject(saved)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(stored)) {
      if (Object.hasOwn(saved, key)) {
        const value = merge(stored[key], saved[key]);
        if (value !== undefined) out[key] = value;
      } else if (isNothing(stored[key])) {
        // A blank the record had, which the schema dropped (e.g. a list stored as ""): unchanged.
        out[key] = stored[key];
      }
    }
    for (const key of Object.keys(saved)) {
      if (Object.hasOwn(stored, key) || saved[key] === undefined) continue;
      if (isBlank(saved[key]) && !required(key)) continue;
      out[key] = saved[key];
    }
    return out;
  }
  if (Array.isArray(stored) && Array.isArray(saved)) {
    return saved.map((item, i) => merge(partner(stored, saved, item, i), item));
  }
  return isBlank(saved) && isNothing(stored) ? stored : saved;
}

const idOf = (value: unknown) => (isObject(value) && typeof value.id === "string" && value.id ? value.id : undefined);

/**
 * The stored item an edited one was: the one with its id; else the one at its
 * place, unless that one is still in the list by its own id (a renamed ability
 * is the one at its place; a new one isn't).
 */
function partner(stored: unknown[], saved: unknown[], item: unknown, i: number): unknown {
  const id = idOf(item);
  const matches = id === undefined ? [] : stored.filter((s) => idOf(s) === id);
  if (matches.length === 1) return matches[0];
  const there = idOf(stored[i]);
  return there !== undefined && saved.some((s) => idOf(s) === there) ? undefined : stored[i];
}
