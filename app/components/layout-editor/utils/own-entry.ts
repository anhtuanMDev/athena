// Lookups keyed by layout data (block types, prop types): own entries only, so a key
// such as "constructor", "toString" or "__proto__" finds nothing instead of Object's.

/** A table's own entry for a key; none when the table has no such key of its own. */
export function ownEntry<T>(table: Partial<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The key, when one of the tables holds it as its own; none otherwise. */
export function ownKeyIn(tables: readonly object[], key: string): string | undefined {
  return tables.some((table) => Object.hasOwn(table, key)) ? key : undefined;
}
