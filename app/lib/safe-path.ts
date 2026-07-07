const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const SAFE_ENTITY_ID = /^(?!.*\.\.)[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/;
export const ENTITY_TYPES = ["heroes", "maps", "modes", "patches", "items"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];
const SAFE_ENTITY_TYPE = new RegExp(`^(${ENTITY_TYPES.join("|")})$`);

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

export function assertSafeEntityType(type: string): asserts type is EntityType {
  if (!SAFE_ENTITY_TYPE.test(type)) {
    throw new Response(`Invalid entity type: ${type}`, { status: 400 });
  }
}

