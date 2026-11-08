/**
 * Whether players see a game (data/_meta/games.json). The file may leave
 * `active` out: only `active: false` hides a game, in /mobile/init, pushes and
 * the cron worker alike, so the admin reads the flag by this rule too.
 */
export function isGameActive(game: { active?: unknown }): boolean {
  return game.active !== false;
}

/** The games the sidebar lists: those players see, as the app does. */
export function sidebarGames<G extends { slug: string; name: string; icon?: string; active?: unknown }>(games: readonly G[]) {
  return games.filter(isGameActive).map((g) => ({ slug: g.slug, name: g.name, icon: g.icon }));
}
