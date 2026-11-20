# athena

The admin for a hero shooter companion app. It edits the app's data, JSON files kept in
a separate GitHub repository, and serves that data to the mobile app.

- **Admin**: a React Router single-page app (`ssr: false`) served as static files by
  Cloudflare Pages. Every save is a commit to the data repository.
- **API**: Pages Functions. `functions/api/[[path]].ts` is the admin's API and holds
  the GitHub token; `functions/mobile/*` serves the mobile app, cached per data center.
- **Cron Worker**: `workers/cron` runs import jobs on a schedule and leaves drafts for
  review in the admin.

The full description (pages, API, environment, limits) is in
[`.agents/context/ADMIN_APP_CONTEXT.md`](.agents/context/ADMIN_APP_CONTEXT.md); the data
model is in [`.agents/context/DATA_STRUCTURE.md`](.agents/context/DATA_STRUCTURE.md).

## Layout

```
app/          the admin: routes, views, and the shared libraries (app/lib) the Functions use too
functions/    Pages Functions: /api/* and /mobile/*
workers/cron/ the import Worker, with its own package.json and wrangler.toml
tools/        validate-data.ts (the data repository's validator), admin-password.ts
tests/        node --test suites
```

## Development

Use the Node version in `.node-version` (wrangler needs Node 22 or later).

```bash
npm ci
npm run dev        # the admin, with /api proxied to 127.0.0.1:8788
npm run wrangler   # the Functions on port 8788
```

The Functions read their settings from `wrangler.toml` and the environment; the list of
variables is in the context document (§4).

## Checks

```bash
npm test                                   # unit and API tests
npm run typecheck                          # the admin
npx --no-install tsc -p functions --noEmit # the Functions
npx --no-install tsc -p workers/cron --noEmit
npm run build
```

CI (`.github/workflows/ci.yml`) runs the same on every pull request.

## Deployment

```bash
npm run pages:deploy               # build, then deploy the admin and the Functions
cd workers/cron && npm run deploy  # the cron Worker, on its own
```

`npm run admin-password` makes the sign-in's verifier (`ADMIN_PASSWORD_HASH`) on your own
computer.
