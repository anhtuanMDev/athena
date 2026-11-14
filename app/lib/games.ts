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

/**
 * games.json's list after the games form saves `saved`: a new game (`editing`
 * null) goes last, and must have a slug no game has; an edited one replaces
 * the game it was opened from, `merge`d with it (keys the form doesn't edit),
 * and keeps that game's slug, which names its data (app/lib/games-guard.ts).
 */
export function withSavedGame<G extends { slug: string }>(
  games: readonly G[],
  saved: G,
  editing: string | null,
  merge: (old: G, saved: G) => G,
): { games: G[] } | { error: string } {
  if (editing === null) {
    if (games.some((g) => g.slug === saved.slug)) return { error: "A game with this slug already exists" };
    return { games: [...games, saved] };
  }
  if (!games.some((g) => g.slug === editing)) return { error: "This game isn't in games.json anymore. Reload the page." };
  return { games: games.map((g) => (g.slug === editing ? merge(g, { ...saved, slug: editing }) : g)) };
}
