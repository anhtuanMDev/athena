# Admin Web App — Full Context Document

Companion to `DATA_STRUCTURE.md` (the data model contract). That file defines *what*
the data looks like. This file defines the internal tool used to create, review,
update, and delete that data — the tech stack, every page, and the logic behind each
one. Read `DATA_STRUCTURE.md` first; nothing here overrides it.

---

## 1. Purpose & scope

A single-admin (you) internal tool to manage the GitHub-hosted JSON data that powers
the public hero shooter info app. It needs to:

- Create/edit/delete heroes, maps, modes, patches, items/equipment, and per-game schemas across all
  supported games, without hand-editing JSON or making raw commits.
- Show a **diff/review step before anything is written** — you should always see
  exactly what will change before it's committed.
- Keep every hero file's shape valid against `DATA_STRUCTURE.md` §3.4 and against that
  game's `schema.json`, so bad data can't reach the public API.
- Write changes back to GitHub as commits (this *is* the database write path — there is
  no separate database).

Out of scope for v1: multi-admin roles/permissions, public user accounts, analytics.

---

## 2. Architecture overview

```
┌─────────────────────┐        ┌──────────────────┐        ┌───────────────────┐
│   Admin Web App      │ writes │   GitHub repo      │ reads  │  Cloudflare Worker  │
│   (React Router v7)  │──────▶ │   (data/ folder)   │───────▶│  (public API)        │
│   loaders + actions   │        │   = source of      │        │                     │
│   call GitHub REST API│        │   truth / "DB"      │        │  serves the mobile   │
└─────────────────────┘        └──────────────────┘        │  app                 │
         ▲                                                   └───────────────────┘
         │ session cookie auth
         │
   You (single admin), browser
```

Route param validation pattern: every route that interpolates `params.game`, `params.type`, or
`params.id` into a GitHub API path calls `assertSafeGameSlug`, `assertSafeEntityId`, or
`assertSafeEntityType` from `app/lib/safe-path.ts` before any API call. These use strict
allow-list regexes (not blocklists) — `..`, `/`, `\`, and URL-encoded variants are rejected
because the allowed charset `[a-z0-9.-]` simply has no character that can escape the intended
`data/<game>/` directory. The entity type list (`ENTITY_TYPES`) is a single exported const array
from `safe-path.ts` that derives both the regex and the raw editor's `typeValidators` map,
preventing drift when adding new entity types.

Key implication: **the admin app is a GitHub API client, not a database client.**
There is no admin-app database. Every "save" is a commit. Every "list heroes" is a
directory read via the GitHub Contents API. This keeps the whole system to one source
of truth and avoids sync bugs between "the admin app's DB" and "what the public API
serves."

Because the public Worker caches GitHub content for up to 1 hour (see the API repo's
`README.md`), changes made in the admin app won't appear in the mobile app instantly
unless a cache-purge step is wired in (see §7.7).

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **React Router v7**, framework (SSR) mode — file-based routes, `loader`/`action` per route | You already chose this. Framework mode (the old Remix model) is what makes this whole design work: loaders/actions run **server-side only**, so the GitHub write token never reaches the browser. |
| Language | TypeScript | Data model has enough nested structure (kit/params) that type safety catches shape mistakes before they become bad commits. |
| Styling | Tailwind CSS + shadcn/ui | Fast to build data-heavy CRUD UIs (tables, dialogs, forms) without writing custom CSS. |
| Forms | HTML Form + Zod (validate in action) | Zod schemas double as both form validation and the "is this file shape valid" check before commit — one schema, two uses. |
| GitHub integration | `@octokit/rest`, used only inside `loader`/`action` functions | Never import Octokit or reference the token in any client component. |
| Auth | Cookie session (e.g. `react-router`'s session storage) gating a single admin password *or* GitHub OAuth device flow | Single-admin tool — a hashed password in an env var is enough; GitHub OAuth is the upgrade path if you add collaborators later (see §9). |
| Deployment | Cloudflare Pages (via `@react-router/cloudflare` adapter, react-router 8.1.x) Node.js (`@react-router/serve`) for local dev | Same platform as the public Worker — one dashboard, one billing surface, and it can share Cloudflare KV for session storage if needed. Local dev uses `npm run dev` (Vite HMR) or `npm start` (Node.js serve). |
| Diffing | Hand-rolled recursive diff (`app/lib/diff.ts`) | Powers the "review before commit" screen (§7.3). Rejects `..` and encoded variants via allow-list regexes. |

---

## 4. Environment variables (server-only, never exposed to client)

| Var | Purpose |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT, scoped to **only** the data repo, `contents: read & write` permission. Nothing broader. |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` | Same repo the public Worker reads from. |
| `ADMIN_PASSWORD_HASH` | bcrypt hash for the login gate (v1 auth). |
| `SESSION_SECRET` | Cookie signing secret. |
| `WORKER_PURGE_URL` (optional) | If you wire up cache purge on save (§7.7). |

---

## 5. Route map (React Router v7 file-based routes)

```
app/routes/
  login.tsx                          GET/POST  — password gate
  logout.tsx                         POST      — clear session

  _admin.tsx                         layout route: auth guard + nav shell

  _admin.dashboard.tsx               GET — overview across all games

  _admin.games.tsx                   GET — list all games (from games.json)
  _admin.games.new.tsx               GET/POST — add a game
  _admin.games.$slug.edit.tsx        GET/POST — edit a game entry / toggle active

  _admin.$game.schema.tsx            GET/POST — edit that game's schema.json
                                        (roles, ability_types, stat_fields)

  _admin.$game.heroes._index.tsx     GET — hero table (search/filter/sort)
  _admin.$game.heroes.new.tsx        GET/POST — create hero form
  _admin.$game.heroes.$id.tsx        GET/POST — edit hero form
  _admin.$game.heroes.$id.delete.tsx POST — delete confirmation action

  _admin.$game.maps._index.tsx       GET — map list
  _admin.$game.maps.new.tsx          GET/POST
  _admin.$game.maps.$id.tsx          GET/POST/DELETE

  _admin.$game.modes._index.tsx      GET — mode list
  _admin.$game.modes.new.tsx         GET/POST
  _admin.$game.modes.$id.tsx         GET/POST/DELETE

  _admin.$game.patches._index.tsx    GET — patch list, newest first
  _admin.$game.patches.new.tsx       GET/POST — new patch, changelog builder
  _admin.$game.patches.$id.tsx       GET/POST/DELETE — edit/delete a patch

  _admin.$game.items._index.tsx      GET — item/equipment list (hero-specific or universal)
  _admin.$game.items.new.tsx         GET/POST — create item with effects, hero/mode scoping
  _admin.$game.items.$id.tsx         GET/POST/DELETE — edit/delete item

  _admin.$game.raw.$type.$id.tsx     GET/POST — raw JSON escape hatch (§6.10)

  _admin.activity.tsx                GET — recent commits made through this app
```

`_admin.tsx` is a layout route: its loader checks the session cookie and redirects to
`/login` if absent, and its component renders the sidebar nav (Games → per-game
Heroes/Maps/Modes/Patches/Items/Schema) shared by every child route.

---

## 6. Pages — purpose, data, actions

### 6.1 `/login`
- **Loader:** none.
- **Action:** verify password against `ADMIN_PASSWORD_HASH`, set session cookie,
  redirect to `/dashboard`.
- **UI:** single password field. No "forgot password" flow needed for v1 — it's you.

### 6.2 `/dashboard`
- **Loader:** fetch `games.json`; for each active game, fetch hero count (directory
  listing length) and the latest patch ID.
- **UI:** one card per game — name, hero count, "last patch: 2026.06", link into that
  game's sections. This is the "is everything healthy" screen.

### 6.3 `/games` (list) + `/games/new` + `/games/:slug/edit`
- **Loader (list):** `games.json` contents.
- **Action (new/edit):** validate against a `GameSchema` (Zod mirroring
  `DATA_STRUCTURE.md` §3.1), then PUT the updated `games.json` back via Contents API.
- **Logic note:** editing this file is the one place where you're rewriting a *list*
  file rather than a single-entity file — the action reads the current file, mutates
  the in-memory array, and writes the whole file back. Same pattern applies nowhere
  else, since every other entity is one-file-per-record.

### 6.4 `/:game/schema`
- **Loader:** `data/<game>/schema.json`.
- **UI:** three sections matching the file: a tag-input for `roles`, a tag-input for
  `ability_types`, and a table for `stat_fields` (key, label, unit, type dropdown) with
  add/remove rows.
- **Action:** validate, write back.
- **Why this page matters most:** every hero form in this game is *generated from* this
  file (§7.2). Get the schema wrong and every hero form for that game renders wrong.
  This should be the first page you fill out for a brand-new game, before adding any
  heroes.

### 6.5 `/:game/heroes` (index)
- **Loader:** list all files in `data/<game>/heroes/`, fetch each (or fetch a lighter
  cached list if you add an `index.json` per §7.6), return array.
- **UI:** searchable/filterable table — columns: portrait thumbnail, name, roles,
  difficulty, last updated patch, tags. Filter by role. Row click → edit page. "New
  Hero" button top-right.

### 6.6 `/:game/heroes/new` and `/:game/heroes/:id` (create/edit)
This is the most complex page — see §7.1–§7.4 for the logic in detail. Structurally:

- **Loader (edit only):** fetch the hero file + its `sha` (needed for the update
  request later — GitHub's Contents API requires the current blob `sha` to update or
  delete a file, to prevent silently overwriting someone else's concurrent edit).
  Also fetch this game's `schema.json` to drive the dynamic form.
- **UI sections:**
  1. **Core fields** — name, roles (multi-select from `schema.roles`), difficulty
     (1–5), health/shields/armor, movement speed, portrait (URL or upload, §7.5), bio,
     released date, tags.
  2. **Kit builder** — repeatable list of ability blocks. Each block: name, `type`
     (dropdown from `schema.ability_types`), description, and a **params editor**:
     for every key already known in `schema.stat_fields`, render the correctly-typed
     input (number/text/boolean/list) with its label and unit shown as a suffix; below
     that, an "add custom field" control for a brand-new stat not yet in the schema —
     picking this prompts "add `<key>` to this game's schema too?" and, if confirmed,
     writes both the hero file and `schema.json` in the same review step.
  3. **Review & commit** — see §7.3.
- **Action:** validate full hero object against `HeroSchema` (Zod), diff against the
  previous version (edit) or confirm as net-new (create), show the diff, on
  confirmation call GitHub Contents API to write the file, commit message
  auto-filled as `"Update hero: <name>"` / `"Add hero: <name>"` (editable).

### 6.7 `/:game/heroes/:id/delete`
- **Action only**, triggered from a confirm dialog on the edit page (not its own nav
  destination). Requires the current `sha`. Also **checks all patch files for this
  game for any `changes[].hero === id`** and warns "this hero is referenced by N
  patches — they'll become dangling references" before allowing delete.

### 6.8 `/:game/maps` and `/:game/modes` (list/new/edit/delete)
- Same CRUD pattern as heroes but simpler fixed schemas (no dynamic `params` — see
  `DATA_STRUCTURE.md` §3.5–§3.6). No schema-driven form needed here.

### 6.9 `/:game/patches` (list/new/edit/delete)
- **Loader (list):** all patch files, sorted newest first.
- **New/edit UI:** a changelog builder, not a raw JSON editor:
  - Patch ID (defaults to current `YYYY.MM`), date, summary text.
  - Repeatable **change rows**: pick a hero (dropdown, searchable), pick a field
    (dropdown auto-populated from that hero's actual `kit[].params` keys — so you
    can't typo a field path), enter `from`/`to` values, optional note.
  - **Smart prefill:** if you arrived here via "log as patch" from a hero edit (§7.4),
    the change row(s) are pre-populated from the diff you just made and just need a
    patch ID/date assigned.
- **Action:** validate `field` path actually resolves on the referenced hero's current
  file (catches typos before they ship), write the patch file.

### 6.10 `/:game/items` (list/new/edit/delete)
- **Data model:** Items/equipment represent mid-match ability transformations — a single item can override one or more abilities' name, type, description, and params on a specific hero in a specific mode. Hero and mode are optional (universal items omit both).
- **Cross-reference validation:** On save, the action checks:
  - If `hero` is set, it must exist in `data/<game>/heroes/`.
  - If `mode` is set, it must exist in `data/<game>/modes/`.
  - Every `effects[].ability_id` must exist in that hero's `kit[]`.
- **Client rendering contract:** When displaying a hero with items equipped, shallow-merge all matching items' `effects` onto the base `kit[]` entry. Multiple items can stack on the same ability.

### 6.11 `/:game/raw/:type/:id` — raw JSON escape hatch
- A "view/edit raw JSON" page reachable from any entity's edit page, for the rare case
  the structured form can't express something yet. Runs through per-type Zod validation
  (HeroSchema, MapSchema, ModeSchema, PatchSchema, ItemSchema) before commit — this is
  an alternate *input method*, not a bypass of validation. Entity type is validated
  against `ENTITY_TYPES` const from `safe-path.ts`.

### 6.12 `/activity`
- **Loader:** `GET /repos/:owner/:repo/commits` filtered to commits authored by the
  admin app's token/bot identity, most recent first.
- **UI:** simple list — commit message, timestamp, link to the commit on GitHub. Your
  audit trail; since there's no separate database, git history *is* the changelog of
  the admin tool's own actions.

---

## 7. Core logic

### 7.1 Reading from GitHub (all list/edit loaders)

Use the Contents API (`GET /repos/:owner/:repo/contents/:path`), not raw.githubusercontent —
the admin app needs the blob `sha` on every file it might later write to, which
`raw.githubusercontent.com` doesn't return. Directory listings come from the same
endpoint called on a folder path.

```ts
// server-only, inside a loader
const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
// data.sha  -> needed for update/delete
// data.content is base64 -> Buffer.from(data.content, "base64").toString("utf-8")
```

Hero abilities also support optional `mode_overrides` — per-mode numeric overrides on `params`.
When saving a hero, the action validates that every `mode_overrides` key corresponds to a real
file in `data/<game>/modes/` (same cross-reference pattern as item effects). The rendering
contract: for a selected mode, shallow-merge `mode_overrides[mode_id]` onto `params`.

### 7.2 Schema-driven hero form

The hero form does not have a hardcoded field list for `params`. On load it:
1. Fetches `schema.json` for the current game.
2. For each ability already in the hero's `kit[]`, renders one input per key present
   in that ability's `params`, using `schema.stat_fields[key]` for label/unit/type.
3. Any `params` key with no matching schema entry still renders (as a plain
   text input labeled with the raw key) so nothing is ever hidden, but is flagged
   visually — "not in schema yet" — prompting the add-to-schema flow from §6.6.

This is the same principle as the public app's rendering (`DATA_STRUCTURE.md` §3.3),
reused here so the form and the eventual public display never drift apart.

### 7.3 Review-before-commit step (every write action)

No action commits directly from a form submit. The flow is always:
1. Form submits to the route's `action` with `intent: "validate"`.
2. Action validates with Zod, computes a diff against the current GitHub file
   (fetched fresh — not trusted from the loader, in case it changed since page load),
   and returns the diff to the client **without writing anything**.
3. Client renders a diff view (added/changed/removed fields, red/green).
4. A second submit with `intent: "commit"` (plus the `sha` the diff was computed
   against) performs the actual `octokit.repos.createOrUpdateFileContents` call.
5. If the `sha` sent no longer matches the file's current `sha` on GitHub (someone/
   something changed it between steps 2 and 4), the write is rejected with a
   conflict error and the user is told to refresh and redo the edit — this is the
   optimistic-concurrency guard mentioned in §6.6.

### 7.4 "Log as patch" shortcut

When step 2 above (the diff) touches any `kit[].params` value on an **edit** (not a
create), the review screen offers a checkbox: "also record this as a patch change."
Checking it, after commit, redirects to `/:game/patches/new` with the diffed
`{ hero, field, from, to }` rows pre-filled — you still choose the patch ID/date and
can add more rows before committing the patch file separately. This keeps hero-state
and patch-changelog as two deliberate writes (so a typo fix to a hero doesn't
accidentally get logged as a "balance change") while removing the busywork of
re-typing values you just entered.

### 7.5 Image handling

Portraits are just URLs on the hero object, pointing at
`raw.githubusercontent.com/.../data/<game>/heroes/img/<id>.png`. Two supported paths:
- **Paste a URL** — simplest, works if you upload images to the repo yourself via git.
- **Upload from the form** — the action base64-encodes the file and writes it to
  `data/<game>/heroes/img/<id>.png` via the same Contents API create-file call, then
  sets the hero's `portrait` field to the resulting raw URL. Same review-before-commit
  step applies (diff shows "new image file added" rather than a field diff).

### 7.6 Avoiding GitHub API rate limits on list pages

Directory listings (`/heroes`, `/maps`, `/modes`, `/patches` index pages) call the
Contents API per folder. Authenticated (using `GITHUB_TOKEN`) this is 5,000 req/hr,
far above what a single-admin tool needs, so no `index.json` workaround is required
here the way it might be for the *public, unauthenticated* Worker. If this app is ever
opened to more admins, revisit.

### 7.7 Optional: cache purge on save

Since the public Worker caches for up to 1 hour, add an optional POST from the commit
action to a purge endpoint on the Worker (a small addition to `worker/src/index.js`
that calls the Cloudflare Cache API's `.delete()` for the affected URL, gated behind a
shared secret header). Not required for v1 — noted here so it's a deliberate choice,
not a surprise when "I saved it but the app still shows the old value for an hour."

---

## 8. Validation layer (Zod schemas — one-to-one with `DATA_STRUCTURE.md`)

Keep these in a shared `app/schemas/` folder, imported by both loaders/actions (server
validation before commit) and forms (`@hookform/resolvers/zod`, client-side feedback):

```
app/schemas/
  game.ts          # GameSchema        — mirrors §3.1
  schema-file.ts   # SchemaFileSchema  — mirrors §3.3
  hero.ts          # HeroSchema, KitItemSchema — mirrors §3.4, params validated
                     # dynamically against that game's stat_fields types
                     # KitItemSchema also has optional mode_overrides for per-mode stat variance
  item.ts          # ItemSchema, AbilityEffectSchema — mirrors items/equipment (§3.8)
  map.ts           # MapSchema         — mirrors §3.5
  mode.ts          # ModeSchema        — mirrors §3.6
  patch.ts         # PatchSchema, ChangeSchema — mirrors §3.7
```

`hero.ts`'s `params` validation is the one dynamic case: since valid keys differ per
game, the schema is built at request time as `z.record(z.string(), z.any())` and then
individually checked against the current game's `stat_fields[key].type` in the action,
rather than a single static Zod shape.

---

## 9. Auth upgrade path (if this stops being single-admin)

v1's password-in-env-var is fine for one person. If you add collaborators later, swap
`/login` for GitHub OAuth (each admin authenticates with their own GitHub account,
scoped to repo collaborators only) — this also gives you free per-person attribution
in commit authorship instead of everything showing as one bot identity in `/activity`.

---

## 10. Folder structure (admin app repo)

```
admin-app/
  app/
    routes/                 # §5
    schemas/                 # §8
    lib/
      github.server.ts        # Octokit client + all Contents API wrapper functions
      diff.ts                  # shared diff util used by review-before-commit
      safe-path.ts             # Route param allow-list validation (SAFE_SLUG, SAFE_ENTITY_ID, ENTITY_TYPES, SAFE_STAT_FIELD_KEY)
      parse-kit.ts             # Shared form-data → hero object builder (extracted from duplicate inline code)
      session.server.ts        # cookie session helpers
    components/
      HeroForm/
        CoreFields.tsx
        KitBuilder.tsx
        ParamsEditor.tsx        # §7.2's dynamic renderer
      DiffView.tsx               # §7.3's shared diff UI
      DataTable.tsx              # shared table for heroes/maps/modes/patches lists
  wrangler.toml (or platform config for chosen deploy target)
  .env.example
```

---

## 11. Deployment

### Local development (Node.js)

```bash
npm run dev          # Vite HMR dev server (react-router dev)
npm start            # Production Node.js server (react-router-serve)
```

Requires `.env` with `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`.

### Cloudflare Pages (production)

The app uses `@react-router/cloudflare` with a Pages Functions entry point at `functions/[[page]].ts`. The adapter's `createPagesFunctionHandler` serves both static assets and SSR requests.

```bash
npm run pages:dev    # wrangler pages dev (local CF preview)
npm run pages:deploy # build + wrangler pages deploy
```

Secrets are set via `wrangler secret put` (see `wrangler.toml` for the full list). The `nodejs_compat` flag is enabled for Node.js API compatibility (bcryptjs, @octokit/rest).

### Build output

- `build/client/` — static assets (deployed to Cloudflare Pages CDN)
- `build/server/index.js` — SSR server build (imported by `functions/[[page]].ts`)
- `functions/[[page]].ts` — Cloudflare Pages Functions catch-all handler

---

## 12. Explicitly deferred (not v1)

- Multi-admin roles/permissions.
- PR-based review workflow (commit to a branch + open a PR instead of committing
  straight to `main`) — worth adding if this ever becomes a multi-person tool, since
  GitHub's own PR review UI would then do the "review before it's live" job instead of
  this app's in-app diff step.
- Bulk import/export (e.g. CSV → many heroes at once).
- Localization/i18n of hero bios/descriptions.
- Item shop pools / rarity tiers — the item data model supports adding `rarity` and `pool` fields
  later, but the game client handles how/when items are offered mid-match; the repo only catalogs
  what each item does.
- Image upload (portrait URL paste is sufficient for v1).
- `:game` validation against the actual `games.json` registry (currently only format-checked via
  `assertSafeGameSlug`). Add by passing the active slug list from `_admin.tsx`'s loader to child
  routes via `useRouteLoaderData`.
