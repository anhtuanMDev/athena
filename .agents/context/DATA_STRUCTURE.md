# Hero Shooter Info App - Full Context & Data Structure Reference

This document is the single source of truth for how data is modeled across the app:
what entities exist, what every field means, how games plug into the same shape despite
having different mechanics, and how the API contract maps to it. Keep this file at the
root of the data repo so contributors (human or AI) can reference it before adding data.

---

## 1. Design principles

1. **Universal core, flexible kit.** Every hero/character has a fixed set of fields that
   mean the same thing in every game (name, roles, portrait, health). Anything
   game-specific (ult charge %, souls cost, team-up partners) lives inside a freeform
   `params` object, never as a top-level field. This is what lets the client render any
   game without per-game UI code.
2. **Dynamic Schema-driven rendering.** Each game has a `schemas/` directory containing JSON files that tell the client how to label, unit-format, and type-render keys that appear in `params`. The client fetches these per game and renders dynamically.
3. **One file per entity.** One hero = one JSON file. One patch = one JSON file. Never
   bundle a whole roster into one file - it makes diffs, PR review, and partial fetches
   painful.
4. **Patches are diffs, not snapshots.** A patch file records only what changed
   (`hero`, `field`, `from`, `to`), not a full copy of the hero. This gives a changelog
   feature for free.
5. **Folder shape is identical across every game.** Adding game #4 means adding a
   folder that matches the existing shape - zero changes to the Worker or client code.

---

## 2. Repository layout

```
data/
  _meta/
    games.json              # registry of all supported games
  <game-slug>/               # e.g. overwatch, marvel-rivals, deadlock
    schemas/                  # dynamic schema field configs for this game
    game.json                  # optional: game-level metadata (see §4.2)
    heroes/
      <hero-id>.json
    maps/
      <map-id>.json
    modes/
      <mode-id>.json
    patches/
      <patch-id>.json          # naming convention: YYYY.MM or YYYY.MM.PATCH_NUM
```

---

## 3. Entity reference

### 3.1 `games.json` (`data/_meta/games.json`)

Registry of every game the app supports. The Worker validates the `:game` URL param
against this list before doing anything else.

| Field       | Type         | Required | Notes                                                     |
| ----------- | ------------ | -------- | --------------------------------------------------------- |
| `slug`      | string       | yes      | URL-safe identifier, matches the data folder name exactly |
| `name`      | string       | yes      | Display name                                              |
| `developer` | string       | no       |                                                           |
| `active`    | boolean      | yes      | `false` hides it from the app without deleting data       |
| `icon`      | string (URL) | no       |                                                           |

### 3.2 `game.json` (optional, `data/<slug>/game.json`)

Game-level metadata that doesn't belong to any single hero. Optional - omit if not needed.

| Field           | Type     | Notes                                                                           |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `current_patch` | string   | Latest patch ID, so the client doesn't have to sort `patches/` itself           |
| `role_counts`   | object   | e.g. `{ "tank": 1, "damage": 2, "support": 1 }` - useful for team-comp features |
| `platforms`     | string[] | e.g. `["pc", "playstation", "xbox"]`                                            |

### 3.3 Dynamic Schemas (`data/<slug>/schemas/*.json`)

The rendering contract for this game's entities. Fetched by the client to generate forms dynamically.

| Field      | Type   | Notes                                                                                 |
| ---------- | ------ | ------------------------------------------------------------------------------------- |
| `category` | string | The entity type this schema belongs to (e.g. `hero`, `map`)                           |
| `fields`   | array  | Map of `{ key, label, type, unit, required }` for every dynamic key for this category |

`fields[].type` is one of: `number`, `text`, `boolean`, `list`, `enum`.

**This directory must be updated whenever an entity introduces a new dynamic parameter.**

### 3.4 Hero (`data/<slug>/heroes/<id>.json`)

The core entity. Fields split into **universal** (same meaning in every game) and
**kit** (flexible, game-specific).

**Universal fields:**

| Field                | Type              | Required | Notes                                                                                                                                           |
| -------------------- | ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | string            | yes      | Matches filename, kebab-case, stable forever (used in URLs and as a foreign key from patches)                                                   |
| `game`               | string            | yes      | Must match a `slug` in `games.json`                                                                                                             |
| `name`               | string            | yes      | Display name                                                                                                                                    |
| `roles`              | string[]          | yes      | Must be a subset of this game's `schema.json.roles`                                                                                             |
| `difficulty`         | number (1–5)      | no       |                                                                                                                                                 |
| `health`             | object            | no       | Freeform sub-object (`health`, `shields`, `armor`, etc.) since even "health" differs by game (Overwatch splits shields/armor, Deadlock doesn't) |
| `movement_speed`     | number            | no       |                                                                                                                                                 |
| `portrait`           | string (URL)      | yes      | Points to `raw.githubusercontent.com`                                                                                                           |
| `bio`                | string            | no       |                                                                                                                                                 |
| `released`           | string (ISO date) | no       |                                                                                                                                                 |
| `last_updated_patch` | string            | no       | Patch ID this file was last edited for - lets the client show "last changed" without scanning all patches                                       |
| `tags`               | string[]          | no       | Freeform, used for search/filter (e.g. `"flanker"`, `"burst-damage"`)                                                                           |
| `kit`                | array             | yes      | See below                                                                                                                                       |

**`kit[]` - one entry per ability:**

| Field         | Type   | Required | Notes                                                                                                     |
| ------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `id`          | string | yes      | kebab-case, unique within this hero, used as the reference key in patch diffs (`kit.<id>.params.<field>`) |
| `name`        | string | yes      | Display name                                                                                              |
| `type`        | string | yes      | Must be one of this game's `schema.json.ability_types`                                                    |
| `description` | string | no       | Plain-language explanation                                                                                |
| `params`      | object | yes      | **Freeform.** Every key must have a matching entry in this game's dynamic schema.                         |

**Why `params` is freeform instead of a fixed set of columns:** a database column
schema would need a new migration every time any game added any new stat type. A
freeform object means adding a new mechanic is a data change, not a schema change -
the tradeoff is that the dynamic schemas have to be kept in sync.

### 3.5 Map (`data/<slug>/maps/<id>.json`)

| Field        | Type         | Required | Notes                          |
| ------------ | ------------ | -------- | ------------------------------ |
| `id`         | string       | yes      |                                |
| `name`       | string       | yes      |                                |
| `game`       | string       | yes      |                                |
| `game_modes` | string[]     | no       | References `mode.id` values    |
| `image`      | string (URL) | no       |                                |
| `location`   | string       | no       | Flavor text - in-world setting |

### 3.6 Mode (`data/<slug>/modes/<id>.json`)

| Field         | Type   | Required | Notes                                                               |
| ------------- | ------ | -------- | ------------------------------------------------------------------- |
| `id`          | string | yes      |                                                                     |
| `name`        | string | yes      |                                                                     |
| `description` | string | no       |                                                                     |
| `rules`       | object | no       | Freeform - win conditions, round structure, etc. vary a lot by game |

### 3.7 Patch (`data/<slug>/patches/<id>.json`)

| Field     | Type              | Required | Notes                              |
| --------- | ----------------- | -------- | ---------------------------------- |
| `patch`   | string            | yes      | Matches filename, e.g. `"2026.06"` |
| `date`    | string (ISO date) | yes      |                                    |
| `summary` | string            | no       | One-line human summary             |
| `changes` | array             | yes      | See below                          |

**`changes[]`:**

| Field   | Type   | Required | Notes                                                                  |
| ------- | ------ | -------- | ---------------------------------------------------------------------- |
| `hero`  | string | yes      | Hero `id` this change applies to                                       |
| `field` | string | yes      | Dot-path into the hero object, e.g. `kit.blink.params.recharge_time_s` |
| `from`  | any    | no       | Omit for additions                                                     |
| `to`    | any    | no       | Omit for removals                                                      |
| `note`  | string | no       | Human-readable explanation                                             |

---

## 4. Per-game vocabulary differences (why the flexible parts exist)

This is the part that changes per game - everything in §3 stays fixed.

|                        | Overwatch 2                   | Marvel Rivals                                          | Deadlock                                          |
| ---------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `roles`                | `tank`, `damage`, `support`   | `vanguard`, `duelist`, `strategist`                    | `laner`                                           |
| Unique `ability_types` | `ultimate`, `passive`         | `team_up` (synergy ability unlocked by teammate picks) | `signature`, `item_slot`                          |
| Unique `params` keys   | `cost_ult_percent`, `charges` | `team_up_partners`, `team_up_effect`                   | `souls_cost`, `charge_time_s`                     |
| Currency/resource      | Ult charge %                  | Ult charge %                                           | Souls (in-match currency, affects item purchases) |

Each of these lives entirely inside `schemas/*.json` + `kit[].params` for its game - no
other file needs to know these differences exist.

---

## 5. Full annotated example (Overwatch - Tracer)

```json
{
  "id": "tracer",
  "game": "overwatch",
  "name": "Tracer",
  "roles": ["damage"],
  "difficulty": 3,
  "health": { "health": 150, "shields": 0, "armor": 0 },
  "movement_speed": 6.0,
  "portrait": "https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/data/overwatch/heroes/img/tracer.png",
  "bio": "A former test pilot who can manipulate her personal chronal flow.",
  "released": "2016-05-24",
  "last_updated_patch": "2026.06",
  "kit": [
    {
      "id": "pulse_pistols",
      "name": "Pulse Pistols",
      "type": "primary",
      "description": "Dual-wielded automatic pistols effective at close range.",
      "params": { "damage_per_shot": 3, "fire_rate": 20, "ammo": 40 }
    },
    {
      "id": "blink",
      "name": "Blink",
      "type": "mobility",
      "description": "Teleport a short distance.",
      "params": { "charges": 3, "recharge_time_s": 3, "distance_m": 7 }
    },
    {
      "id": "pulse_bomb",
      "name": "Pulse Bomb",
      "type": "ultimate",
      "description": "Throw an adhesive bomb dealing heavy area damage.",
      "params": { "cost_ult_percent": 100, "damage": 400, "radius_m": 4 }
    }
  ],
  "tags": ["mobility", "flanker", "high-skill-ceiling"]
}
```

Every field here maps to a row in §3.4. Every `params` key here maps to an entry in
`data/overwatch/schemas/`.

---

## 6. API contract (Cloudflare Worker)

The Worker is a thin, ungenerated mapping from these routes to the file paths above -
it does not know anything about game-specific fields, which is the point.

| Endpoint                             | Returns                                                                     | Backing file(s)                  |
| ------------------------------------ | --------------------------------------------------------------------------- | -------------------------------- |
| `GET /api/games`                     | `games[]`                                                                   | `_meta/games.json`               |
| `GET /api/:game/schemas`             | schemas array                                                               | `<game>/schemas/*.json`          |
| `GET /api/:game/heroes`              | trimmed hero list (`id`, `name`, `roles`, `difficulty`, `portrait`, `tags`) | all files in `<game>/heroes/`    |
| `GET /api/:game/heroes/:id`          | full hero object                                                            | `<game>/heroes/<id>.json`        |
| `GET /api/:game/maps`                | map list                                                                    | all files in `<game>/maps/`      |
| `GET /api/:game/patches`             | sorted list of patch IDs, newest first                                      | filenames in `<game>/patches/`   |
| `GET /api/:game/patches?latest=true` | most recent patch object                                                    | latest file in `<game>/patches/` |
| `GET /api/:game/patches/:patch`      | single patch object                                                         | `<game>/patches/<patch>.json`    |

Caching: all GitHub-sourced responses are cached at Cloudflare's edge for 1 hour
(`CACHE_TTL_SECONDS` in `worker/src/index.js`).

---

## 7. Conventions & guardrails

- **IDs are kebab-case and permanent.** Never rename a hero/map/mode `id` - patches and
  any client-side favorites/bookmarks reference it as a foreign key.
- **Filenames must match the `id`/`patch`/`slug` field inside the file.** The Worker and
  any tooling assumes this; a mismatch is a bug, not a style choice.
- **Every new `params` key needs a `schemas/*.json` entry in the same PR.**
- **Patch `field` paths must be valid dot-paths into the current hero file** - i.e. if a
  patch references `kit.blink.params.recharge_time_s`, the hero file must have a `kit`
  entry with `id: "blink"` and a `params.recharge_time_s` key. Otherwise the changelog
  UI has nothing to link back to.
- **Don't put balance numbers in `bio`/`description`.** Keep flavor text and mechanical
  numbers separate so future data-driven features (tier lists, DPS calculators) can
  trust that all numeric values live only in `params`.

---

## 8. Extension checklist - adding a new game

1. Add a `slug` entry to `data/_meta/games.json`.
2. Create `data/<slug>/schemas/` files.
3. Add hero files to `data/<slug>/heroes/`, following §3.4.
4. Add map/mode/patch files as needed, following §3.5–3.7.
5. No changes needed in `worker/src/index.js` - routes are already parameterized by
   `:game`. Confirm by hitting `GET /api/<slug>/heroes` once data exists.

## 9. Extension checklist - adding a new hero mechanic to an existing game

1. Add the new `params` key(s) directly to the hero's `kit[].params`.
2. Add a matching entry to that game's `schemas/*.json` with `label`, `unit`,
   `type`.
3. If the mechanic needs a new ability category (not just a new stat), add it to
   the schema and use it as `kit[].type`.
4. Nothing else changes - the client renders it automatically via the schema.
