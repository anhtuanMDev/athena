// A form's errors, as react-hook-form keeps them: an object per place in the
// values, with a message where the check refused something. Lists keep their
// items' errors by index, and their own message beside them.

const isRecord = (value: unknown): value is Record<string | number, unknown> => typeof value === "object" && value !== null;

/** The message of the form's error at `path` (["abilities", 0, "id"]), if the check refused that place. */
export function errorAt(errors: unknown, path: readonly (string | number)[]): string | undefined {
  const node = path.reduce<unknown>((at, key) => (isRecord(at) ? at[key] : undefined), errors);
  return isRecord(node) && typeof node.message === "string" ? node.message : undefined;
}

/**
 * A form's values as a list field (abilities, a list of objects) reads them:
 * lists of objects by key. The field asks its form for this shape, whatever
 * the form's own type: it reads and writes only the list it's given.
 */
export type ListFormValues = Record<string, Record<string, unknown>[]>;
