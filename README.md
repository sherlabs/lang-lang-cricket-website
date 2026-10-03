# Lang Lang Cricket Club

The club's website and admin. It is a Next.js 16 (App Router) app with
[Payload CMS 3](https://payloadcms.com) mounted in the same app: the public
site lives in `app/(frontend)`, and the Payload admin and REST API live in
`app/(payload)` (`/admin` and `/api`). Content is stored in Postgres (the
`payload` schema), and uploads go to [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
in production and to local disk in development. Fixtures, results, ladders and
scorecards come live from the PlayHQ API (see [PlayHQ](#playhq)).

`DESIGN.md` documents the visual system. The migration from the old
Drizzle/Neon admin is specified in
`docs/superpowers/specs/2026-10-03-payload-cms-migration-design.md` (referred
to below as "the spec").

## Prerequisites

- Node.js **22.13 or later** (pnpm 11 requires it)
- pnpm 11 (`corepack enable`; the version is pinned in `package.json`)
- A local Postgres on `127.0.0.1:54329` (Docker or embedded), user and
  password `postgres`/`postgres`

## The `.env.local` rule

`.env.local` only ever holds **local** values. Never put a production
database URL or a `BLOB_READ_WRITE_TOKEN` in it, and never `vercel env pull`
into this checkout. Two guards enforce this:

- `assertSafeEnv()` (`payload/env.ts`, called by `payload.config.ts`) refuses
  a non-local `DATABASE_URI` and any Blob token off Vercel, so `next dev`,
  `next start`, `next build` and the Payload CLI cannot reach production by
  accident. An operator shell can override it with `ALLOW_REMOTE_DB=yes` /
  `ALLOW_REMOTE_BLOB=yes`, exported for that one shell only.
- Every `payload run` script imports `payload/scripts/_guard.ts`: it needs
  `--target <host>/<db>` equal to `DATABASE_URI`, `--confirm` for any write,
  and `ALLOW_REMOTE_DB=yes` for a remote host, and it pauses 5 s before
  writing (`GUARD_NO_DELAY=1` skips the pause on a local DB).

Without a Blob token, the storage plugin is disabled and uploads are written
to `./media`, `./documents`, `./gallery-photos` and `./event-photos`
(git-ignored). The public "submit a photo/story image" upload routes answer
503 locally.

## Local databases

All on `127.0.0.1:54329`:

| Database | Purpose |
|---|---|
| `langlang_dev` | Day-to-day development. It is **migrated** (Setup below), so `.env.local` has `PAYLOAD_PUSH=false`. |
| `langlang_mig` | Migration replay only. `pnpm check:migrations` drops and recreates it. Push and migrate are never mixed on one DB. |
| `langlang_test` | Integration tests (`pnpm test:int`). The harness refuses any URL that is not a local `*_test` database. |
| `langlang_legacy` | A restored `pg_dump --schema=public` of the old app, the ETL source for a rehearsal. Without a dump, `pnpm fixture:legacy` loads a deterministic fixture into it. |

## Setup

```bash
pnpm install
cp .env.example .env.local      # then fill in PAYLOAD_SECRET, CRON_SECRET, PLAYHQ_CLIENT_ID
# create the databases above (CREATE DATABASE langlang_dev; …)
```

Push and migrate are never mixed on one database. Both ways of filling
`langlang_dev` below migrate it, so keep `PAYLOAD_PUSH=false` in `.env.local`
(the `.env.example` default): a Payload boot with push on (`pnpm dev`, any script) writes a
dev-mode marker into `payload_migrations`, after which `payload migrate`
prompts and hangs in a non-interactive shell. Schema changes go through
`pnpm payload migrate:create <name>` and `pnpm payload migrate`.
`PAYLOAD_PUSH=true` is only for a scratch database that is never migrated.

Then pick one way to fill `langlang_dev`:

- **Demo content (no legacy DB).** A fresh club or a new developer:

  ```bash
  pnpm payload migrate
  INITIAL_ADMIN_EMAIL=you@example.com INITIAL_ADMIN_PASSWORD='…' \
    pnpm seed:admin --target 127.0.0.1/langlang_dev --confirm
  pnpm seed:demo --target 127.0.0.1/langlang_dev --confirm
  ```

  `seed:demo` seeds the `club` global and a small set of documents, gallery
  photos, sponsors, people, announcements, events, a story and players from
  the files in `public/assets` (local disk, never Blob). It only fills
  collections that are empty, so it is safe to re-run.

- **Legacy data.** Restore (or `pnpm fixture:legacy`) `langlang_legacy`, run
  `pnpm payload migrate`, then run the ETL (below) against `langlang_dev`.

Start the app with `pnpm dev` (with `PAYLOAD_PUSH=false`) and open
<http://localhost:3000> (admin at `/admin`). If `langlang_dev` was ever booted
with push on and `payload migrate` now hangs, reset the schema
(`pnpm reset:payload-schema --target 127.0.0.1/langlang_dev --confirm`) and
migrate again.

## Admin

The Payload admin is at `/admin` (REST API at `/api`; GraphQL is off).

- **Users.** Two roles: `admin` (everything, including users) and `editor`
  (all content; can only read and update their own user record). The first
  admin always comes from `seed:admin`; first-register is closed
  (`/admin/create-first-user` renders but refuses to create a user). Admins
  create everyone else under Users.
- **Passwords.** There is no email adapter, so forgot-password is disabled.
  An admin sets a new password for the user instead. Repeated failed logins
  lock the account; an admin can unlock it.
- **Moderation.** Pending event photos and stories show on the dashboard and
  as a banner on their lists. Approve or reject photos from the event's edit
  view; stories have Approve/Reject/Unpublish/Restore controls.
- **PlayHQ.** "Run sync now" on the players list, and **Refresh PlayHQ
  data** on the dashboard (see [PlayHQ](#playhq)).
- **Uploads.** Images and PDFs upload from the browser straight to Blob in
  production (15 MB images, 25 MB PDFs). Replacing the file of a row imported from the old
  app is refused until decommission; upload a new image instead.

## Environment

See `.env.example` for the full list with comments. In short:

| Variable | Where |
|---|---|
| `DATABASE_URI` | Everywhere. Local DB in `.env.local`. On Vercel, the pooled Neon URL, Production only (Preview gets a Neon *branch*). |
| `DATABASE_URI_UNPOOLED` | Vercel only: the direct URL `payload migrate` uses during the build. |
| `DATABASE_POOL_MAX` | Optional pool size (default 5). |
| `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL` | Everywhere (previews derive the server URL from `VERCEL_BRANCH_URL`). |
| `PAYLOAD_PUSH` | Local only: `false` for a migrated DB (the default), `true` only for a scratch DB. Refused for non-local hosts. |
| `BLOB_READ_WRITE_TOKEN` | Vercel only (Production store; Preview has its own store). Never local. |
| `BLOB_DELETE_DISABLED` | Preview: `1` (required by the preview build). Every plugin blob delete becomes a logged no-op. |
| `LEGACY_BLOBS_RELEASED` | Unset until the decommission PR sets it to `yes` (blob deletes for imported rows resume). |
| `CRON_SECRET`, `PLAYHQ_ORG_ID`, `PLAYHQ_CLIENT_ID`, `PLAYHQ_TENANT` | App + cron. |
| `CANONICAL_HOST`, `REDIRECT_HOSTS` | Host redirects and canonical URLs. |
| `PROD_DATABASE_HOST` | Vercel, all environments: the preview build refuses to run against this host, and every build refuses when it is empty. |
| `ENABLE_EXPERIMENTAL_COREPACK` | Vercel: `1`, so the build uses the pnpm pinned in `package.json`. |
| `ALLOW_REMOTE_DB`, `ALLOW_REMOTE_BLOB` | Operator shell only (cutover): `yes` lets the guards accept a remote DB / a Blob token. Never in a file. |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | `seed:admin` only, in the shell. |
| `LEGACY_DATABASE_URL`, `PAYLOAD_ETL` | ETL only (operator shell, or `.env.local` pointing at `langlang_legacy`). Never on Vercel. |
| `GUARD_NO_DELAY` | Local only: `1` skips the scripts' 5 s pause before writing to a local DB. |
| `DATABASE_URI_TEST`, `PAYLOAD_BLOB_FAKE` | Integration tests (`PAYLOAD_BLOB_FAKE=1` enables the storage plugin with a fake token and a mocked `@vercel/blob`). |

## Migrations

- After a schema change (collection/global config), run
  `pnpm payload migrate:create <name>`. It diffs against the last migration
  snapshot, not against the DB. Commit both the `.ts` and `.json` files in
  `payload/migrations`.
- `pnpm check:migrations` replays every committed migration on a fresh
  `langlang_mig` (the URL is hard-coded) and fails if any did not run.
- `pnpm generate` regenerates `payload-types.ts` and the admin import map,
  and `pnpm check:generated` fails when either is stale. Both files are
  committed.
- On Vercel, `pnpm vercel-build` (`scripts/vercel-build.mjs`) runs
  `payload migrate` over `DATABASE_URI_UNPOOLED` and then `next build`. It
  refuses a preview whose database host is the production one.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js. |
| `pnpm lint`, `pnpm tsc --noEmit` | Static checks. |
| `pnpm test` | Unit tests (no database). |
| `pnpm test:int` | Integration tests against `langlang_test` (drops and migrates its `payload` schema first). |
| `pnpm generate`, `pnpm check:generated` | Payload types and import map. |
| `pnpm check:migrations` | Replays the migrations on `langlang_mig`. |
| `pnpm seed:admin --target … --confirm` | First admin from `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`. |
| `pnpm seed:club --target … --confirm` | Seeds the `club` global from `payload/seed/club-defaults.ts`. |
| `pnpm seed:demo --target … --confirm` | Demo content from `public/assets` (above). |
| `pnpm etl --target … [--dry-run \| --confirm] …` | Legacy → Payload ETL (below). |
| `pnpm verify:cutover --target … [--blob-store-id … [--preview-rehearsal]]` | Read-only legacy vs Payload comparison (below). |
| `pnpm export:since --target … --since <ISO>` | CSV (`tmp/export-since.csv`) of every row created or updated since a time. Rollback aid. |
| `pnpm reset:payload-schema --target … --confirm` | `DROP SCHEMA payload CASCADE` and nothing else. |
| `pnpm payload run payload/scripts/add-gallery-photos.ts -- …` | Bulk-adds gallery photos from a folder. |
| `pnpm fixture:legacy` | Loads the deterministic legacy fixture into `LEGACY_DATABASE_URL` (local only). |

`payload run` forwards only arguments after `--`, which is why the
`package.json` entries end with `--`.

## Legacy ETL and cutover

`payload/scripts/etl-legacy.ts` copies the old app's `public.*` tables into
Payload (spec §12). It reads `LEGACY_DATABASE_URL` read-only: the URL must be
the unpooled host, every connection is `default_transaction_read_only`, every
read runs in `BEGIN READ ONLY`, and the script asserts
`SHOW transaction_read_only` before the first read. Legacy ids, slugs, tokens
and timestamps are kept. Blob files that already exist are *registered* in
place (no bytes move), `/assets/…` files are uploaded, and anything else is
flagged in the report.

```bash
pnpm etl --target 127.0.0.1/langlang_dev --dry-run --blob-store-id <store id> --report tmp/etl-dry.json
pnpm etl --target 127.0.0.1/langlang_dev --confirm --blob-store-id <store id> --report tmp/etl.json
pnpm verify:cutover --target 127.0.0.1/langlang_dev --blob-store-id <store id>
```

- Locally there is no Blob token, so pass the store id of the legacy Blob
  URLs (`<id>.public.blob.vercel-storage.com`; the fixture uses `fakestore`)
  so they are recognised as own-store. With a token, a `--blob-store-id`
  that differs from the token's store is refused unless
  `--preview-rehearsal` is also given: the preview rehearsal runs with the
  preview store's token and `--blob-store-id <production store>
  --preview-rehearsal`, so legacy blobs are registered in place and only new
  uploads go to the preview store. In production omit the flag. A fallback
  re-upload that Payload rejects is reported as `media-fallback-failed`
  (relation left empty, verify fails the row) instead of aborting the run.
- Re-running writes nothing (each step skips rows that exist). `--update`
  updates them in place instead. `--only events,event-rsvps` limits the
  steps, and `--update --reconcile-deletes` also deletes target rows that
  have gone from legacy (the fallback for a second cutover attempt; spec
  §13.4).
- Every real run ends with the same checks `verify:cutover` runs: ids and
  counts, preserved fields, that each document/gallery/event photo row's file
  is its legacy row's (a foreign or duplicate URL that left a row file-less
  fails), story text and images, the plugin URL of every registered upload
  versus its original URL, and sequences. With a token it also HEADs the
  plugin URL of a sample of 20 uploads. A failed check exits 1.
  `verify:cutover` needs the store id (token or `--blob-store-id`).
- `--update` keeps an existing upload row's file only when it is the legacy
  row's; otherwise (e.g. an id reused after a rollback) the row is deleted
  and re-imported, and reported. `--reconcile-deletes` runs before the import
  steps.

## Deploying and the cutover

- `vercel.json` sets the build command to `pnpm vercel-build`
  (`scripts/vercel-build.mjs`): production migrates over
  `DATABASE_URI_UNPOOLED` and builds; a preview refuses the production
  database host and a missing `BLOB_DELETE_DISABLED=1`, then migrates its
  Neon branch and builds; anything else only builds.
- Previews run behind Vercel Deployment Protection, against a manually
  created Neon branch and a separate preview Blob store. On a preview the
  `legacyUrl` read rule accepts the production store, so imported images
  render from their original URLs.
- **Until the cutover, `feat/payload-cms` is not merged to `main`.** A merge
  would build production, run `payload migrate` against the production
  database and take the apex domain with no ETL.
- The cutover is run by a human operator from a one-off shell, following
  **`docs/superpowers/plans/2026-10-03-payload-cutover-checklist.md`** (the
  operator copy of spec §13: Vercel and Neon setup, the preview rehearsal,
  the local rehearsal, the window steps, the smoke list, rollback and
  decommission). Agents prepare it; they never run it and never merge to
  `main`.

## PlayHQ

`/fixtures` (next round, latest results, team grid; `?team=` for one side's
ladder, games and players) and `/fixtures/[gameId]` scorecards read the
PlayHQ public API directly (`lib/playhq/`). Responses are cached in the
Next.js data cache under the `playhq` tag with the TTLs in
`lib/playhq/queries.ts`: seasons and team lists 6 h, fixtures 30 min, ladders
1 h, in-progress scorecards 15 min, completed scorecards 7 days. If PlayHQ is
unreachable, the pages show a "temporarily unavailable" panel.

Player profiles (`/players`) are synced into Payload nightly by the Vercel
cron (`/api/cron/players-sync`, 17:00 UTC, `CRON_SECRET`), or on demand from
the players list in the admin ("Run sync now"). The admin dashboard also has
a **Refresh PlayHQ data** action that invalidates the `playhq` cache tag.

## Template notes

The app is groundwork for other clubs (spec §16). Club-specific content is
confined to `payload/seed/club-defaults.ts`, `config/site.ts`,
`public/assets/branding`, the env (`CANONICAL_HOST`, `REDIRECT_HOSTS`,
`PLAYHQ_*`) and the colours in `tailwind.config.ts`. A new club forks those,
then runs `payload migrate`, `seed:admin`, `seed:club` (or `seed:demo`), and
never runs the ETL. Sport-specific vocabulary (sponsor tiers, people
sections, document categories) is in `lib/` constants. Cookie names keep the
`llcc_` prefix from `config/site.ts`.
