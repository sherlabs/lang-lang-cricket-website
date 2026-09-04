# Lang Lang Cricket Club

This is the website and admin panel for the Lang Lang Cricket Club. It's a
Next.js (App Router) site backed by a Postgres database (via
[Drizzle ORM](https://orm.drizzle.team) and [Neon](https://neon.tech)) with
file uploads (documents, gallery photos, sponsor logos) stored in
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob). Public pages
(history, documents, gallery, sponsors, fixtures, contact) are served from
the database, and a password-protected `/admin` panel lets club officials
add, edit, and delete that content without touching code.

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

## Known limitations / follow-up work

- No logout button in the admin panel.
- No error boundary page for unhandled errors.
- Deleting an admin upload (document, photo, sponsor logo) does not delete
  the underlying file from Vercel Blob — it just removes the database row.
- No rate-limiting on the admin login form.
- The fixtures/results integration with PlayHQ is a stub; it's pending
  access to PlayHQ's data-partner API.
