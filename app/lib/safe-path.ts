import { isCategoryFolderFormat } from "./categories";
import { GAME_SLUG, RECORD_ID } from "./contract";

// The contract's slug and record id (contract.ts): a path the API takes names
// a game and a record the app can show.
export const SAFE_SLUG = GAME_SLUG;
export const SAFE_ENTITY_ID = RECORD_ID;

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

