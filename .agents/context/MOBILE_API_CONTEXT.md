# Mobile API & Architecture Context

## Overview
The Mobile API is specifically designed to feed a **Schema-Driven UI (Server-Driven UI)** React Native application. The mobile app acts as a generic "renderer" that downloads configuration blueprints (schemas, enums, layouts) and raw data, allowing the Admin Panel to entirely dictate what displays, in what order, without requiring App Store updates.

This document outlines the API calling flow, the offline-first caching strategy, and what specifically belongs in the local device storage (MMKV).

---

## 1. App Startup (The Initial Boot)

When the app launches, it needs to know what games exist, what the data structures look like (schemas), how to resolve dropdowns (enums), and exactly how to visually render screens (layouts).

* **API Call:** `GET /mobile/init_v2`
* **Flow:** The app hits the Cloudflare Worker, which instantly returns a 1-year cached configuration payload containing all `.json` files from `data/_meta/`, `data/{game}/schemas`, `data/{game}/enums`, and `data/{game}/layouts`.
* **MMKV Strategy: `STORE FULLY`**
  * Save this entire payload in MMKV (e.g., under the key `global_config`). 
  * **Why:** This data dictates the entire layout and structure of the app. By storing it in MMKV, the app boots *instantly* offline. On boot, the app immediately reads MMKV to populate the UI navigation, and fires off a background request to `/mobile/init_v2`. If the JSON payload differs, it silently updates MMKV and triggers a re-render.

---

## 2. Category List Screen (e.g., "Overwatch Heroes" or "Valorant Maps")

When a user navigates to a specific list of entities, the app needs the actual content.

* **API Call:** `GET /mobile/data?game={gameId}&entity={schemaId}` (e.g., `game=overwatch&entity=hero_base`)
* **Flow:** The endpoint reads the GitHub folder (e.g., `data/overwatch/hero_base/*.json`) and returns an array of all entity records belonging to that schema.
* **MMKV Strategy: `STORE FULLY`**
  * Store the resulting array under a dynamic MMKV key like `data_overwatch_hero_base`.
  * **Why:** To provide an offline-first dossier experience. When the user taps the "Heroes" tab, instantly read the array from MMKV and render the `<FlatList>`. Fetch the API in the background and silently update MMKV (and the list) if new heroes or balance changes were pushed.

---

## 3. Entity Detail Screen (Heroes, Maps, Modes, Events, Patches, etc.)

When a user taps an item in **any** list to view its full dossier.

* **API Call:** `NONE` 
* **Flow:** Because `GET /mobile/data` fetched the full array of entities for that category, the specific record (whether it's Tracer, the King's Row map, a Deathmatch mode, or Patch 2.0) is already downloaded on the device.
  1. Extract the specific data record from your MMKV store (e.g., from `data_overwatch_maps`).
  2. Extract the layout configuration for that specific category (e.g., `maps`) from your `global_config` in MMKV.
  3. Pass both to your universal renderer component: `<SchemaRenderer layout={layoutConfig} data={entityRecord} />`.
* **MMKV Strategy: `N/A`** 
  * No new caching is needed here, as the Category List step already cached all the necessary data.

**Crucial Concept:** The React Native app *does not have* a `MapScreen.tsx`, `ModeScreen.tsx`, or `PatchScreen.tsx`. It only has a generic `EntityDetailScreen.tsx` that blindly maps the layout JSON over the data JSON. This is why adding a new category like "Events" requires absolutely zero app code changes!

---

## 4. Images & Media Assets (e.g., Portraits, Ability Icons)

The JSON payloads only contain relative paths or URLs to images (e.g., `/api/assets/heroes/tracer.png`).

* **API Call:** `GET /api/assets/...`
* **MMKV Strategy: `DO NOT STORE`**
  * **Why:** MMKV is an ultra-fast synchronous key-value store meant for text/JSON. Stuffing raw base64 or binary image data into it will bloat the memory map, crash the app, and degrade performance.
  * **Solution:** Use native image caching mechanisms. Use a library like `react-native-fast-image` or `expo-image`. These libraries will download the image once and cache it in the device's native file system (not MMKV), ensuring instant loads on subsequent views.

---

## Cache Invalidation (Admin Integration)

Because the Cloudflare Worker holds the `/mobile/init_v2` payload indefinitely (to save GitHub rate limits), it must be actively purged when data changes. 

Inside `functions/api/[[path]].ts` within the `triggerCachePurge()` function:
Whenever an Admin modifies `data/_meta/games.json` or edits/creates any file under the `/schemas/`, `/enums/`, or `/layouts/` paths via the dashboard, the API intercepts the change and executes a purge on the internal cache key.

This ensures the mobile app always receives the latest structural blueprints the next time it boots up, without manual intervention.
