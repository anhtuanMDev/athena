import { isCategoryFolderFormat } from "./categories";

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const SAFE_ENTITY_ID = /^(?!.*\.\.)[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/;

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

/**
 * A folder that may hold records: never an internal one. Whether it's a
 * configured category is up to the caller (see categories.ts).
 */
export function assertSafeEntityType(type: string): void {
  if (!isCategoryFolderFormat(type)) {
    throw new Response(`Invalid entity type: ${type}`, { status: 400 });
  }
}

