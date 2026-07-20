# Mobile API & Architecture Context

## Overview
The Mobile API is specifically designed to feed a **Schema-Driven UI (Server-Driven UI)** React Native application. The mobile app acts as a generic "renderer" that downloads configuration blueprints (schemas, enums, layouts) and raw data, allowing the Admin Panel to entirely dictate what displays, in what order, without requiring App Store updates.

This document outlines the API calling flow, the offline-first caching strategy, and what specifically belongs in the local device storage (MMKV).

---

## 1. App Startup (The Initial Boot)

When the app launches, it needs to know what games exist, what the data structures look like (schemas), how to resolve dropdowns (enums), and exactly how to visually render screens (layouts).

* **API Call:** `GET /mobile/init_v2`
* **Flow:** The app hits the Cloudflare Worker, which first reads `data/_meta/games.json` to identify **active games** (`active !== false`). It then instantly returns a 1-year cached configuration payload containing all `.json` files from `data/_meta/`, `data/{game}/schemas`, `data/{game}/enums`, and `data/{game}/layouts` for those active games.
* **MMKV Strategy: `STORE FULLY`**
  * Save this entire payload in MMKV (e.g., under the key `global_config`). 
  * **Why:** This data dictates the entire layout and structure of the app. By storing it in MMKV, the app boots *instantly* offline. On boot, the app immediately reads MMKV to populate the UI navigation, and fires off a background request to `/mobile/init_v2`. If the JSON payload differs, it silently updates MMKV and triggers a re-render.

---

## 2. Layout Configuration & Server-Driven UI

The core of the dynamic React Native app is how it interprets the `layouts` received during the App Startup. For any given schema (e.g., `hero`, `map`), the layout JSON defines exactly what UI primitives to render and what data to inject.

A typical layout file (e.g., `data/overwatch/layouts/hero_base.json`) contains two arrays of layout blocks:
1. `cardLayout`: Defines the UI structure for the list view (e.g., a grid cell or a horizontal row).
2. `detailLayout`: Defines the UI structure for the full screen detail view.

**Layout Block Structure:**
Each block in the array is an object with:
* `id`: Unique identifier for the block.
* `type`: The name of the mobile UI primitive (e.g., `image_hero`, `stat_grid`, `title`, `key_value_list`).
* `props`: A JSON object binding data keys to component properties (e.g., `{"title": "data.name", "imageUrl": "data.portrait_url"}`).

**How the Mobile App Handles It:**
1. **The Registry:** The React Native app must maintain a registry of Primitive Components (e.g., `<ImageHero />`, `<StatGrid />`).
2. **The SchemaRenderer:** When asked to render a layout, the app iterates through the layout array. For each block, it looks up the component by `type` in the registry.
3. **Data Binding:** The app evaluates the `props` mapping against the current entity's data payload, resolving things like `"data.health"` to `200`, and passes those resolved values as props to the Primitive Component.

---

## 3. Home Screen (Global Layout)

The Home Screen is a unique screen that aggregates data from multiple categories rather than displaying a single entity. It acts as the main landing page of the application.

* **API Call:** `NONE` (Configured by App Startup)
* **Flow:** 
  1. Extract the `home` layout configuration from the `global_config.layouts` array retrieved during app startup.
  2. Pass this specific layout to your universal renderer: `<SchemaRenderer layout={homeLayout.detailLayout} data={globalDataStore} />`.
  3. Because the Home Screen is not bound to a specific entity, its layout configuration uses "global" sections that fetch or extract aggregated data across multiple schemas (e.g., pulling the latest patch from `data_overwatch_patches` or a featured hero from `data_overwatch_heroes`).
* **MMKV Strategy: `N/A`**
  * The structure is already stored in MMKV via the App Startup boot payload.

---

## 4. Category List Screen (e.g., "Overwatch Heroes" or "Valorant Maps")

When a user navigates to a specific list of entities, the app needs the actual content.

* **API Call:** `GET /mobile/data?game={gameId}&entity={schemaId}` (e.g., `game=overwatch&entity=hero_base`)
* **Flow:** The endpoint reads the GitHub folder (e.g., `data/overwatch/hero_base/*.json`). To circumvent GitHub rate limits and payload sizes, it fetches the raw base64 content of all files in parallel chunks, parses them, and returns an array of all entity records belonging to that schema. The response is heavily cached (1-year TTL) via Cloudflare Workers Cache API.
* **Rendering:** For each item in the returned array, the app uses the `cardLayout` configuration from MMKV to render the list item.
* **MMKV Strategy: `STORE FULLY`**
  * Store the resulting array under a dynamic MMKV key like `data_overwatch_hero_base`.
  * **Why:** To provide an offline-first dossier experience. When the user taps the "Heroes" tab, instantly read the array from MMKV and render the `<FlatList>`. Fetch the API in the background and silently update MMKV (and the list) if new heroes or balance changes were pushed.

---

## 5. Entity Detail Screen (Heroes, Maps, Modes, Events, Patches, etc.)

When a user taps an item in **any** list to view its full dossier.

* **API Call:** `NONE` 
* **Flow:** Because `GET /mobile/data` fetched the full array of entities for that category, the specific record (whether it's Tracer, the King's Row map, a Deathmatch mode, or Patch 2.0) is already downloaded on the device.
  1. Extract the specific data record from your MMKV store (e.g., from `data_overwatch_maps`).
  2. Extract the layout configuration for that specific category (e.g., `maps`) from your `global_config` in MMKV.
  3. Pass both to your universal renderer component: `<SchemaRenderer layout={layoutConfig.detailLayout} data={entityRecord} />`.
* **MMKV Strategy: `N/A`** 
  * No new caching is needed here, as the Category List step already cached all the necessary data.

**Crucial Concept:** The React Native app *does not have* a `MapScreen.tsx`, `ModeScreen.tsx`, or `PatchScreen.tsx`. It only has a generic `EntityDetailScreen.tsx` that blindly maps the layout JSON over the data JSON. This is why adding a new category like "Events" requires absolutely zero app code changes!

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

* **Global Configuration (`/mobile/init_v2`):** Whenever an Admin modifies `data/_meta/games.json` or edits/creates any file under the `/schemas/`, `/enums/`, or `/layouts/` paths via the dashboard, the API intercepts the change and executes a purge on the internal cache key for `/mobile/init_v2`.
* **Assets (`/api/assets/...`):** When images are uploaded or modified, the corresponding asset cache key is purged.
* **Individual Entity Files (`/api/data/file`):** When an entity (like a hero or map) is edited, the cache for fetching that specific file in the web admin is purged.
* **⚠️ Mobile Data Endpoint (`/mobile/data`):** Currently, editing an entity file *does not* automatically trigger a cache purge for the aggregate `/mobile/data` endpoint in `triggerCachePurge()`. This requires either explicit manual purging or an upcoming feature to intercept entity folder updates.

This architecture ensures the mobile app always receives the latest structural blueprints the next time it boots up, while optimizing GitHub API consumption.
