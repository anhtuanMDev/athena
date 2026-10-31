# Mobile API & Architecture Context

## Overview
The Mobile API is specifically designed to feed a **Schema-Driven UI (Server-Driven UI)** React Native application. The mobile app acts as a generic "renderer" that downloads configuration blueprints (schemas, enums, screens, navigation) and raw data, allowing the Admin Panel to entirely dictate what displays, in what order, without requiring App Store updates.

This document outlines the API calling flow, the offline-first caching strategy, and what specifically belongs in the local device storage (MMKV).

---

## 1. App Startup (The Initial Boot)

When the app launches, it needs to know what games exist, what the data structures look like (schemas), how to resolve dropdowns (enums), and exactly which screens to show and how (screens, navigation).

* **API Call:** `GET /mobile/init` (served by `functions/mobile/init.ts`). `init_v4` is only the name of its internal cache key; there is no `/mobile/init_v4` route, and requesting it returns the admin's HTML page with status 200.
* **Flow:** The app hits the Cloudflare Worker, which first reads `data/_meta/games.json` to identify **active games** (`active !== false`). It then returns a cached configuration payload `{ games, schemas, enums, screens, navigation }`: the entries of `games.json` plus all `.json` files from `data/{game}/schemas`, `data/{game}/enums` and `data/{game}/screens` (each screen with its file name as `id`), and `data/{game}/navigation.json` (or `null`), for those active games. Other files in `data/_meta/` (such as `mobile_primitives.json`) are not included.
* **MMKV Strategy: `STORE FULLY`**
  * Save this entire payload in MMKV (e.g., under the key `global_config`). 
  * **Why:** This data dictates the entire layout and structure of the app. By storing it in MMKV, the app boots *instantly* offline. On boot, the app immediately reads MMKV to populate the UI navigation, and fires off a background request to `/mobile/init`. If the JSON payload differs, it silently updates MMKV and triggers a re-render.

---

## 2. Screens, Navigation & Server-Driven UI

Schemas only describe what fields a kind of record has. What the app shows comes from **screens** that the admin builds under **App Screens**, plus the game's **navigation**:

* `data/{game}/screens/{id}.json` — one file per screen. `/mobile/init` adds each file name as `id`.
  * `type`: `home` (the game's first page), `list` (records of one category), `detail` (one record), or `page`.
  * `title`, `appearance` (`light` | `dark`), `source` (`{ category, schema?, sort?, order?, limit? }`, for list and detail screens), `accent` (a color or `"data.<field>"`).
  * `blocks`: the screen's content, top to bottom. Each block is `{ id, type, props, visible?, tab? }`; `type` is a block from the app's registry, listed in `data/_meta/mobile_primitives.json` (generated from the app with `npm run primitives` in zms). `tab` shows a block only while that tab of the screen's `tab_bar` block is selected.
* `data/{game}/navigation.json` — `{ tabs: [{ screen, label, icon }] }`, the bottom tab bar. The first tab is Home. `app:settings` opens the app's own settings screen. Without this file the app shows the `home` screen alone; a game with no screens shows "not set up".

**Bindings.** Props are literals, except:
* `"data.<path>"` — the screen's record on detail screens; on home and list screens, `{ game, heroes, maps, modes, items, patches }` (e.g. `data.patches.0.title`).
* `"item.<path>"` — each entry of a list block (`featured_carousel`, `record_grid`, `item_list`): a record of its `source` (default: the screen's), or an entry of the list field bound to its `items` prop (e.g. `items: "data.abilities"`, `itemTitle: "item.name"`).

A prop bound to an enum field shows the option's name (and fills `<prop>Icon` with the option's icon); one bound to a number field with a unit fills `<prop>Unit`. Asset paths (`/api/assets/...`) become absolute URLs. Hidden blocks, unknown block types and blocks whose required values are missing are skipped, so a config ahead of the app never crashes it.

**Actions.** `action: { screen }` opens another screen, passing the tapped record; `action: { url }` opens a link. `filter_chips` filters every list block of the screen's category by an enum or option field.

## 3. Home & Game Switching

The Home tab is a pager of every active game's home screen: swiping left or right on Home changes the game, and the tab bar and colors follow it. Home screens bind `"data.<path>"` to the game's data store (e.g. `data.game.name`, `data.heroes`), filled from `/mobile/data` for each folder.

## 4. List Screens (e.g., Heroes, Modes)

* **API Call:** `GET /mobile/data?game={gameId}&entity={folder}` (e.g., `game=overwatch&entity=heroes`). The folder comes from the screen's `source.category`: `hero` → `heroes`, `map` → `maps`, `mode` → `modes`, `patch` → `patches`, `item` → `items`.
* **Flow:** The endpoint returns every record in that folder. A record's `schema_id` names its schema; records without one use the category's first schema. A `source.schema` narrows a list to one schema.
* **MMKV Strategy: `STORE FULLY`** under a key like `data_overwatch_heroes`, read instantly offline and refreshed in the background.

## 5. Detail Screens

Opened from a list (or any block with an action) with the tapped record's id. The record comes from the stored folder data, so no extra request is made; `"data.<field>"` reads it.

---

## 6. Images & Media Assets (e.g., Portraits, Ability Icons)

The JSON payloads only contain relative paths or URLs to images (e.g., `assets/heroes/tracer.png`).

* **API Call:** `GET /api/assets/...`
* **Flow:** Fetches the raw image directly from the GitHub repository (`raw.githubusercontent.com`). Responses are cached in Cloudflare using the Cache API.
* **MMKV Strategy: `DO NOT STORE`**
  * **Why:** MMKV is an ultra-fast synchronous key-value store meant for text/JSON. Stuffing raw base64 or binary image data into it will bloat the memory map, crash the app, and degrade performance.
  * **Solution:** Use native image caching mechanisms. Use a library like `react-native-fast-image` or `expo-image`. These libraries will download the image once and cache it in the device's native file system (not MMKV), ensuring instant loads on subsequent views.

---

## 7. Cache Invalidation (Admin Integration)

Because the Cloudflare Worker holds API payloads indefinitely (up to 1 year) to save GitHub rate limits, they must be actively purged when data changes. 

Inside `functions/api/[[path]].ts` within the `triggerCachePurge()` function:

* **Mobile payloads (`/mobile/init`, `/mobile/data`):** The Workers Cache API only keeps an entry in the data center that stored it, so `cache.delete()` cannot reach other data centers. Instead, both cache keys include a version stored in the `RATE_LIMIT_KV` namespace (`app/lib/mobile-cache-version.ts`), and saving or deleting through the dashboard bumps it:
  * `data/_meta/games.json` or any file under `/schemas/`, `/enums/` or `/screens/`, or `navigation.json`, bumps the `/mobile/init` version.
  * An entity file (`data/<game>/<heroes|maps|modes|patches|items>/<id>.json`) bumps the version for that game and folder in `/mobile/data`.
  * Every data center then misses once and refetches (KV changes can take up to about 60 seconds to reach every location). Commits made outside the dashboard (GitHub web edits, merged PRs, the cron worker) do not bump a version.
* **Assets (`/api/assets/...`):** When images are uploaded or modified, the corresponding asset cache key is purged (in the current data center only).
* **Individual Entity Files (`/api/data/file`):** When an entity (like a hero or map) is edited, the cache for fetching that specific file in the web admin is purged.
* **`/mobile/data` parameters:** `game` must be a game slug and `entity` one of `heroes`, `maps`, `modes`, `patches`, `items`; anything else returns 400, so internal folders such as `cron_jobs` are not served.

This architecture ensures the mobile app always receives the latest structural blueprints the next time it boots up, while optimizing GitHub API consumption.
