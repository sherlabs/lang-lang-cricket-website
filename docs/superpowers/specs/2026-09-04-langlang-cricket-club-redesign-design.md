# Lang Lang Cricket Club — site redesign, asset migration, admin panel

## Context

Current site: langlangcricketclub.com, built on Wix. Dated template, plain-text blocks, generic stock background, no admin workflow (edits require Wix editor). Owner (club) wants a modern redesign, all current media/documents preserved as owned assets, and a lightweight self-service admin panel so non-technical committee members can update photos, sponsors, documents, and fixtures without a developer. Budget: $0 — must run entirely on free tiers.

### Current site inventory (scraped)
- **Nav**: Home, History, Documents & Policies (Policies, Child Safety, Game Day Checklist, CCCA Directory), Gallery, Sponsors-Partners
- **Committee**: President (Eddie Duiker), Treasurer (Karen Duiker), Secretary / Child Safety Officer & Junior Coordinator (Erin Jozwin), Head Club Coach (Damien Quinlan). Club email: langlangcricketclub@gmail.com
- **Location**: Caldermeade, Victoria. Facility supported by Cardinia Shire + Bendigo Bank.
- **Assets migrated to `/assets`**: club logo, hero photo, 16 gallery photos, 11 sponsor logos (Platinum/Gold/Silver tiers), 16 policy/safety PDFs (codes of conduct, child safety, game day checklist, CCCA directory, weather/social-media/WWCC policies).
- **PlayHQ**: club is on PlayHQ (Casey Cardinia Cricket Association, Summer 2026/27 season). Org ID `484ced51-403a-466c-9a94-bd95eedf7319`. Live fixtures/ladder API requires `clientId`/`clientSecret` issued by PlayHQ as a data partner (request via help@playhq.com) — not self-serve. Not available today, so fixtures start as admin-entered manual data.

## Goals
1. Modern, fast, accessible redesign of every existing page, content-equivalent.
2. All current downloadable/media assets re-hosted as the club's own (no dependency on Wix).
3. Admin panel for non-technical committee members to manage gallery photos, sponsor logos, policy documents, committee contacts, and fixtures/news — no code changes needed.
4. Zero hosting cost.

## Non-goals
- No player registration, payments, or PlayHQ write-access.
- No live PlayHQ fixtures/ladder integration yet (blocked on partner credentials) — built to swap in later without UI rework.
- No multi-admin roles/permissions — single shared admin password is sufficient for this club's size.

## Architecture

**Stack**: Next.js 14 (App Router, TypeScript) + Tailwind CSS + shadcn/ui components. Deployed on Vercel free tier (deploy done by the user, not this session).

**Data**: Neon Postgres (free tier, provisioned via Vercel integration), accessed with Drizzle ORM. Tables: `documents`, `gallery_photos`, `sponsors`, `committee_contacts`, `fixtures`, `news_posts`.

**File storage**: Vercel Blob (free tier, 1GB) for anything an admin uploads after launch. The scraped `/assets` files are committed to the repo and used to seed the database on first run (seed script inserts DB rows pointing at `/assets/...` paths); once an admin replaces an image/doc via the admin panel, that row's URL switches to its new Blob URL.

**Auth**: single admin password (env var `ADMIN_PASSWORD_HASH`, bcrypt). Login route hashes the submitted password and compares; on success sets a signed, httpOnly, 7-day session cookie (using `jose` for JWT signing with `AUTH_SECRET` env var). `middleware.ts` guards every `/admin/*` route except `/admin/login`, redirecting unauthenticated requests there.

## Pages (public)

| Route | Content | Admin-editable? |
|---|---|---|
| `/` | Hero, mission blurb, facilities, sponsor strip, committee cards, CTA to Facebook | contacts + sponsors feed in |
| `/history` | Club history text | no (static, rare edits — can add later if asked) |
| `/documents` | Grouped list (Codes of Conduct / Policies / Child Safety / Game Day Checklist / CCCA Directory), each a download link | yes |
| `/gallery` | Responsive photo grid, lightbox on click | yes |
| `/sponsors` | Platinum/Gold/Silver/Bronze tiers, logo grid | yes |
| `/fixtures` | Manually entered upcoming fixtures + recent results table; "Full ladder on PlayHQ" outbound link | yes |
| `/contact` | Committee contact cards, club email, location/map embed | contacts feed in |

## Admin panel (`/admin`, unlinked from public nav)

- `/admin/login` — password form
- `/admin` — dashboard with links to each section
- `/admin/documents`, `/admin/gallery`, `/admin/sponsors`, `/admin/contacts`, `/admin/fixtures` — each: table of existing rows + add/edit/delete form. File fields upload to Vercel Blob via a server action, get the returned URL, and store it on the row.
- All writes are Next.js Server Actions (no separate API layer needed); each action revalidates the affected public path via `revalidatePath`.

## Data flow

- Public pages: React Server Components, query Postgres directly at request time, Next.js ISR caching (revalidate on admin write via `revalidatePath`, otherwise a long revalidate window as a safety net).
- Admin mutations: Server Actions → Drizzle write → Blob upload (if file) → `revalidatePath` for the relevant public route.
- Fixtures: manual admin CRUD today. `lib/playhq.ts` is written now as a stubbed client (typed, matching the documented `/auth` + fixtures endpoints) but not wired to any page — swapping the fixtures page from manual data to this client later is a single data-source change once credentials exist.

## Error handling
- Failed Blob upload: form re-renders with an inline error, row is not created/updated.
- Login with wrong password: generic "incorrect password" message, no enumeration detail.
- Missing/edited env vars (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `AUTH_SECRET`, `ADMIN_PASSWORD_HASH`): app fails fast at boot with a clear error rather than a silent 500 at request time.

## Testing
- Seed script runs once against a local/dev DB, confirmed by re-reading rows back.
- Per admin section: a scripted create → edit → delete round-trip against a test DB (Vitest + a local Postgres or Neon branch).
- Auth middleware test: request to `/admin` without a cookie redirects to `/admin/login`; with a valid cookie it does not.
- Manual pass: every public page rendered with real seeded content, checked in a browser (this session, via claude-in-chrome) before calling it done.
- No test coverage needed for the PlayHQ stub client since it isn't wired to any live page yet.

## Environment variables (`.env.local`, not committed)
```
DATABASE_URL=
BLOB_READ_WRITE_TOKEN=
AUTH_SECRET=
ADMIN_PASSWORD_HASH=
PLAYHQ_ORG_ID=484ced51-403a-466c-9a94-bd95eedf7319
PLAYHQ_CLIENT_ID=        # blank until partner access granted
PLAYHQ_CLIENT_SECRET=    # blank until partner access granted
```
