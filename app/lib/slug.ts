/**
 * A record-id-safe slug: lowercase ASCII letters, digits and dashes, at most 80
 * characters. Accents are dropped ("Esperança" → "esperanca"). The importer
 * and the New editors share it, so a record made by hand gets the id an
 * import of the same name would, and references to it match.
 */
export function slugify(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}
