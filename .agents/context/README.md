# Hero Shooter Info API - Starter

A GitHub-as-database + Cloudflare Worker API for a multi-game hero shooter companion app.
Currently scaffolded for **Overwatch 2**, **Marvel Rivals**, and **Deadlock** - adding a new
game means adding a data folder, not touching the Worker code.

## Structure

```
data/
  _meta/
    games.json          <- registry of supported games
  overwatch/
    schema.json         <- tells the client how to label/render this game's stat fields
    heroes/*.json        <- one file per hero
    patches/*.json        <- one file per balance patch (diff format)
    maps/*.json
  marvel-rivals/         <- same shape, different vocabulary (roles, team_up mechanic)
  deadlock/               <- same shape, different vocabulary (souls, item slots)

worker/
  src/index.js           <- Cloudflare Worker, routes + GitHub fetch + edge caching
  wrangler.toml
```

## Why this shape

- **Universal core fields** (`id`, `name`, `roles`, `portrait`, `health`, `released`) are
  identical across every game, so your app's hero list/grid UI never needs per-game code.
- **`kit` is a flexible array** of ability objects. Each ability's `params` is a freeform
  object - this is where game-specific mechanics live (ult charge %, souls cost, team-up
  partners, whatever a future game needs) without changing the outer schema.
- **`schema.json` per game** documents what keys can appear in `params`, with a label/unit/type
  for each. Your app fetches this once per game and can render _any_ hero's stats generically,
  including new heroes/games you add later, with zero client-side code changes.
- **Patches are diffs**, not full snapshots - `{ hero, field, from, to }` - so you get a
  changelog feature for free without duplicating whole hero files every patch.

## Adding a new game

1. Add an entry to `data/_meta/games.json`.
2. Create `data/<slug>/schema.json`, `data/<slug>/heroes/*.json`, etc., following the same
   folder shape as the existing games.
3. Nothing in `worker/src/index.js` needs to change - routes are already parameterized by `:game`.

## Running the Worker locally

```bash
cd worker
npm install -g wrangler   # if you don't have it
wrangler dev
```

Then edit `wrangler.toml` and set `GITHUB_OWNER` / `GITHUB_REPO` / `BRANCH` to point at
wherever you push this `data/` folder (it can live in this same repo or a separate one).

## Deploying

```bash
wrangler deploy
```

## Endpoints

| Endpoint                             | Description                                             |
| ------------------------------------ | ------------------------------------------------------- |
| `GET /api/games`                     | List of supported games                                 |
| `GET /api/:game/schema`              | Field/label metadata for rendering that game's stats    |
| `GET /api/:game/heroes`              | Lightweight hero list (id, name, roles, portrait, tags) |
| `GET /api/:game/heroes/:id`          | Full hero detail including kit                          |
| `GET /api/:game/patches`             | List of patch IDs, newest first                         |
| `GET /api/:game/patches?latest=true` | Most recent patch changelog                             |
| `GET /api/:game/patches/:patch`      | Specific patch changelog                                |
| `GET /api/:game/maps`                | Map list                                                |

## Caching notes

- The Worker uses Cloudflare's Cache API (`caches.default`) with a 1 hour TTL for both the
  raw GitHub content fetches and the GitHub API directory listings.
- To force-refresh after pushing new data before the TTL expires, you can add a GitHub
  Actions webhook that calls the Cloudflare API to purge cache on push - not included here,
  ask if you want that added.
- The `/heroes` and `/patches` list endpoints use `api.github.com` (unauthenticated, rate
  limited to 60 req/hr per IP) just to list filenames, since `raw.githubusercontent.com`
  has no directory listing. If you outgrow that limit, add a `GITHUB_TOKEN` secret - see
  the comment in `wrangler.toml`.

## Next steps you might want

- An `index.json` per game listing hero IDs, to avoid the GitHub API directory-listing calls
  entirely (trade a small data-maintenance step for higher rate limits / lower latency).
- A GitHub Action that validates new hero JSON against `schema.json` on PR, so a typo'd stat
  field can't ship silently.
- Search/filter endpoints (`/api/:game/heroes?role=support`) - trivial to add once you're
  fetching all heroes anyway.
