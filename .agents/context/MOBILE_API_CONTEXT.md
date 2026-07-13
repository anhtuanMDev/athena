# Mobile API Context

## Overview
The Athena project serves not just as an administration panel but also acts as the backend for the Athena Mobile App. To accommodate the mobile app efficiently, we maintain a dedicated API layer prefix `/mobile/` (implemented via Cloudflare Pages Functions in `functions/mobile/`).

This document outlines the architecture, caching strategies, and specific endpoint details for the Mobile API.

---

## 1. Core Endpoints

### `GET /mobile/init`

**Purpose**: 
To retrieve all the global initialization values required by the mobile app upon startup. This drastically reduces the number of API calls the mobile app needs to make by aggregating the configuration of all active games into a single response.

**Data Sourced**:
- **Games**: Fetches the core `games.json` list and rigorously filters it to only return games where `active` is not strictly `false`.
- **Schemas**: For every active game, it dynamically fetches and parses all JSON files inside the `data/{game.id}/schemas/` directory.
- **Enums**: For every active game, it fetches and parses all JSON files inside the `data/{game.id}/enums/` directory.

**Request Parameters**: 
- None. (Currently a parameter-less global initialization endpoint).

**Response Structure (Highly Dynamic)**:
Since the admin panel allows users to create entirely custom Dynamic Schemas and Global Enums, the response is inherently dynamic. The mobile app must be prepared to parse schema `fields` array and resolve `globalEnumId` references dynamically.

```json
{
  "games": [
    {
      "id": "overwatch",
      "name": "Overwatch 2",
      "active": true
    }
  ],
  "schemas": {
    "overwatch": [
      {
        "id": "hero_base",
        "name": "Hero Base Schema",
        "category": "hero",
        "fields": [
          {
            "key": "role",
            "type": "enum",
            "globalEnumId": "hero_roles"
          }
        ]
      }
    ]
  },
  "enums": {
    "overwatch": [
      {
        "id": "hero_roles",
        "name": "Hero Roles",
        "options": [
          { "id": "tank", "label": "Tank", "icon": "/api/assets/..." }
        ]
      }
    ]
  }
}
```

---

## 2. Advanced Caching Architecture

Because `/mobile/init` aggregates multiple files directly from the GitHub Repository via the Octokit REST API, generating this response on the fly for every single mobile app startup would quickly exceed GitHub API Rate Limits and result in extremely slow mobile load times.

To solve this, a specialized caching architecture is employed:

### The Workers Cache API
The response payload is aggressively cached using Cloudflare's internal Workers Cache API (`caches.default`). 
- **Cache Key**: `https://api.internal/mobile/init` (an internal pseudo-URL strictly used for cache matching).
- **TTL**: 1 Year (`max-age=31536000`).

### Bypassing the Edge CDN
If we sent `Cache-Control: public, max-age=31536000` to the mobile client, Cloudflare's Edge CDN (and the mobile browser/OS network layer itself) would intercept requests and return the stale response. Purging the Edge CDN programmatically requires Zone-level API tokens, which we want to avoid.
- **Solution**: The Pages Function modifies the final `Response` to the client to send `"Cache-Control": "no-store"`.
- **Result**: The mobile client's HTTP request ALWAYS reaches our Cloudflare Worker. The Worker then checks the internal `caches.default`, finds the 1-year cached response, and returns it instantly.

---

## 3. Cache Invalidation (Admin Integration)

Because the Worker holds the cache indefinitely, we must actively purge it when data changes in the Admin Panel. 

This is handled inside `functions/api/[[path]].ts` within the `triggerCachePurge()` function.
Whenever a user modifies `data/_meta/games.json` or edits/creates any file under the `/schemas/` or `/enums/` paths via the admin dashboard, the API intercepts the change and executes:
```typescript
cache.delete("https://api.internal/mobile/init")
```

This seamlessly drops the stale configuration. The very next time a mobile app opens and requests `/mobile/init`, the Worker will experience a cache miss, re-fetch all the latest data from GitHub, and store the newly generated configuration in the internal cache.

---

## 4. Notes & Restrictions

1. **Authentication**: The mobile API endpoints are currently strictly **Read-Only** and unauthenticated. Do not expose sensitive data inside schemas, enums, or game metadata.
2. **Rate Limiting**: Currently, `/mobile/init` is not strictly rate-limited against DDoS attacks (unlike the admin login endpoint). However, because it serves statically from the internal Workers cache, it is highly resilient to traffic spikes. If write-endpoints are ever added for Mobile, strict Rate Limit KV checks must be implemented.
3. **Inactive Games**: Data for games where `active: false` is strictly excluded. The mobile API guarantees that mobile clients will not receive schemas or enums for hidden/inactive games, saving bandwidth and preventing accidental data leakage.
