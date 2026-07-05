# Dynamic Schema-Driven Architecture

## Overview

The Athena admin dashboard and Cloudflare backend rely on a **Dynamic Schema-Driven Architecture**. Instead of hardcoding React form fields for game entities (Heroes, Maps, Modes, Items, Patches), the system relies on dynamic JSON schemas to render UIs and validate data on the fly. This allows adding fields and metadata across different games without deploying new frontend code.

## Key Concepts

### 1. Schema Definition (Frontend)
- Schemas are defined via the **Dynamic Schema Editor** (`app/components/views/DynamicSchemaEdit.tsx` & `DynamicSchemaNew.tsx`).
- Fields support data types: `string`, `number`, `boolean`, `list` (multi-select), and `enum` (single-select).
- The editor features a full-width premium card layout, allowing users to configure keys, labels, types, units, and required constraints interactively.

### 2. Form Generation
- All entity creation/edit components (`HeroNew`, `MapNew`, `HeroEdit`, etc.) fetch their respective category schema from GitHub.
- They iterate over `schema.fields` using standard React components (e.g. `DynamicSelectField` and `FormField`) to dynamically inject inputs and dropdowns into the UI, ensuring that the form automatically adapts whenever the schema changes.

### 3. Backend API Optimization (The `includeContent` Pattern)
- **Problem**: Fetching dynamic data on the frontend previously required listing a directory (1 request) and then mapping over the list to fetch each JSON blob (N requests), causing severe `N+1` performance bottlenecks and GitHub rate-limiting.
- **Solution**: The Cloudflare Worker API (`functions/api/[[path]].ts`) supports an `includeContent=true` parameter.
- **How it works**: 
  - `GET /api/data/directory?game=...&subpath=schemas&includeContent=true`
  - The worker aggregates all JSON files securely on the edge using a **chunked concurrency model** (`CHUNK_SIZE = 10`). 
  - This batching strategy prevents exceeding Cloudflare's 50-simultaneous-request limit and avoids triggering GitHub's secondary rate limits.
  - The API returns an array of fully parsed JSON objects in a single response, making it highly efficient for consumption by the Admin Dashboard and Mobile Clients.

## Data Storage
- Schemas are saved to GitHub exactly like other JSON data: `data/<game>/schemas/<id>.json`.
- Schemas use `schema.category` to determine which entity type they belong to (e.g., `hero`, `map`, `item`).

## Mobile Consumption
- Mobile applications (like StellarScope/Athena Mobile) can bypass iterative loading and directly hit `/api/data/directory?game=<game>&subpath=<entity_type>&includeContent=true` to download the entirety of a game's content (e.g. all heroes or all maps) in a single optimized payload.
