# Admin Web App - Full Context Document

Companion to `DATA_STRUCTURE.md` (the data model contract). That file defines _what_
the data looks like. This file defines the internal tool used to create, review,
update, and delete that data - the tech stack, every page, and the logic behind each
one. Read `DATA_STRUCTURE.md` first; nothing here overrides it.

---

## 1. Purpose & scope

A single-admin (you) internal tool to manage the GitHub-hosted JSON data that powers
the public hero shooter info app (zms). It needs to:

- Create/edit/delete heroes, maps, modes, and the records of every other category
  configured in `data/_meta/categories.json` (patches, items, news by default), plus
  each game's schemas, enums, app screens and navigation, the games themselves (with
  their palettes), the categories, and import jobs with the drafts they bring in -
  without hand-editing JSON or making raw commits.
- Show a **diff/review step** before the riskiest writes (hero edits, enum edits, the
  raw JSON editor - §7.3). Everything else commits on submit.
- Keep records valid against their game's schemas (`data/<game>/schemas/*.json`), so bad
  data can't reach the public API. Records are checked in the browser; the server
  re-checks the files the app's structure depends on (§8).
- Write changes back to GitHub as commits (this _is_ the database write path - there is
  no separate database).

Out of scope for v1: multi-admin roles/permissions, public user accounts, analytics.

---

## 2. Architecture overview

```
 You (single admin), browser                       Players (zms app)
          │                                               │
          ▼                                               ▼
┌──────────────────────────┐                 ┌──────────────────────────┐
│ Admin SPA (React Router, │  /api/*         │ /mobile/init, /mobile/data│
│ ssr: false), static files├───────────────▶ │ Pages Functions           │
│ from Cloudflare Pages    │  session cookie │ (functions/mobile/*)      │
└──────────────────────────┘                 └────────────┬─────────────┘
          │ /api/* Pages Function                         │ reads (cached in
          ▼ (functions/api/[[path]].ts, holds the token)  │ caches.default)
┌──────────────────────────┐  writes/reads   ┌────────────▼─────────────┐
│ functions/api            ├───────────────▶ │ GitHub data repo          │
└──────────────────────────┘                 │ (zero-backend) = "DB"     │
          ▲ push webhook (/api/webhooks/github)└────────────▲─────────────┘
          └───────────────────────────────────────────────┤ drafts + run state
                                              ┌────────────┴─────────────┐
                                              │ Cron Worker (workers/cron)│
                                              │ imports from news/patch   │
                                              │ pages on a schedule       │
                                              └──────────────────────────┘
```

The admin is a single-page app (`react-router.config.ts`: `ssr: false`). Pages serves
`build/client` as static files; the browser never holds the GitHub token. Every read and
write goes through `fetch("/api/...")` (`app/lib/github.ts` `api()`, `useData` in
`app/lib/use-data.ts`) to the Pages Function `functions/api/[[path]].ts`, which holds
the token and talks to GitHub.

**Which requests run a Function.** `public/_routes.json` includes `/api/*` and
`/mobile/*` only. The admin's pages, scripts and styles are served as files (with
`public/_headers`), and an unknown path gets `index.html` - Pages' SPA fallback when
there is no `404.html`. Before this, a catch-all Function made every JS, CSS and HTML
request (about 30 per page load) a Function invocation, against Workers Free's daily
request allowance. `tests/routes.test.ts` checks that every Function file is covered,
that static paths run none, and that no `404.html` exists.

**Path validation.** The Function is the real boundary: `assertSafeFilePath`
(`functions/api/[[path]].ts`) rejects `..`, leading `/` and NUL (also URL-decoded), and
only allows paths under `data/` or `public/assets/` matching `SAFE_FILE_PATH`. In the
browser, `app/lib/safe-path.ts` has `SAFE_SLUG`, `SAFE_ENTITY_ID` (whose lookahead also
blocks `..`) and the `assertSafeGameSlug` / `assertSafeEntityId` / `assertSafeEntityType`
helpers; `assertSafeEntityType` accepts a category folder name
(`isCategoryFolderFormat`, `app/lib/categories.ts`). Not every view calls them (the
screen editor and screens list don't, and the record, cron job, enum and schema
editors check the game slug but not the id), which is why the server-side check is the
one that matters.

Key implication: **the admin app is a GitHub API client, not a database client.**
There is no admin-app database. Every "save" is a commit. Every "list heroes" is a
folder read of the data repo. This keeps the whole system to one source of truth and
avoids sync bugs between "the admin app's DB" and "what the public API serves."

The mobile API is part of this project (`functions/mobile/init.ts`,
`functions/mobile/data.ts`). Its payloads are cached in each data center's
`caches.default` for a year (a minute when some files couldn't be read), under keys
that carry a version kept in KV; every admin save bumps the right version, so the app
sees a change within about two minutes (§7.7). A payload missing files says so in
`X-Incomplete`; when one can't be built, or KV can't be read, the last complete one is
served marked `X-Stale`. Only active games are served. The contract with the app is in
`MOBILE_API_CONTEXT.md` §8.

---

## 3. Tech stack

| Layer              | Choice                                                                                                   | Why                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | **React Router 8** (`react-router` 8.3), SPA mode (`ssr: false`), routes declared in `app/routes.ts`      | No server rendering: the token lives only in the Pages Functions, and the admin is static files plus `/api`.                                                        |
| Language           | TypeScript                                                                                               | Data model has enough nested structure (kit/params, entries) that type safety catches shape mistakes before they become bad commits.                               |
| Styling            | Tailwind CSS v4 + MUI v9 (emotion); `app/components/ui/*` are small wrappers over MUI                     | Fast to build data-heavy CRUD UIs (tables, dialogs, forms) without writing custom CSS.                                                                              |
| Forms              | `react-hook-form` + Zod (`zodResolver`, `onChange` validation) where an editor needs it                   | Zod schemas double as form validation and data contract validation.                                                                                                 |
| UI State Management| Custom `EmptyState` and `LoadErrorState` components                                                      | Standardizes the presentation of 404/not-found and backend error states across all modules.                                                                         |
| GitHub integration | Pages Functions only: `@octokit/rest`, plain `fetch` to REST, and GraphQL (`app/lib/github-graphql.ts`)  | Never reference the token in browser code. The cron Worker uses `fetch` only (`app/lib/importer/repo.ts`).                                                          |
| Auth               | One admin passphrase (a PBKDF2 verifier) and an HMAC-signed session cookie, with a session version in KV | Single-admin tool - a hashed password in an env var is enough; GitHub OAuth is the upgrade path if you add collaborators later (see §9).                            |
| Deployment         | Cloudflare Pages (static `build/client` + Functions), a separate cron Worker                              | Same platform as the mobile API - one dashboard, and KV for sessions and cache versions.                                                                            |
| Diffing            | Hand-rolled recursive diff (`app/lib/diff.ts`)                                                           | Powers the "review before commit" screen (§7.3). It compares values; arrays are compared whole.                                                                     |

---

## 4. Environment variables (server-only, never exposed to client)

Pages Functions (`wrangler.toml` lists them; values are set in Cloudflare):

| Var                                              | Purpose                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`                                   | Fine-grained PAT, scoped to **only** the data repo, `contents: read & write` permission. Nothing broader.            |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` | The data repo. `GITHUB_BRANCH` defaults to `main`.                                                                   |
| `ADMIN_PASSWORD_HASH`                            | The sign-in's verifier, `pbkdf2-sha256:<iterations>:<salt>:<hash>`, from `npm run admin-password` (§6.1). A bcrypt hash isn't accepted: sign-in answers 500, and the log says to run `npm run admin-password`. |
| `SESSION_SECRET`                                 | Session token signing secret.                                                                                        |
| `COOKIE_SECURE`                                  | `"false"` drops the cookie's `Secure` flag (local dev over http); anything else keeps it.                           |
| `GITHUB_WEBHOOK_SECRET`                          | Verifies the data repo's push webhook (`functions/api/webhooks/github.ts`). Without it the webhook answers 503.      |
| `FCM_SERVICE_ACCOUNT` (optional)                 | A Firebase service account's JSON key. Without it, publishing never notifies players (§7.10).                        |
| `RATE_LIMIT_KV` (KV binding)                     | Session versions, mobile cache versions, and the hourly push count. Login fails with 503 without it.                |

Cron Worker (`workers/cron/wrangler.toml`): `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`,
`GITHUB_BRANCH`, and `CRON_SECRET`, which gates its `POST /trigger` (Bearer token). The
admin's "Run now" doesn't use it: it goes through the session-authed
`POST /api/imports/run`.

---

## 5. Route map (`app/routes.ts`)

```
app/routes/
  home.tsx                           /           - redirects to /dashboard
  login.tsx                          /login      - password gate

  _admin.tsx                         layout: session check + sidebar shell
  _admin.dashboard.tsx               /dashboard  - games and record counts
  _admin.activity.tsx                /activity   - recent commits
  _admin.games.tsx                   /games      - list, create and edit games (in-page form)
  _admin.categories.tsx              /categories - data/_meta/categories.json

  _admin.$game.tsx                   /:game/*    - every game page, picked from the URL:
    heroes | maps | modes            built-in editors (list, new, edit, :id/delete)
    <folder> of a configured category  RecordList / RecordEditor (patches, items, news…)
    schemas                          DynamicSchemasList / New / Edit
    enums                            EnumsList / New / Edit
    screens                          ScreensList (and navigation) / ScreenEdit
    cron                             CronJobsList / New / Edit, :id/review/:draft
    raw/:type/:id                    RawEdit
```

`_admin.$game.tsx` loads each view's code when it's first opened (`React.lazy`), so a
game page loads its view's chunk (a list about 15 kB, an editor 130 to 190 kB) instead of
all of them (one 400 kB chunk before). Until the code is in, a view shows its own loading
placeholder (`app/components/views/ViewSkeletons.tsx`, the one it shows while its data
loads). A chunk missing after a deploy reloads the page once (`app/lib/chunk-reload.ts`).
Tests: `tests/lazy-views.test.ts`.

`_admin.tsx` has no loader: it calls `checkSession()` (`GET /api/auth/check`) and lists
the games for the sidebar (`app/components/SidebarNav.tsx`): Dashboard, Activity, Games,
Categories, then for each game players see (anything but `active: false`,
`app/lib/games.ts`) its configured categories, Schemas, App Screens, Enums and Cron Jobs.
Its Logout button signs out (`POST /api/auth/logout`); no page does, so no link can.

The API (`functions/api/[[path]].ts`, one `onRequest` with a route table):

```
auth/login (POST) · auth/logout (POST) · auth/check (GET)
data/file (GET, POST, DELETE) · data/directory (GET) · data/folders (GET, up to 4 subpaths)
data/games · data/dashboard · data/commits (GET)
data/picture (POST) · data/save-record (POST)
data/record-assets (GET) · data/delete-record (POST) · data/prune-assets (POST)
imports/preview · imports/run · imports/publish · imports/dismiss (POST)
push/status · github/status (GET) · {game}/enums/{id} (GET)
assets/* (GET, no session: pictures for the admin and the app)
anything else: JSON 404
```

`functions/api/webhooks/github.ts` handles the data repo's push webhook (§7.7).

---

## 6. Pages - purpose, data, actions

### 6.1 `/login`

- **UI:** single password field. No "forgot password" flow needed for v1 - it's you.
- **Flow:** `POST /api/auth/login` checks the password against `ADMIN_PASSWORD_HASH` and
  sets the `__admin_session` cookie (HttpOnly, SameSite=Lax, 8 hours, Secure unless
  `COOKIE_SECURE` is `"false"`). The page sets a `has_session` flag in localStorage and
  goes to `/dashboard`; it also redirects there if you're already signed in.
- **The check** (`app/lib/password.ts`): PBKDF2-SHA256 through Web Crypto, 20,000
  iterations by default (10,000 to 100,000 accepted; 100,000 is Cloudflare's production
  cap), a 16-byte salt, compared in constant time. Web Crypto's CPU counts toward the
  10 ms a request gets: 20,000 iterations took about 1 ms in local workerd, where bcrypt
  at cost 10 took about 50 ms. The passphrase is long and random, which is what keeps it
  safe from offline guessing. A value it can't check, a bcrypt hash included, answers 500
  and isn't counted as a failed attempt. `npm run admin-password` (`tools/admin-password.ts`) makes the
  verifier on your own computer: it asks for the passphrase twice without showing it
  (or `-- --generate` makes a 24-character one and shows it once), and prints only the
  verifier. Set it as the secret `ADMIN_PASSWORD_HASH` (Production and Preview), then
  redeploy: Pages applies secrets to deployments made after them.
- **Limits:** 5 failed attempts per IP per 15 minutes, counted in the data center's
  cache, then exponential backoff and 429 with `retryAfter` (`app/lib/login-attempts.ts`).
- **Session end:** a 401 from any API call fires `AUTH_EXPIRED`, which opens
  `ReauthModal` (sign in again in place) while `has_session` is set, else goes to
  `/login`. Signing out with a valid session replaces the KV session version, which ends
  every session at once (`app/lib/session.ts`). This browser is always signed out; when
  KV can't end the others, the answer is 200 with a `warning` the sidebar shows.
- **Other origins:** a POST, PUT, PATCH or DELETE whose `Sec-Fetch-Site` isn't
  `same-origin` (or, without it, whose `Origin` isn't the admin's) gets a 403.

### 6.2 `/dashboard`

- **Data:** `GET /api/data/dashboard` - every game, with its record count per configured
  category from one recursive git tree read; `GET /api/github/status`.
- **UI:** one card per game - name, Active/Inactive badge, record counts, a Schemas link -
  and a line saying whether GitHub reads go through GraphQL or REST only (§7.1).

### 6.3 `/games` (list, create, edit)

- **Data:** `data/_meta/games.json`.
- **Form:** validated against `GameSchema` (`app/schemas/game.ts`): a developer (text, may
  be empty), all 14 dark colors as hex (the app leaves out a game without them), an
  optional `light` palette (contrast warnings from `app/lib/game-palette.ts` and
  `contrast.ts`), `active`, and an icon the app loads (an upload, or a URL on its
  picture hosts). Keys the form doesn't know are kept (`keepUnknownKeys`). The write API
  and the data validator check games.json the same way (`gamesFileProblems`,
  `app/lib/screen-policy.ts`).
- **Logic note:** this rewrites a _list_ file rather than a one-record file - the page
  reads the current file, changes the array, and writes the whole file back.
  `categories.json` (§6.10) and `data/<game>/navigation.json` (§6.14) are written the
  same way. The form checks everything (the schema, a taken slug) before it uploads an
  icon, so a refused save leaves no picture behind.
- **Slugs don't change.** A slug names the game's data (`data/<slug>/`), which nothing
  moves, so the form shows it read-only once the game exists. The API refuses a
  games.json write that drops or renames a game whose `data/<slug>/` exists (one read:
  games.json and the `data/` listing in one GraphQL request, or two through REST;
  `app/lib/games-guard.ts`), and refuses deleting games.json at all. A game listed before
  it has any data has no folder yet, and can be removed.

### 6.4 `/:game/schemas` (list/new/edit/delete)

- **Data:** `data/<game>/schemas/*.json`, one schema per file:
  `{ id, name, category, fields[] }` (`app/schemas/dynamic-schema.ts`). Field types:
  `string`, `number`, `boolean`, `list`, `enum`, `abilities`, `weapon`, `object_array`,
  `reference`, `reference_list`; fields can carry `unit`, `hasCustomSuffix`, `required`,
  `options`, `subFields`, `globalEnumId` and the `reference*` keys.
- A category can have several schemas; a record picks one with `schema_id`
  (`app/lib/record-schema.ts`), else it uses the category's first.
- **Save:** commits directly (no diff step). The server re-checks schema files on write.
- **Why this page matters most:** every record form of a category is _generated from_ its
  schema (§7.2). Fill it out first for a brand-new game.

### 6.5 `/:game/heroes` (index)

- **Data:** the heroes folder with content (`listDirectory(…, includeContent)`), and the
  schemas and enums in one `GET /api/data/folders`.
- **UI:** a table whose columns come from the hero schema's fields, enum values shown by
  name. Row click → edit page. "New Hero" button top-right.

### 6.6 `/:game/heroes/new` and `/:game/heroes/:id` (create/edit)

- **Data (edit):** the hero file + its `sha` (GitHub's Contents API requires the current
  blob `sha` to update or delete a file, to prevent silently overwriting a concurrent
  edit), and the game's schemas.
- **Form:** generated from the hero schema's fields (`DynamicFieldsRenderer`,
  `AbilitiesField`), checked in the browser with `heroRecordSchema`.
- **Edit:** review step (§7.3). The preview keeps the validated hero in a hidden
  `_heroJson` field, re-parsed before the write.
- **Create:** a single submit (no review step) with a duplicate-id check.
- Pictures (portraits, ability icons) go under the record's own asset folder
  (§7.5); after a save, pictures it no longer uses are pruned.
- Hero abilities may carry `mode_overrides`; the editors check each key against
  `data/<game>/modes/`.

### 6.7 `/:game/<folder>/:id/delete`

- Its own page (`EntityDelete`), for records, schemas, enums and cron jobs. It reads every configured category
  folder, plus `cron_jobs` and `schemas`, for anything that holds the id, and **blocks**
  the delete while something references the record. Only folders that couldn't be read
  can be overridden with a checkbox.
- The record's own pictures are removed in the same commit
  (`POST /api/data/delete-record`), except any another record still points at
  (`app/lib/record-assets.ts`).

### 6.8 `/:game/maps` and `/:game/modes` (list/new/edit/delete)

- Same CRUD pattern as heroes, with forms from the map and mode schemas
  (`mapRecordSchema` / `modeRecordSchema`). These editors are strict: a record with keys
  the schema doesn't list shows `UnknownKeysNotice`, linking to the raw editor.

### 6.9 `/:game/<folder>` - any other configured category (patches, items, news…)

- `RecordList` and `RecordEditor`, driven by the category's schema
  (`recordFormSchema`); lists are sorted newest first by the schema's date field. Like
  maps and modes, the editor won't save a record with keys its schema doesn't list
  (`UnknownKeysNotice`).
- Creating a record can notify players (§7.10).

### 6.10 `/categories`

- Edits `data/_meta/categories.json` (`app/lib/categories.ts`): which folders hold
  records, their labels, icons, whether players can favorite them, and the push text
  template. Defaults: heroes, maps, modes, items, patches, news. Heroes, maps and modes
  can't move folders (their editors are built in), and `RESERVED_FOLDERS` can't be used.

### 6.11 `/:game/raw/:type/:id` - raw JSON escape hatch

- For the case the structured form can't express something yet. Checked with
  `recordSchemaFor(folder, schemas)` before the review step (§7.3) - an alternate _input
  method_, not a bypass of validation. Only category folders; not schemas, enums or
  screens. Linked from `UnknownKeysNotice` (map, mode and record editors).

### 6.12 `/activity`

- **Data:** `GET /api/data/commits` - the repo's last 20 commits
  (`/repos/:owner/:repo/commits?per_page=20`, the default branch).
- **UI:** commit message, timestamp, link to the commit on GitHub. Since there's no
  separate database, git history _is_ the changelog - imports and hand edits included.

### 6.13 `/:game/cron` (list/new/edit/delete, draft review)

- **Job** (`data/<game>/cron_jobs/<id>.json`, `app/schemas/cron.ts`): `api_endpoint`,
  `source_format` (`json`, or `html` read with CSS selectors), `items_path`, `id_from`,
  `max_items` (at most 50 new drafts a run), `schedule` (hourly, daily, weekly, manual),
  `active`, and `field_mappings` (a path or selector, a `=constant`, `| transforms`, or
  `{ each, fields }` for object arrays). Ids are kebab-case, never `_`.
- **Runs don't write records.** They add drafts under
  `data/<game>/imports/<job>/<id>.json` for ids not yet published, drafted or dismissed,
  and the job's state under `data/<game>/syncs/<job>.json` (`app/lib/importer/run.ts`).
  A reviewer opens a draft at `/:game/cron/:id/review/:draft` (`ImportDraftReview`) and
  publishes or dismisses it. The admin uses `POST /api/imports/{preview,run,publish,dismiss}`.
- **Writers at the same time.** The cron Worker, "Run now", publish and dismiss each read
  a job's files, then commit, and a run fetches its source in between. Their writes are
  edits (`app/lib/importer/repo.ts`): the changes are worked out from the files as they
  are on the head the commit goes on (one GraphQL request for the head's tree and files),
  and when GitHub refuses the ref update because the branch moved, worked out again on
  the new head: 3 tries in the Function, 2 in the cron Worker, then a 409. So a dismissal
  made during a run stays, and its id isn't drafted; a run's results survive a dismissal;
  publishing never writes over a record saved meanwhile.
- **The cron Worker** (`workers/cron`) runs the schedules (`0 * * * *`, `0 0 * * *`,
  `0 0 * * SUN`) and `POST /trigger?game=&job=` (which ignores `active`). It shares
  `app/lib/importer/*` with the Function.
- **Run budget:** 50 subrequests per invocation on Workers Free, 10 kept for the commit
  (2 tries of 5), 10 per job through REST (3 for its source, 5 reads, and its state read
  again at each of the commit's tries). Active games' jobs go first, and the order rotates
  between runs. Reads go through GraphQL when the token allows (`runRepo`), and the jobs'
  writes go out in one commit.
- **Run log:** what a run had no room for goes to `data/<game>/syncs/_run-<kind>.json`
  (`{ run, at, deferred[], unchecked[] }`, `app/lib/importer/run-log.ts`), written in the
  run's commit, only when there is something to say. The next run of that kind takes
  those jobs first. The job list and editor show "Deferred…" / "Not checked…" from it.
- **Security:** the form's checks are UX only; the fetch enforces HTTPS, public
  addresses only (checked through DNS over HTTPS), no redirects, a 10 s timeout and a
  5 MB cap (`app/lib/importer/fetch-source.ts`). Values are coerced to the schema's
  types (`app/lib/importer/map.ts`).

### 6.14 `/:game/screens` (App Screens) and navigation

- `data/<game>/screens/*.json` and `data/<game>/navigation.json` (the app's tab bar),
  edited in `ScreensList` and `ScreenEdit`. Blocks come from the app's block manifest,
  `data/_meta/mobile_primitives.json` (generated in zms with `npm run primitives`),
  whose `$policy` holds the app's limits and allowed link hosts
  (`app/lib/screen-policy.ts`).
- The editor previews each block as the app shows it (`BlockPreview.tsx`): bound values,
  enum names, references by their record's label, and lists of entries in a
  `field_section` as entries. It warns about what the app would cut, skip or show
  badly (`validateScreen`, `app/lib/screen-model.ts`), and the server re-checks screens
  and navigation on write.
- `field_section`'s `linkReferences` (a boolean prop, default off): a reference opens its
  record when the record has an id and exactly one detail screen shows its category
  (`detailScreenFor`, `app/lib/reference-labels.ts`); the preview draws those as links.
  A second detail screen of a category is a warning: notifications and reference links
  then open neither.
- **The contract with the app** (`app/lib/contract.ts`, the same values as zms
  `src/content/policy.ts`; `tests/fixtures/contract-cases.json` is run by both): ids,
  slugs, colors (#RGB or #RRGGBB), picture hosts and variants, reserved folders, the push
  topic. The editor and the write API refuse a literal picture the app won't load, a
  color that isn't hex, and a source whose category isn't in categories.json; "data."
  on home, list and page screens reads only `data.game` and the category folders (a
  record's fields are "item." in a list block); an action may open a detail screen only
  from a list of that screen's category's records (`detailActionProblem`). The preview
  shows the variant the app picks and marks pictures it won't load.

### 6.15 `/:game/enums` (list/new/edit/delete)

- `data/<game>/enums/*.json`: options with names, icons, descriptions and params. Edits
  go through the review step (§7.3); option icons live under the enum's own asset folder.

---

## 7. Core logic

### 7.1 Reading from GitHub

The Function reads the data repo two ways (`app/lib/github-graphql.ts`,
`app/lib/mobile-payload.ts`):

- **GraphQL** - one request for a whole folder, or several, with every file's text:
  `data/directory?includeContent=true`, `data/folders`, the schema read when
  `categories.json` is saved, `/mobile/init` and `/mobile/data`, the cron Worker's reads,
  and the prune-assets scan. After the first failure a reader falls back to REST.
  Files GraphQL can't give whole (cut short, binary) are read through REST.
- **REST** - single files with their `sha` (Contents API, `handleGetFile`), listings
  without content, games, enums, the dashboard's git tree, commits, the Git Data API
  commits of deletes and prunes (`app/lib/importer/repo.ts`), and asset bytes from
  `raw.githubusercontent.com`. The repo tree (the dashboard's, and the pictures' hashes
  for `/mobile/*`) is read with fetch and a plain parse (`app/lib/github-tree.ts`):
  Octokit's parse revives every value and cost 3 ms of the 10 for 80 heroes' pictures.

`GET /api/github/status` says whether the token can use GraphQL; the dashboard shows it.
Through REST alone, each file is a request, and folders of more than about 45 records
may come back incomplete; responses say how many were left out in `X-Incomplete`.

### 7.2 Schema-driven forms

Record forms don't have hardcoded field lists. They render the fields (and an
`object_array`'s `subFields`) of the record's schema. Keys a form doesn't know are kept
on save where it uses `keepUnknownKeys` (`app/lib/unknown-keys.ts`: heroes, maps, enums,
schemas, cron jobs, games). The strict editors (maps, modes, and the other categories'
records) also refuse a record with keys its schema doesn't list, since saving through
the form would drop them, and point to the raw editor (`UnknownKeysNotice`).

This is the same principle as the public app's rendering (`DATA_STRUCTURE.md` §3.3),
reused here so the form and the eventual public display never drift apart.

### 7.3 Review-before-commit step (select entities)

The diff review (validate → preview diff → confirm commit) exists for **hero edits**,
**enum edits** and the **raw JSON editor** (`computeDiff` in `HeroEdit`, `EnumEdit`,
`RawEdit`). It runs in the browser, against the copy loaded when the page opened.

**Everything else** - schemas, maps, modes, other categories' records, games,
categories, cron jobs, screens and navigation - commits directly on submit.

Where implemented, the flow is:

1. The form validates with Zod and computes a diff against the loaded file.
2. The page shows it (added/changed/removed fields, red/green) without writing anything.
3. Confirming writes the file with the `sha` it was loaded with.
4. If that `sha` no longer matches GitHub's (something changed the file meanwhile), the
   write is rejected and you're told to refresh and re-apply the edit.
5. **Creation concurrency:** a create sends no `sha`; if the file already exists, GitHub
   answers 409 or 422, which the Function maps to `409 { conflict: true }` and
   `app/lib/github.ts` turns into a `ConflictError`. Deletes map the same way, and a
   file already gone is a conflict too. Saves with pictures (§7.5) check the record's
   `sha`, or that a new one doesn't exist, themselves.

### 7.4 Environment variable handling

The Functions read `context.env` directly; there is no env abstraction layer.
The session cookie's `Secure` flag depends only on `COOKIE_SECURE` (§4). `wrangler.toml`
lists the secrets in a comment and binds `RATE_LIMIT_KV`; Pages variables are set in the
Cloudflare dashboard.

### 7.5 Image handling and asset cleanup

- A record's pictures live in its own folder,
  `public/assets/<game>/<folder>/<id>/` (portrait, ability icons, an enum's option
  icons), and records point at them as `/api/assets/…`. The diff view lists a save's
  uploads.
- **A save with pictures is one commit** (`saveRecord`, `app/lib/github.ts`). The hero,
  mode and enum editors, new and edit, send each new or replaced picture on its own to
  `POST /api/data/picture` (3 at a time). That keeps it as a git blob, which commits
  nothing and moves no branch, so uploads can't conflict, and returns
  `{path, sha, token}`. The token is an HMAC of the path and blob sha with the session
  secret (`pictureToken`, `app/lib/session.ts`; its message can't be a session's). Then
  `POST /api/data/save-record` takes `{game, folder, id, sha, content?, message, notify?,
  pictures: [{path, sha, token}]}` (0-50 pictures, all in the record's own folder; no
  `content` saves the pictures alone) and commits the record and the blobs together on
  the head it checked, where the record must still be at `sha` (null: a new record whose
  file mustn't exist). A record's `id` must be its file's name. Folders whose files
  need checks that read other files (schemas, screens, navigation) are refused. A
  branch that moved before the ref update is checked and committed on once more; a
  second move, a changed or deleted record, or a taken id is a 409 conflict. After the
  commit: one KV bump per mobile version (not per picture), the cached copies of at
  most 12 pictures (replaced ones first; the rest expire within 5 minutes), and a new
  record's push. A save makes at most 47 of the 50 subrequests (`handleSaveRecord`), an
  upload 2. The games page's icon still goes through `POST data/file` (one picture,
  then `games.json`). Tests: `tests/record-save.test.ts`.
- **Picture rules** (`app/lib/picture-rules.ts`): PNG, JPEG or WebP (by their first
  bytes; nothing in the data repo is a GIF, and an SVG can carry script), at most 2 MiB,
  named after their type (`.png`, `.jpg`/`.jpeg`, `.webp`). The server checks them from
  the base64 as sent, without decoding the file: the size from its length, the type from
  its first 16 characters (413, or 415). The same rules apply to pictures sent to
  `data/file`, and the upload fields refuse such files as soon as they're picked. A new
  picture's file extension comes from its type, not its file name. Bodies are read only
  up to a limit (a picture's, 1 MiB for a save, 3 MiB for `data/file`), so a larger one
  is refused (413) before it is parsed.
- **Enum option icons** are picked per option and kept by the form's key for the option
  (useFieldArray's field id, `app/lib/enum-icons.ts`), which follows it when options are
  added above it or removed.
- `GET /api/assets/*` needs no session: it proxies `raw.githubusercontent.com` with the
  type from the file name and a sandboxing CSP (`app/lib/asset-headers.ts`). Mobile
  payloads add `?v=<blob sha>`, so those URLs are immutable.
- **Prune after save** (its own commit, only when a save stopped using a picture): the
  hero, mode (same id only) and enum editors call
  `pruneReplacedAssets` after a successful save. It sends the files of the record's own
  folder the save stopped pointing at (`droppedAssets`, 1-50 paths) to
  `POST /api/data/prune-assets`, which takes a snapshot of the game's data, `_meta` and
  the folder, reads every JSON file of the game and of `_meta` at that commit (GraphQL;
  without it, everything is kept), deletes the files nothing references in one commit
  pinned on that head (a 422 means the branch moved: keep everything), and bumps the
  mobile cache once. It never fails the save; its result goes into the save's toast.
  Tests: `tests/prune-assets.test.ts`.

### 7.6 Platform limits (Workers Free)

- **Subrequests:** 50 per invocation, Functions and the cron Worker alike. That is why
  folders are read through GraphQL (§7.1), `data/folders` reads up to 4 folders at once,
  and the cron run budgets its requests (§6.13). `includeContent=true` and `keysOnly` let
  a page get a folder's records, or just some keys, in one call; `shape=summary` gives
  each record as a list shows it (`listSummary` in `app/lib/record-columns.ts`: its
  scalars, lists of scalars and picture variants). The heroes, maps, modes and other
  categories' lists ask for summaries, and the screen editor for every category but the
  screen's own: 80 filled heroes are 158 KB that way instead of 1.7 MB.
- **CPU:** 10 ms per invocation. A cold `/mobile/data` build reads its folder in one
  GraphQL answer and every record must be parsed, so its cost grows with the records:
  80 filled-in heroes take about 9 ms in local workerd (14 ms in a fresh isolate).
  `tests/mobile-cpu.test.ts` holds a cold build to twice the parsing it can't skip.
- **Requests a day:** only `/api/*` and `/mobile/*` run a Function (§2).
- **KV:** sessions and cache versions use KV; failed logins don't (§6.1), and mobile
  requests read cache versions through a 60 s memo in each data center
  (`app/lib/mobile-cache-version.ts`).

### 7.7 Mobile cache invalidation

The Workers Cache API keeps an entry only where it was stored, so a save can't delete
other data centers' copies. Mobile cache keys carry a version from KV instead
(`cache_version:mobile_init`, `cache_version:mobile_assets`, and one per game and
folder for `/mobile/data`). Every admin write or delete calls `triggerCachePurge`, which
bumps the version for the path (`mobileVersionKeyForPath`); data centers reread a
version at most once a minute. The data repo's push webhook (`/api/webhooks/github`)
bumps the versions of the pushed paths too (all of them when a push lists no files), so
commits made outside the admin also reach the app. It checks `X-Hub-Signature-256`,
answers `ping`, and only acts on pushes to the configured repo and branch.

The pictures' hashes a build reads from the repo tree are kept in the data center's
cache under the assets version, for an hour at most (`assetHashes` in
`app/lib/mobile-payload.ts`): `/mobile/init` and every folder's cold builds share them
until a picture's save moves that version. A tree that couldn't be read or that GitHub
cut short is never kept, and nothing is kept or used while KV can't say the version.

### 7.8 Content Security Policy

`public/_headers` gives every static response a CSP with no `unsafe-inline` or
`unsafe-eval` for scripts (`style-src 'unsafe-inline'` for MUI/emotion,
`img-src 'self' data: https:`, `connect-src 'self'`, `frame-ancestors 'none'`), plus
X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy. React Router's inline
scripts in `index.html` are allowed by hash: `buildEnd` in `react-router.config.ts`
writes their sha256 hashes in place of `__INLINE_SCRIPT_HASHES__`
(`app/lib/csp-hashes.ts`) and fails the build if it can't. `app/entry.client.tsx` sets
`z.config({ jitless: true })` so Zod never tries `eval`. Function responses don't get
these headers.

### 7.9 Push notifications

Publishing a **new** record with "Notify players" (the new hero, map and mode pages, the
record editor, and import draft review) asks the Function to notify players. The text comes from the
category's `notify` template and the record as saved (`app/lib/notify-template.ts`);
pushes go to the `all_users` topic through FCM HTTP v1 (`app/lib/push.ts`), only for
games players see, at most 3 per game per hour (counted in KV), with a 5 s timeout. A
failed push never fails the save. `GET /api/push/status` says whether
`FCM_SERVICE_ACCOUNT` is set.

---

## 8. Validation layer (Zod schemas)

```
app/schemas/
  game.ts            # GameSchema (palette, light palette, active)
  dynamic-schema.ts  # schema files; record fields (typedNumber / fieldNumber / entrySchema)
  hero.ts            # heroes (KitItemSchema.params is z.record(z.string(), z.unknown()))
  map.ts             # maps
  mode.ts            # modes
  enum.ts            # enums
  cron.ts            # CronJobSchema (UX checks; the fetch is the security boundary)
```

Records are validated in the browser (`app/lib/record-schema.ts`: `recordSchemaFor`,
`heroRecordSchema`, `mapRecordSchema`, `modeRecordSchema`); numbers typed in forms are
coerced by Zod preprocessing in `dynamic-schema.ts`. The server re-checks the files the
app's structure depends on before writing them: screens, navigation, schemas and
`categories.json` (`dataWriteProblems` in `app/lib/screen-policy.ts`), also when sent as
base64.

---

## 9. Auth upgrade path (if this stops being single-admin)

v1's password-in-env-var is fine for one person. If you add collaborators later, swap
`/login` for GitHub OAuth (each admin authenticates with their own GitHub account,
scoped to repo collaborators only) - this also gives you free per-person attribution
in commit authorship instead of everything showing as one bot identity in `/activity`.
Sessions would no longer share one version: `revokeSessions` ends everyone's today.

---

## 10. Folder structure (admin app repo)

```
athena/
  app/
    routes.ts, routes/       # §5
    schemas/                 # §8, zod schemas
    RawEdit.tsx              # §6.11
    entry.client.tsx         # Zod jitless (§7.8)
    lib/
      github.ts              # browser wrapper for /api (api(), ConflictError, prune)
      github-graphql.ts      # GraphQL folder reads (§7.1)
      mobile-payload.ts      # /mobile payloads and the RepoReader they use
      mobile-cache-version.ts# cache versions (§7.7)
      session.ts, login-attempts.ts, auth.ts, password.ts
      importer/              # fetch-source, map, run, repo, run-log (shared with workers/cron)
      screen-model.ts, screen-policy.ts, reference-labels.ts, enum-options.ts
      categories.ts, games.ts, games-guard.ts, record-schema.ts, record-assets.ts, push.ts
      diff.ts, safe-path.ts, csp-hashes.ts, asset-headers.ts
    components/
      views/                 # page views (HeroesList, RecordEditor, ScreenEdit, …)
      layout-editor/         # BlockPreview, PropControl (screen editor)
      ui/                    # wrappers over MUI
      ToastProvider.tsx, DiffView.tsx, DataTable.tsx, DataTableSkeleton.tsx, ReauthModal.tsx
  functions/
    api/[[path]].ts          # the admin API (§5)
    api/webhooks/github.ts   # push webhook (§7.7)
    mobile/init.ts, mobile/data.ts
  workers/cron/              # the cron Worker (own package.json and wrangler.toml)
  public/_headers, public/_routes.json
  tools/validate-data.ts     # the data repo's validator (§11)
  tools/admin-password.ts    # makes ADMIN_PASSWORD_HASH (npm run admin-password, §6.1)
  tests/                     # node --test suites (npm test)
  .github/workflows/ci.yml
  .node-version, wrangler.toml, .env.example, DESIGN.md
```

---

## 11. Deployment

### Local development

```bash
npm run dev          # Vite dev server (react-router dev); proxies /api to 127.0.0.1:8788
npm run wrangler     # wrangler pages dev on port 8788, for the Functions
```

### Cloudflare Pages (production)

Pages serves `build/client` (`pages_build_output_dir`) as static files and runs
`functions/` for `/api/*` and `/mobile/*` only (§2). There is no server build to
deploy.

```bash
npm run pages:dev    # build + wrangler pages dev (local CF preview)
npm run pages:deploy # build + wrangler pages deploy
```

The `nodejs_compat` flag is enabled (@octokit/rest). wrangler is an exact devDependency,
so these scripts run that version and never fetch the latest. The cron Worker deploys
on its own: `cd workers/cron && npm run deploy` (its wrangler is pinned in its
`package-lock.json`). wrangler 4 needs Node 22 or later: run both deploys with the Node
in `.node-version`.

### Build output

- `build/client/` - the SPA: `index.html` (SPA fallback), hashed assets, `_headers` with
  the CSP hashes filled in, `_routes.json`.

### CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`
(read-only token, actions pinned by SHA, Node from `.node-version`, which Cloudflare
Pages also builds with): `npm ci --ignore-scripts`, `npm test`, `npm run typecheck`,
`tsc -p functions`, `tsc -p workers/cron`, the cron Worker's own install and typecheck,
and `npm run build` with `DOTENV_CONFIG_PATH=/dev/null`. There is no deploy job.

### The data validator

`tools/validate-data.ts <data-repo>` checks a checkout of the data repo with the
admin's own rules: every `data/**/*.json` parses; screens, navigation, schemas,
`categories.json`, games.json and records (their id is their file's name) pass
`validateDataFile` under the manifest's policy; the manifest has the expected shape;
tabs and actions match the game's screens; every game folder (`data/<slug>/`, not
`_meta` or another `_` folder) is a game games.json lists; every picture a file names
exists under `public/assets`. Warnings, which don't fail it: references to records that
don't exist, enum values that aren't options, record pictures on hosts the app won't
load, a second detail screen of a category (the admin lets these happen; the app shows
them degraded). It imports no npm package and exits 0 (no errors), 1 (errors) or 2 (no
folder); in Actions, warnings are `::warning` annotations. The data repo's
`.github/workflows/validate-data.yml` checks out athena at `main` and runs it on every
change. Tests: `tests/validate-data.test.ts`.

The manifest's contract keys (`$policy.patterns`, `reservedFolders`,
`reservedCategories`, `imageVariants`, `assetVersionLength`, `push`, `fixtures`) are
required and must equal `app/lib/contract.ts` (`manifestContractProblems`,
`app/lib/block-manifest.ts`); `fixtures` must hold the SHA-256 of athena's own
`tests/fixtures/` copy of each shared fixture (`SHARED_FIXTURES`), which the validator
hashes from its own checkout. athena's CI runs the same check on
`tests/fixtures/mobile_primitives.json`, a byte-for-byte copy of zms's
`src/components/schema-driven/primitives.json`. To change a shared fixture: (1) edit it
the same way in both repos (`tests/fixtures/` here, `__tests__/fixtures/` in zms);
(2) regenerate zms's manifest (`npm run primitives`); (3) copy that manifest, in one
step, to athena's `tests/fixtures/mobile_primitives.json` and to zero-backend's
`data/_meta/mobile_primitives.json`. Until all three land, the CIs that see a mismatch
fail, naming the fixture and the hash it expected.

### Known gaps

- `README.md` is still the React Router template.
- The `Dockerfile` runs `npm run start`, and `package.json` has no `start` script.
- `WORKER_PURGE_URL` / `WORKER_PURGE_SECRET` are declared in the Function's `Env` but
  nothing reads them, and no code reads `NODE_ENV` (only a `wrangler.toml` comment
  mentions it).
- `/activity` lists the repo's default branch, not `GITHUB_BRANCH`.

---

## 12. Explicitly deferred (not v1)

- Multi-admin roles/permissions.
- PR-based review workflow (commit to a branch + open a PR instead of committing
  straight to `main`) - worth adding if this ever becomes a multi-person tool, since
  GitHub's own PR review UI would then do the "review before it's live" job instead of
  this app's in-app diff step.
- Bulk import/export (e.g. CSV → many heroes at once).
- Localization/i18n of hero bios/descriptions.
- Item shop pools / rarity tiers - the item data model supports adding `rarity` and `pool` fields
  later, but the game client handles how/when items are offered mid-match; the repo only catalogs
  what each item does.
- `:game` validation against the actual `games.json` registry (currently only format-checked via
  `assertSafeGameSlug`). The game list `_admin.tsx` already loads could be shared with the
  child routes.
