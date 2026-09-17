# Lang Lang Cricket Club

This is the website and admin panel for the Lang Lang Cricket Club. It's a
Next.js (App Router) site backed by a Postgres database (via
[Drizzle ORM](https://orm.drizzle.team) and [Neon](https://neon.tech)) with
file uploads (documents, gallery photos, sponsor logos) stored in
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob). Public pages
(history, documents, gallery, sponsors, contact) are served from
the database, and a password-protected `/admin` panel lets club officials
add, edit, and delete that content without touching code. Fixtures, results,
ladders, scorecards and player stats come live from the PlayHQ API (see
[PlayHQ](#playhq) below).

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- A free [Neon](https://neon.tech) Postgres database
- A free [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store
  (create one from the Storage tab of a Vercel project dashboard)

## Setup

Run these steps in order.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   - `DATABASE_URL` — the connection string from your Neon project
     dashboard.
   - `BLOB_READ_WRITE_TOKEN` — the read/write token from your Vercel Blob
     store settings.
   - `PLAYHQ_ORG_ID` — the club's PlayHQ organisation id (already filled in).
   - `PLAYHQ_CLIENT_ID` — the API key issued by PlayHQ for the club. Never
     commit it.
   - `PLAYHQ_TENANT` — the PlayHQ tenant header; `ca` for Cricket Australia.

3. Generate an `AUTH_SECRET` (a random 32+ character string) and add it to
   `.env.local`:

   ```bash
   openssl rand -base64 32
   ```

4. Generate an `ADMIN_PASSWORD_HASH` for your chosen admin password and add
   it to `.env.local`:

   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD_HERE', 10))"
   ```

5. Push the schema in `db/schema.ts` to your database (this creates the
   tables directly — there are no migration files to run):

   ```bash
   npm run db:push
   ```

6. Seed the database with initial content from the scraped assets:

   ```bash
   npm run seed
   ```

7. Start the local dev server:

   ```bash
   npm run dev
   ```

   Then open [http://localhost:3000](http://localhost:3000).

## Deploying with a real database

The public pages under `app/` currently use `export const dynamic =
'force-dynamic'` so they always read fresh data during development. Once
you're deploying to Vercel against a real, persistent database, switch
those back to time-based revalidation, e.g.:

```ts
export const revalidate = 3600 // or whatever cadence suits the page
```

Also make sure `app/admin/sponsors/actions.ts` and
`app/admin/contacts/actions.ts` call `revalidatePath('/')` in addition to
their existing `revalidatePath` call — the homepage reads both the sponsors
list and the committee contacts, so without this an edit in the admin panel
will leave the homepage showing stale data even after its own page revalidates.

## PlayHQ

The `/fixtures` hub (next round, latest results, team grid; `?team=` for a
single side's ladder, games and players) and `/fixtures/[gameId]` scorecards
read directly from the PlayHQ public API (`lib/playhq/`) rather than the
database. Nothing is stored locally: every request is a `fetch` with Next.js
data-cache revalidation, tagged `playhq`. The pages are dynamic routes (they
read `searchParams`), so freshness is governed by the data-cache TTLs in
`lib/playhq/queries.ts` (`TTL`):
seasons and team lists 6 h, fixtures 30 min, ladders 1 h, in-progress
scorecards 15 min, completed scorecards 7 days.

If PlayHQ is unreachable the pages fall back to a "temporarily unavailable"
panel that links to the club's PlayHQ site.

To see freshly entered results before the cache expires, use the
**Refresh PlayHQ data** button on `/admin/playhq` — it invalidates the
`playhq` tag and the four routes above.

On Vercel, set `PLAYHQ_ORG_ID`, `PLAYHQ_CLIENT_ID` and `PLAYHQ_TENANT` as
project environment variables (Production and Preview). The old
`PLAYHQ_CLIENT_SECRET` variable is no longer used and can be removed.

The manually-maintained `fixtures` table has been removed from
`db/schema.ts`. After deploying, run `npm run db:push` (`drizzle-kit push`)
once to drop it from the database.

## Known limitations / follow-up work

- No logout button in the admin panel.
- No error boundary page for unhandled errors.
- Deleting an admin upload (document, photo, sponsor logo) does not delete
  the underlying file from Vercel Blob — it just removes the database row.
- No rate-limiting on the admin login form.
- Player names on junior team pages and scorecards are abbreviated to
  `First L.` (and a scorecard whose club team cannot be resolved is treated
  as junior). The PlayHQ API returns every appearance, including coaches
  and players not marked visible; the site only shows appearances with
  `roleType === 'Player'` and `visible === true`.
