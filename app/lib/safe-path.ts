const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const SAFE_ENTITY_ID = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const SAFE_ENTITY_TYPE = /^(heroes|maps|modes|patches)$/;
const SAFE_STAT_FIELD_KEY = /^[a-z_][a-z0-9_]*$/;

export function assertSafeGameSlug(slug: string): void {
  if (!SAFE_SLUG.test(slug)) {
    throw new Response(`Invalid game slug: ${slug}`, { status: 400 });
  }
}

export function assertSafeEntityId(id: string): void {
  if (!SAFE_ENTITY_ID.test(id)) {
    throw new Response(`Invalid entity id: ${id}`, { status: 400 });
  }
}

export function assertSafeEntityType(type: string): asserts type is "heroes" | "maps" | "modes" | "patches" {
  if (!SAFE_ENTITY_TYPE.test(type)) {
    throw new Response(`Invalid entity type: ${type}`, { status: 400 });
  }
}

export function assertSafeStatFieldKey(key: string): void {
  if (!SAFE_STAT_FIELD_KEY.test(key)) {
    throw new Response(`Invalid stat field key: ${key} — must match /^[a-z_][a-z0-9_]*$/`, { status: 400 });
  }
}

export { SAFE_SLUG, SAFE_ENTITY_ID, SAFE_ENTITY_TYPE, SAFE_STAT_FIELD_KEY };
