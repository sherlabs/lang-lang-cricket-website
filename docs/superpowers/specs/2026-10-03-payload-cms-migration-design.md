# Payload CMS migration — design spec

Date: 2026-10-03

## Purpose

The bespoke admin goes away and Payload CMS 3 (Postgres) takes its place as the club's content system. Next goes from 14 to 16 and React from 18 to 19 at the same time. The public site must still look and behave exactly as it does today. The end state is a codebase that later extracts cleanly into a multi-club template. "Lang Lang Cricket Club" then becomes seed data instead of a string found in 36 files.

Success means all of the following:

- `/admin` is the Payload admin. Users log in individually by email and password, and every collection we own is editable there.
- Every public URL still resolves to the same content. That covers `/events/[id]`, `/players/[slug]`, `/history/[slug]`, the RSVP and story-draft token links, and the cookie-remembered RSVPs and drafts on people's phones.
- Production cutover is a rehearsed, reversible runbook. The legacy `public.*` tables stay untouched and remain the rollback.
- `pnpm build` is green on Next 16.3.8 / Payload 3.90.2, and the test suite runs unit and integration projects against local Postgres.

This spec is the single source for the work packages at the end. Inputs were the nine subsystem maps (admin-auth, events, stories, players-playhq, content-misc, next-upgrade, tests, design-system, critic) and an empirical spike against Payload 3.90.2. Where those disagree with memory or docs, the spike wins.

## Out of scope

- **Re-theming or the full template extraction.** Brand colours stay hex literals in `tailwind.config.ts`. Fonts stay Inter and Barlow Condensed. Tailwind stays 3.4, so the shadcn primitives' v4-only classes stay as no-ops for now. The design-system map's CSS-variable theme plan is a follow-up. This migration only lays the groundwork (§16).
- **Visual changes to public pages.** Markup and CSS move between files but must render the same. The one exception is the story body: it is rendered through Lexical `RichText` instead of `dangerouslySetInnerHTML`, and the `.story-content` CSS is retargeted so it looks the same.
- **New features:** rate limiting on the public upload routes (Vercel Firewall can do it later), emailing story or RSVP links, scheduled publishing, i18n, Payload drafts/versions on any collection, GraphQL (disabled), and per-club feature flags. The one Firewall rule that *is* in scope is the login rate limit, a cutover prerequisite (§13.1).
- **Server-side image resizing in v1.** Images are optimised in the browser where custom components upload. The native Payload upload is stored as-is. Source reading suggests the plugin's `afterChange` skips re-uploading any file that carries a `clientUploadContext`, so a resized buffer would never replace the client-uploaded blob; the WP1 check (§7.6a) confirms this before anyone relies on `resizeOptions`.
- **Deleting the legacy `public.*` tables.** That is a separate, explicit migration at least 30 days after a stable cutover (§13.5).
- **Reverse sync** from Payload back to `public.*` after cutover. Rollback loses post-cutover writes unless they are exported by hand (§13.4).

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Versions | Payload 3.90.2 with `@payloadcms/{next,db-postgres,richtext-lexical,storage-vercel-blob,ui}` 3.90.2, Next 16.3.8, React 19, TypeScript 5, Node ≥ 20.9 (`engines`), pnpm only. `package-lock.json` is deleted. `onlyBuiltDependencies` lives in `pnpm-workspace.yaml`, because corepack pnpm 11 ignores the `package.json` key (spike). |
| D2 | Routing | `app/(frontend)/` holds the public site with its own root layout, and it alone imports `globals.css`. `app/(payload)/` holds the Payload admin at `/admin` and REST at `/api/*`. Custom route handlers live in `app/api/**` and are more specific than `/api/[...slug]`. `robots.ts`, `sitemap.ts` and `favicon.ico` stay at the `app/` root. |
| D3 | Database | `postgresAdapter` with `schemaName: 'payload'`. The legacy `public.*` tables are never written by the new app. Push is **opt-in**: local dev only, localhost only. Production schema comes from committed migrations, and the first one starts with `CREATE SCHEMA IF NOT EXISTS "payload"`. |
| D4 | Env isolation | The new app reads **`DATABASE_URI`**, never `DATABASE_URL`. A variable rename alone is not isolation, because `next dev/build/start` and the `payload` CLI all auto-load `.env.local` (`payload/dist/bin/loadEnv.js`), and the worktree's `.env.local` holds the production Neon URL **and** `BLOB_READ_WRITE_TOKEN`. Therefore: (1) Development happens in a separate working copy whose `.env.local` is local-only (embedded Postgres, no Blob token); WP1 step 0 checks its hosts. The production `.env.local` in the main checkout is never read. (2) `payload.config.ts` itself runs `assertSafeEnv()` (§1), so every entry point (dev, start, build, CLI, `migrate:fresh`, `migrate:down`, scripts, tests) is covered, not only `payload run` scripts. (3) The transitional legacy `db/index.ts` gets the same host assert (WP1). (4) `DATABASE_URI*` and `BLOB_READ_WRITE_TOKEN` are scoped to Vercel **Production only**, so `vercel env pull` never brings them to a laptop. |
| D5 | Auth | A Payload `users` auth collection with role `admin \| editor` replaces bcrypt, `AUTH_SECRET`, `llcc_admin_session`, `middleware.ts` and all 12 copies of `requireAdmin`. |
| D6 | Old admin | `app/admin/**`, `components/admin/**` (except the pieces moved into `payload/components`), `lib/{auth,require-admin,crud,blob}.ts` and `/api/{admin,gallery}/upload` are deleted. Payload's native views replace them, plus the custom components in §9. |
| D7 | Public writes | RSVP, story submit/edit and photo submit stay as **server actions**. Each one verifies its token or input, then calls the Local API with `overrideAccess: true`. Collection access rules are tight: admin/editor only, plus public `read` where the site needs it. |
| D8 | Public URLs and cookies | Kept byte-for-byte: numeric event ids, story and player slugs, RSVP `editToken`s, story `editToken`/`viewToken`s, and the cookies `llcc_rsvps`, `llcc_story_draft` and `llcc_ann_dismissed`. The ETL preserves ids (§12). |
| D9 | Club content | New `club` global (identity, contact, socials, SEO, history copy) whose seed defaults equal today's hard-coded values. Home, page-copy, navigation and footer strings live in the same typed `club-defaults.ts` module and are returned by `getClub()`, but are not admin-editable in v1. The frontend reads `getClub()`, which merges the global over the defaults module, so pages render identically even before seeding. New `site-settings` global for behaviour (carousel tiers only). |
| D10 | Uploads | `storage-vercel-blob` with `clientUploads: true`, `alwaysInsertFields: true`, and **direct URLs** (`disablePayloadAccessControl: true`) on four upload collections: `media` (collection prefix **`''`**), `documents`, `gallery-photos` and `event-photos`. Public pending uploads stay **outside** the plugin, on `/api/public/{stories,events}/upload`. Until decommission (§13.5), the plugin's blob deletes are skipped for any doc with a non-null `legacyUrl` (§7.5). |
| D11 | Stories editor | The public submit and token-edit pages keep Tiptap. Storage becomes Lexical with a feature set restricted to the Tiptap subset. Conversion goes through HTML in both directions, using the spike-verified `convertHTMLToLexical` and `convertLexicalToHTML` plus an upload-node resolver. Rendering uses `@payloadcms/richtext-lexical/react` `RichText`. |
| D12 | Event dates | Payload `date` fields keep the legacy wall-clock-as-UTC encoding. A normalising hook snaps `eventDate`, `startDate` and `endDate` to UTC midnight of the club-timezone calendar day, and does nothing if the value is already UTC midnight. `eventTime` stays text `HH:mm`. `occurrenceDate` on RSVPs is stored verbatim. |
| D13 | Player sync | Bulk writes go through `payload.db.drizzle` with `payload.db.tables.*` (table keys snake_case, **column keys camelCase**: `tables.player_aliases.nameKey`, `.player`) and operators imported from `@payloadcms/db-postgres/drizzle`, inside `payload.db.drizzle.transaction()`. There is no `payload.create` per season row. The app-level `drizzle-orm` and `@neondatabase/serverless` are removed. |
| D14 | Query layer | `lib/*-queries.ts` keep their exported names and return types. Internally they call the Local API and map Payload docs to domain types (`lib/domain.ts`), so page components barely change. **Every public query carries its own `where`**, because the Local API defaults to `overrideAccess: true`. |
| D15 | Legacy ETL | A standalone, idempotent `payload run` script (`payload/scripts/etl-legacy.ts`), not a Payload migration. It reads `LEGACY_DATABASE_URL` (unpooled) in `READ ONLY` transactions and refuses to write without `--target <host>/<db> --confirm`. Each WP ships the ETL steps for its own collections so parity checks have data; WP6 adds orchestration and verify. A new club starts with no legacy DB and never runs it. Public writes are **frozen** during cutover, so there is no id gap and no delta pass. |
| D16 | Cache model | Unchanged from today: public pages stay `force-dynamic`, and `cacheComponents` stays off. Collection hooks still call a guarded `revalidatePath`/`revalidateTag`, so caching can be turned on later without touching hooks. |
| D17 | Tests | Two vitest projects. `unit` covers pure tests plus a shared Local-API fake. `int` runs real Payload against local Postgres DB `langlang_test` and is guarded against any non-local URL. |

## 1. Architecture and repository layout

```
app/
  (frontend)/                 public site — own <html>, imports ./globals.css
    layout.tsx  globals.css  error.tsx  not-found.tsx
    page.tsx  sponsors/ gallery/ documents/ contact/ people/ announcements/
    events/…  history/…  players/…  fixtures/…
    [...notFound]/page.tsx    only if global-not-found is unusable (WP1 check, §10)
  (payload)/                  copied from the 3.90.2 blank template
    layout.tsx  custom.scss
    admin/[[...segments]]/page.tsx  admin/[[...segments]]/not-found.tsx  admin/importMap.js
    api/[...slug]/route.ts    (no graphql routes; GraphQL disabled)
  api/
    cron/players-sync/route.ts         GET, Bearer CRON_SECRET, maxDuration 300
    admin/players-sync/route.ts        POST, payload.auth staff, maxDuration 300
    admin/playhq-refresh/route.ts      POST, payload.auth staff
    public/stories/upload/route.ts     POST, unauthenticated handleUpload (stories/pending/)
    public/events/upload/route.ts      POST, unauthenticated handleUpload (events/pending/)
  robots.ts  sitemap.ts  favicon.ico
payload.config.ts             root; composes everything below
payload-types.ts              generated, committed
payload/
  collections/  Users.ts Media.ts Documents.ts GalleryPhotos.ts Sponsors.ts People.ts
                Announcements.ts Events.ts EventRsvps.ts EventPhotos.ts Stories.ts
                Players.ts PlayerAliases.ts PlayerSeasons.ts PlayerSyncRuns.ts
  globals/      Club.ts SiteSettings.ts
  access/       index.ts  (anyone, nobody, isAdmin, isStaff, isAdminField, staffOr(where))
  hooks/        revalidate.ts slug.ts eventDates.ts mealOptions.ts storyLifecycle.ts
                cascadeDelete.ts displayName.ts sortFirst.ts
  fields/       slugField.ts tokenField.ts sortOrderField.ts urlField.ts emailOrEmpty.ts
  editor/       storyLexical.ts   (feature list; shared by collection + converters)
  endpoints/    mergePlayers.ts
  components/   admin React components (§9) + admin.css
  seed/         club-defaults.ts  (the verbatim strings; also imported by the frontend)
                seed-admin.ts seed-club.ts seed-demo.ts
  scripts/      etl-legacy.ts etl/*.ts verify-cutover.ts add-gallery-photos.ts _guard.ts
  migrations/   committed Payload migrations (+ index.ts)
config/
  site.ts       template-level constants: COOKIE_PREFIX='llcc', CLUB_TIMEZONE, agency credit
lib/            frontend domain code (queries, pure libs, playhq, players, stories-convert)
components/     public components only (ui/, events/, players/, playhq/, stories/ …)
```

**Why this layout.** Everything under `payload/` is club-agnostic and becomes the template core. Club identity lives in three places only: `payload/seed/club-defaults.ts`, `config/site.ts` and env. `payload.config.ts` is a thin composer:

```ts
assertSafeEnv()                                           // first statement; see below
const serverURL = resolveServerURL()                      // see below; never ''
export default buildConfig({
  serverURL,                                              // spike: unset serverURL mis-detects URLs as local
  csrf: csrfOrigins(serverURL),                           // explicit; an empty list disables Origin checks
  secret: requireEnv('PAYLOAD_SECRET'),
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },        // component paths are '/payload/components/X#X'
    components: { graphics: { Logo, Icon }, beforeDashboard: ['/payload/components/Dashboard#Dashboard'] },
    meta: { titleSuffix: ' — Club admin' },
  },
  graphQL: { disable: true },
  collections: [...], globals: [Club, SiteSettings],
  editor: lexicalEditor(),                                 // default; stories overrides per field
  db: postgresAdapter({
    pool: { connectionString: requireEnv('DATABASE_URI'), max: Number(process.env.DATABASE_POOL_MAX ?? 5) },
    schemaName: 'payload',
    push: process.env.NODE_ENV !== 'production' && process.env.PAYLOAD_PUSH === 'true' && assertLocalDb(),
    migrationDir: path.resolve(dirname, 'payload/migrations'),
    allowIDOnCreate: process.env.PAYLOAD_ETL === 'true',   // ETL only; see §12.3
  }),
  sharp,
  plugins: [guardLegacyBlobDeletes(vercelBlobStorage({    // §7.5 wrapper
    enabled: Boolean(blobToken()),
    token: blobToken(),                                    // env token, or the test-only fake (below)
    clientUploads: true,
    alwaysInsertFields: true,                              // same schema with or without the token (spike §1)
    collections: {
      media:            { prefix: '',          disablePayloadAccessControl: true },  // MUST be '' (below)
      documents:        { prefix: 'documents', disablePayloadAccessControl: true },
      'gallery-photos': { prefix: 'gallery',   disablePayloadAccessControl: true },
      'event-photos':   { prefix: 'events',    disablePayloadAccessControl: true },
    },
  }))],
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
```

`assertLocalDb()` throws unless the `DATABASE_URI` host is `127.0.0.1` or `localhost`. Pushing to anything remote is therefore impossible, and push is off unless `PAYLOAD_PUSH=true`. This closes critic A1 by construction.

**`assertSafeEnv()`** (`payload/env.ts`, also imported by `db/index.ts` during WP1–5). It applies whenever `process.env.VERCEL` is unset. The test is deliberately not `NODE_ENV`, because a local `next start` runs with `NODE_ENV=production`.
- It throws when the `DATABASE_URI` host is not `127.0.0.1`/`localhost` and `ALLOW_REMOTE_DB !== 'yes'`.
- It throws when `BLOB_READ_WRITE_TOKEN` is set and `ALLOW_REMOTE_BLOB !== 'yes'`.
- The operator's cutover shell (§13.2) sets both flags explicitly. Nothing else does.

**`blobToken()`**: on Vercel or with `ALLOW_REMOTE_BLOB=yes`, it returns `BLOB_READ_WRITE_TOKEN`. When `PAYLOAD_BLOB_FAKE=1` and `VERCEL` is unset, it returns a fixed fake token (`vercel_blob_rw_fakestore_…`), passed straight to the plugin and never through the env var, with `@vercel/blob` mocked in the test. This is the spike's `SPIKE_FAKE_BLOB_TOKEN` pattern. It is the only way the plugin's hooks run in tests (§15). Otherwise it returns `undefined` and the plugin is disabled.

**`resolveServerURL()` / `csrfOrigins()`**: with `VERCEL_ENV === 'preview'`, `serverURL` is `https://${VERCEL_BRANCH_URL}` and `csrf` also lists `https://${VERCEL_URL}`. Otherwise it is `requireEnv('NEXT_PUBLIC_SERVER_URL')`. Payload adds `serverURL` to `csrf` only when it is non-empty (`config/sanitize.js`), and `extractJWT` accepts a cookie from any `Origin` when `csrf` is empty. A missing variable must therefore fail the boot, not silently disable the check. Previews derive the URL so that admin login works on the branch host.

**Per-row `prefix`, and why `media` has collection prefix `''`.** The plugin stores `prefix` per document, and the URL is `baseUrl/<storage path>/encodeURIComponent(filename)`. In 3.90.2 three code paths run `buildUploadPrefix`/`buildStoragePathData` with the collection prefix: the `normalizeUploadPrefix` collection and **field** hooks (the field hook is installed even when the plugin is disabled, via `alwaysInsertFields`), `generateURL` and `afterDelete`. Each nests any doc prefix that is not under the collection prefix: with collection prefix `media`, `players` becomes `media/players`. Passing `context.skipCloudStorage` only skips the two prefix hooks; URL generation and delete would still nest. So `media` uses collection prefix `''`, for which `isStoragePathWithinCollectionPrefix` is always true and every per-row prefix is stored and used verbatim. New admin uploads to `media` therefore go to the store root, as `filename` only.
- `documents`, `gallery-photos` and `event-photos` keep their prefixes. The ETL **asserts** that every legacy URL for those tables sits under `documents/`, `gallery/` and `events/` respectively. A row outside them goes through the collision/re-upload fallback (§12.4) and is reported.
- The ETL sets `prefix` per row (`players`, `contacts`, `sponsors`, `stories`, `stories/pending`, `events`, …). Public pending uploads register with `prefix = 'stories/pending'` (media) or `'events/pending'` (event-photos).
- `media-register.int` runs with the plugin enabled (fake token) and asserts the stored `prefix` round-trips and `url === legacyUrl`. ETL verify checks this for **every** registered row (§12.2 step 18).

**Direct mode.** All club media is public, as it is today. `disablePayloadAccessControl: true` makes `doc.url` the public Blob URL, so images are not streamed through a function. Without a token (local dev), core local storage applies: `./media`, `./documents` and so on on disk (git-ignored), served at `/api/<slug>/file/<name>`.

**`legacyUrl` wins on read.** Each upload collection gets an `afterRead` hook: when `legacyUrl` is a non-null own-store URL, `url = legacyUrl`. In production the two are equal (verify proves it), so this is a no-op there. It makes legacy images render on a dev DB restored from a dump (no token) and on previews, which use a separate Blob store (§11.5). It replaces the former `LEGACY_BLOB_BASE_URL` variable. Replacing the file of a doc with a `legacyUrl` is refused in `beforeChange` until decommission ("Upload a new image instead"), so `legacyUrl` can never go stale.

## 2. Access model (`payload/access`)

```ts
anyone   = () => true
nobody   = () => false
isAdmin  = ({ req }) => req.user?.role === 'admin'
isStaff  = ({ req }) => Boolean(req.user)                     // admin | editor
isAdminField = ({ req }) => req.user?.role === 'admin'        // field-level
staffOr  = (where: Where) => ({ req }) => (req.user ? true : where)   // public read filtered
```

- **Principle: public REST read is granted only where something needs it.** No public page reads `/api/*`; pages use the Local API, and image URLs are direct Blob URLs. Anonymous REST read exists only so dev-mode `/api/<upload>/file/*` serves files and so nothing breaks if a future client component reads published content. It never exposes a field or row the site does not already show. PII and moderation fields carry field-level `access.read: isStaff`, even on publicly readable collections.
- These rules protect **REST and the admin only**. The Local API runs with `overrideAccess: true` by default. Every server-side public query in `lib/*-queries.ts` **and `app/sitemap.ts`** therefore states its own filter (`status: published`, `status: approved`, `hidden: false`, `published: true`). Every public `find`/`findByID` on `events` and `players` passes `joins: false` (or a `select`), because with `overrideAccess` the joins load RSVPs (tokens, emails) and pending photos. A unit test asserts on the `where` and `joins` passed to each query.
- Token fields (`editToken`, `viewToken`) carry field-level `access: { read: isStaff, create: nobody, update: nobody }` and `admin.hidden: true`. They never appear in public REST responses. Field read access also governs `where` and `sort`, so `?where[editToken][like]=` and `?sort=editToken` are rejected for anonymous users.
- **`admin.readOnly` is UI only.** Every field described as hook- or sync-owned (`players.source`, `isActiveDerived`, `displayName`, `slug`; `stories.slug`, `submittedByAdmin`, `publishedAt`, `reviewedAt`) also gets `access: { create: nobody, update: nobody }`. Its owning hook additionally resets it to `originalDoc`'s value on update (or computes it on create) unless `context.sync` or `context.etl` is set. ETL and sync are unaffected: the ETL runs with `overrideAccess: true`, which skips field access, and sync writes through drizzle. Field write access strips incoming values during the `beforeValidate` field traversal (`fields/hooks/beforeValidate/promise.js`), so the owning hooks must be `beforeChange` hooks, which run afterwards.
- **Domain types never carry secrets.** `lib/domain.ts` `Story` has no `editToken`, `viewToken` or `authorEmail`; token pages get the one token they need from the route param, so no RSC-to-client prop can carry them.
- `users` is admin-only, except that an editor can read and update their own record. The `role` field has `access.update: isAdminField`.
- GraphQL is disabled. REST stays available for the admin UI. `robots.ts` already disallows `/api`.

## 3. Collections, field by field

Conventions used throughout:

- **Timestamps.** `timestamps: true` everywhere, giving `createdAt` and `updatedAt` as `timestamptz(3)`.
- **Revalidation.** `hooks.afterChange` and `afterDelete` include `revalidate([...paths])` from `payload/hooks/revalidate.ts`. The helper is a no-op when `context.disableRevalidate` is set. It wraps `revalidatePath`/`revalidateTag` in try/catch, because those throw outside a Next request (in `payload run`). That behaviour is verified in WP1.
- **Validators.** Every custom validator short-circuits on `req.context.etl === true`, so legacy rows import verbatim. Length caps and the file-size caps are custom validators for the same reason: built-in `maxLength` cannot be bypassed.
- **ETL hook bypass: every hook, enumerated.** With `context.etl`, a hook keeps the value the ETL supplied and computes nothing. `etl.int` asserts a field-for-field round trip for each row below.

  | Hook | Normal behaviour | With `context.etl` |
  |---|---|---|
  | `slug.ts` (stories, players) | create: `makeUniqueSlug(slugify(title))`; update: reset to original | keep supplied `slug` |
  | `tokenField` (rsvps, stories) | generate `randomUUID()` when missing; update: reset | keep supplied tokens |
  | stories `submittedByAdmin` | `Boolean(req.user) && !publicSubmission` | keep supplied |
  | `storyLifecycle` timestamps | stamp `publishedAt`/`reviewedAt` on transitions | skip; keep supplied |
  | `storyLifecycle` excerpt | derive when empty | skip; keep verbatim, even `''` |
  | `storyLifecycle` public-edit rule (§5) | force `pending`, strip protected keys | not applicable (no `publicSubmission`) |
  | stories `authorName` default | `club.name` when empty | skip |
  | `sortFirst` (gallery, event-photos) | `min - 1` when not supplied | skip |
  | `displayName.ts` | `${firstName} ${lastName}` | keep supplied |
  | players `source` guard | force `manual` on create; reset on update | keep supplied (also with `context.sync`) |
  | `eventDates.ts` | require per type, null other branch, snap dates | skip entirely |
  | `mealOptions` | trim, drop blanks, dedupe | skip |
  | people trim | trim strings | skip |
  | rsvps meal rule | `response === 'no'` → `meal = ''` | skip |
  | `legacyUrl` file-replace guard | refuse a new file | n/a (ETL never replaces) |
  | `revalidate` | revalidate paths | no-op (`disableRevalidate`) |
- **Payload columns** are snake_case in SQL (`firstName` → `first_name`). Relationships become `<name>_id`. Arrays become `<collection>_<field>` tables with `_order`, `_parent_id` and a varchar `id`. **Drizzle objects use different keys**: `payload.db.tables` is keyed by snake_case table name, but each table's column keys are the camelCase field names (`@payloadcms/drizzle` `traverseFields.js`, `targetTable[fieldName]`): `tables.player_aliases.nameKey`, `.player` (SQL `player_id`), `isActiveDerived`, `createdAt`, and `_parentID`/`_order` on array tables. A snake_case key such as `tables.player_aliases.name_key` is `undefined`.

### 3.1 `users` (auth)

| Field | Type | Notes |
|---|---|---|
| email, password | auth built-ins | `auth: { tokenExpiration: 604800, cookies: { sameSite: 'Lax', secure: prod } }`. Cookie is `payload-token`. |
| name | text | optional |
| role | select `admin`/`editor`, required, default `editor` | `saveToJWT: true`; update restricted to `isAdminField` |

- **Access:** read is admin, or `id == req.user.id`. Create and delete are admin. Update is admin or self.
- **Admin:** `useAsTitle: 'email'`, group **Settings**, `defaultColumns: ['email','name','role']`.
- **First user.** It is created by `payload/scripts/seed-admin.ts` from `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` immediately after `migrate`.
- **First-register is closed structurally.** `registerFirstUser` refuses only when a user row exists and then calls `payload.create` with `overrideAccess: true` (`auth/operations/registerFirstUser.js`), so `access.create` cannot stop it. A `hooks.beforeOperation` on `users` throws `Forbidden` when `operation === 'create' && !req.user && !req.context?.seedAdmin`. `seed-admin.ts` passes `context: { seedAdmin: true }`. An empty users table (a fresh preview branch, a failed cutover) is therefore never claimable at `/admin/create-first-user` or `POST /api/users/first-register`. Previews are additionally behind Vercel Deployment Protection (§11.5).
- **Login lockout.** The defaults (`maxLoginAttempts: 5`, `lockTime: 600000`, per account) stay. Committee emails are public on `/contact`, so an attacker could keep an admin locked out; a Vercel Firewall rate-limit rule on `POST /api/users/login` and `/api/users/forgot-password` (per IP, e.g. 10/min) is a cutover prerequisite (§13.1). An admin can unlock a user from the admin.

### 3.2 `media` (upload, images)

| Field | Type | Notes |
|---|---|---|
| (upload) | `upload: { mimeTypes: ['image/*'], filesRequiredOnCreate: false, focalPoint: true, crop: true }` | plugin adds `prefix` |
| alt | text, default `''` | optional (legacy has none) |
| legacyUrl | text, unique index, `admin.hidden` | ETL idempotency key; null for new uploads |

- **Access:** read is `staffOr({ prefix: { not_equals: 'stories/pending' } })`, so pending and rejected story images are not listable over anonymous REST (today they are unlisted, unguessable URLs). Not `isStaff`: in dev without a token, public pages load files through `/api/media/file/*`, which checks read access. Create, update and delete are staff.
- **Collection prefix** is `''` (§1).
- **Admin:** group **Media**, `defaultColumns: ['filename','alt','prefix','updatedAt']`.
- **Usage:** event covers, story covers and inline images, player photos, people photos, sponsor logos, and club logo/hero/OG images.
- **Deletion:** deleting a parent such as a sponsor never deletes its `media` doc, because media may be shared. Deleting a `media` doc deletes its blob (plugin `afterDelete`), except for `legacyUrl` rows before decommission (§7.5).

### 3.3 `documents` (upload, PDF) ← `public.documents`

| Field | Type | Notes |
|---|---|---|
| (upload) | `mimeTypes: ['application/pdf']`, `filesRequiredOnCreate: false` | |
| title | text, required | |
| category | select, required | `Codes of Conduct`, `Policies`, `Child Safety`, `Game Day`, `CCCA Directory`. The option list is exported from `lib/documents.ts` (`DOCUMENT_CATEGORIES`, also the public `CATEGORY_ORDER`). |
| legacyUrl | text, unique, hidden | |

- **Access:** read anyone, write staff. **Admin:** `useAsTitle: 'title'`, `defaultColumns: ['title','category','filename']`, `defaultSort: 'title'`, group **Club**.
- **Revalidate:** `/documents`.
- **Bugs fixed:** client uploads remove the 4.5 MB server-action cap. Deleting a document or replacing its file now deletes the old blob.

### 3.4 `gallery-photos` (upload, images) ← `public.gallery_photos`

| Field | Type | Notes |
|---|---|---|
| (upload) | images, `filesRequiredOnCreate: false` | |
| caption | text, default `''` | |
| sortOrder | number, default 0, indexed | lower shows first; first six on the home page |
| legacyUrl | hidden unique | |

- **Hook `sortFirst`:** on `create`, when `sortOrder` is not supplied, set it to `min(sortOrder) - 1`. New uploads land at the front, as `addGalleryPhotos` does today, without rewriting every row.
- **Access:** read anyone, write staff. **Admin:** `defaultSort: 'sortOrder'`, `defaultColumns: ['filename','caption','sortOrder']`, group **Club**. Bulk upload is Payload's native one.
- **Revalidate:** `/gallery`, `/`. The OG image query stays "newest by `createdAt`".

### 3.5 `sponsors` ← `public.sponsors`

| Field | Type | Notes |
|---|---|---|
| name | text, required | `useAsTitle` |
| tier | select `Platinum`/`Gold`/`Silver`/`Bronze`/`Player`, required, default `Bronze` | options from `TIER_ORDER` |
| logo | upload → media, optional | the `SponsorMark` name-text fallback stays |
| linkUrl | text, default `''`, validate empty or http(s) | |
| sortOrder | number, default 0 | **new.** It makes within-tier order explicit. The ETL fills it from legacy id order, which is today's effective order. |

- **Access:** read anyone, write staff. **Admin:** `defaultColumns: ['name','tier','sortOrder']`, `defaultSort: 'tier'`, group **Club**.
- **Revalidate:** `/sponsors`, `/`.

### 3.6 `people` ← `public.committee_contacts`

| Field | Type | Notes |
|---|---|---|
| name | text, required | `useAsTitle` |
| role | text, required | admin description lists the suggestions from today's datalist |
| section | select `leadership`/`committee`/`coach`, default `committee` | labels from `PEOPLE_SECTIONS` |
| phone | text, default `''` | |
| email | text, default `''` | `emailOrEmpty` validator |
| photo | upload → media | the square crop is now Payload's crop tool, and the frontend already uses `object-cover aspect-square` |
| sortOrder | number, default 0 | |

- **Hook:** `beforeChange` trims strings, which ports `fromForm`.
- **Access:** read anyone, write staff. **Admin:** `defaultColumns: ['name','role','section','sortOrder']`, `defaultSort: 'sortOrder'`, group **Club**.
- **Revalidate:** `/`, `/contact`, `/people`.

### 3.7 `announcements` ← `public.announcements`

| Field | Type | Notes |
|---|---|---|
| title | text, required | |
| body | textarea, default `''` | stays plain text, because `bodyParagraphs`/`excerpt` depend on it |
| published | checkbox, default false, indexed | |

- **Access:** read is `staffOr({ published: { equals: true } })`. Write is staff.
- **Admin:** `defaultColumns: ['title','published','createdAt']`, `defaultSort: '-createdAt'`, group **Club**.
- **Revalidate:** `/`, `/announcements`.
- `createdAt` drives "latest". The `llcc_ann_dismissed` cookie stores the numeric id, which is preserved.

### 3.8 `events` ← `public.events`

| Field | Type | Condition / notes |
|---|---|---|
| type | select `one_time`/`recurring`, required, default `one_time` | radio appearance |
| title | text, required | `useAsTitle` |
| description | textarea, default `''` | |
| location | text, default `''` | |
| cover | upload → media | |
| eventTime | text `HH:mm` or `''` | validate `/^([01]\d\|2[0-3]):[0-5]\d$/`; admin description "24-hour, e.g. 18:00" |
| eventDate | date, `pickerAppearance: 'dayOnly'` | shown when `type === 'one_time'` |
| dayOfWeek | select `'0'`…`'6'` labelled Sunday…Saturday, default `'4'` | `recurring`; the mapper converts it to a number |
| startDate, endDate | date dayOnly | `recurring` |
| mealOptions | array `{ label: text required }` | the hook normalises it (trim, drop blanks, case-insensitive dedupe keeping the first spelling, which is `normaliseMealOptions`) |
| paymentLinkLabel | text, default `''` | |
| paymentLinkUrl | text, default `''` | validate with `isValidPaymentUrl` |
| rsvps | join → `event-rsvps` on `event` | `admin.hidden` (the summary UI is better) |
| photos | join → `event-photos` on `event` | shown; per-event photo table |
| rsvpSummary | ui → `RsvpSummaryField` | §9 |
| pendingPhotos | ui → `PendingPhotosField` | §9 |
| recapUpload | ui → `RecapPhotosField` | shown only for a past one-time event |
| goingCount, pendingCount | ui with list `Cell` components | §9 list columns |

Hooks:

- **`beforeValidate` (`eventDates.ts`):**
  - For `one_time`: require `eventDate`, and null `dayOfWeek`, `startDate` and `endDate`.
  - For `recurring`: require `dayOfWeek`, `startDate` and `endDate` with `startDate <= endDate`, and null `eventDate`.
  - Normalise the three dates. If a value is already exactly `00:00:00.000Z`, keep it. Otherwise take its calendar day in `CLUB_TIMEZONE` and store `Date.UTC(y, m, d)`. This is idempotent for every timezone, and correct whether the picker sends local midnight or local noon.
- **`beforeChange`:** normalise meal options.
- **`beforeDelete` (`cascadeDelete.ts`):** delete this event's `event-rsvps` and `event-photos` through the Local API with the same `req`, so they share one transaction. The plugin deletes the photo blobs. Today's orphaning is a bug. The token page's "no longer listed" branch stays as a defensive path.
- **Revalidate:** `/events`, `/events/${id}`, `/`.

- **Access:** read anyone, write staff.
- **Admin:** group **Events**, `defaultColumns: ['title','type','eventDate','startDate','goingCount','pendingCount']`, `defaultSort: '-createdAt'`.

### 3.9 `event-rsvps` ← `public.event_rsvps`

| Field | Type | Notes |
|---|---|---|
| event | relationship → events, required, index | |
| occurrenceDate | date (time shown), required, index | **stored verbatim with no hook.** Cookie keys depend on `toISOString()` to the millisecond. |
| name | text, required | validator caps it at 100 |
| email | text, default `''` | caps at 200, `emailOrEmpty` (new validation; skipped for ETL) |
| note | textarea, default `''` | caps at 1000 |
| response | select `yes`/`no`, default `yes`, index | options from `lib/rsvp-response.ts` |
| meal | text, default `''` | text, not a relation, because options can change after an RSVP is made |
| editToken | text, unique, index; `access.read: isStaff`, hidden | `tokenField()` generates `randomUUID()` on create when missing |

- **Hook `beforeChange`:** if `response === 'no'`, set `meal = ''`. This is the admin-side meal rule. Public actions run `resolveMeal` first.
- **Access:** read, create, update and delete are all staff. The public never reads RSVPs over REST; tallies are server-side counts.
- **Admin:** `useAsTitle: 'name'`, `defaultColumns: ['name','event','occurrenceDate','response','meal']`, group **Events**.
- **Revalidate:** `/events`, `/events/${event}`.
- There is deliberately no unique index on `(event, occurrenceDate, name)`, because duplicates from different devices are intended.

### 3.10 `event-photos` (upload, images) ← `public.event_photos`

| Field | Type | Notes |
|---|---|---|
| (upload) | images, `filesRequiredOnCreate: false` | public submissions register `prefix: 'events/pending'` |
| event | relationship → events, required, index | |
| caption | text, default `''` | caps at 200 |
| sortOrder | number, default 0 | `sortFirst` hook, as in the gallery |
| status | select `approved`/`pending`, default `approved`, index | |
| submitterName | text, default `''` | caps at 200; field `access.read: isStaff` (never shown publicly today) |
| legacyUrl | hidden unique | |

- **Access:** read is `staffOr({ status: { equals: 'approved' } })`, write is staff.
- **Admin:** group **Events**, `defaultColumns: ['filename','event','status','submitterName','createdAt']`, plus a `beforeList` `PendingQueueBanner`.
- **Moderation:**
  - Approve sets `status = 'approved'`. The blob stays under `events/pending/`, as it does today.
  - Reject deletes the doc, and the plugin deletes the blob (unless it has a `legacyUrl`, §7.5).
  - The legacy "shared URL" guard is no longer needed, because `filename` is unique per collection and two docs can never reference one blob.
- **Revalidate:** `/events`, `/events/${event}`.

### 3.11 `stories` ← `public.stories`

| Field | Type | Notes |
|---|---|---|
| title | text, required | `useAsTitle` |
| slug | text, unique, index, `admin.readOnly`, `access: { create: nobody, update: nobody }` | `slug.ts` `beforeChange` hook: on create only, `makeUniqueSlug(slugify(title), exists)` with reserved `submit` and `drafts`; on update reset to `originalDoc.slug`, so it never changes |
| excerpt | textarea, default `''` | derived when empty (below) |
| content | richText, `storyLexical` editor (§5) | required |
| coverImage | upload → media | |
| authorName | text, required | admin-created stories default to `club.name` in `beforeValidate` |
| authorEmail | text, default `''` | `emailOrEmpty`; field `access.read: isStaff` (today only the admin and the token-gated edit page show it) |
| submittedByAdmin | checkbox, `admin.readOnly`, `access: { create: nobody, update: nobody }` | set in `beforeChange` on create: `Boolean(req.user) && !context.publicSubmission`; reset to original on update |
| status | select `pending`/`published`/`rejected`, index | `defaultValue: ({ user }) => (user ? 'published' : 'pending')` |
| editToken, viewToken | text, unique, index, read `isStaff`, create/update `nobody`, hidden | generated on create |
| publishedAt, reviewedAt | date, `admin.readOnly`, `access: { create: nobody, update: nobody }` | `storyLifecycle.ts` (cannot be backdated over REST) |
| submitterLinks | ui → `StoryLinksField` | staff can copy the view and edit links (fixes stories map §13.6) |

Hooks in `storyLifecycle.ts`:

- On the transition to `published`: `publishedAt ??= now` (re-approval no longer overwrites it) and `reviewedAt = now`.
- On the transition to `rejected`: `reviewedAt = now`.
- **Public edits are enforced here, not only in the action.** When `context.publicSubmission && operation === 'update'`: delete `status`, `slug`, `editToken`, `viewToken`, `submittedByAdmin`, `publishedAt` and `reviewedAt` from incoming `data`, then set `status = 'pending'`. With `overrideAccess: true` nothing else stops an action from passing those through.
- Every hook in this file is skipped under `context.etl` (§3 conventions).
- When `excerpt` is empty: `excerpt = htmlToExcerpt(convertLexicalToHTML({ data: content, converters: ({ defaultConverters }) => ({ ...defaultConverters, upload: () => '' }) }))`. In `beforeChange` the upload nodes hold only `value: <id>` and are not populated, so the excerpt path renders them as empty strings. It uses the verified `/html` export and the existing 160-character word-boundary cut.

Everything else:

- **Access:** read is `staffOr({ status: { equals: 'published' } })`, write is staff.
- **Admin:** group **Content**, `defaultColumns: ['title','status','authorName','createdAt']`, `listSearchableFields: ['title','authorName']`, `beforeList: PendingQueueBanner`, `edit.beforeDocumentControls: StoryModerationControls`. Rejected stories are now listed and can be restored, which fixes stories map §7.
- **Revalidate:** `/history`, `/history/${slug}`.

### 3.12 `players` ← `public.players` + `public.player_honours`

| Field | Type | Notes |
|---|---|---|
| slug | text, unique, index, readOnly, create/update `nobody` | on create: `makeUniqueSlug` (manual) or set by sync; reset on update |
| firstName, lastName | text, required | |
| displayName | text, readOnly, `admin.hidden` in the edit view, create/update `nobody` | `useAsTitle`. The `displayName.ts` `beforeChange` hook sets it to `${firstName} ${lastName}`. Sync and the ETL write it too. |
| photo | upload → media | |
| bio | textarea, default `''` | plain text, split on blank lines |
| source | select `playhq`/`manual`, default `manual`, readOnly, create/update `nobody` | a `beforeChange` hook forces `manual` on create and `originalDoc.source` on update, unless `context.sync`/`context.etl`. A REST `PATCH source=manual` followed by DELETE therefore cannot get past the delete guard. |
| manualYears | text, default `''` | condition `source === 'manual'` |
| activeOverride | select `active`/`past`, optional (empty means auto) | |
| isActiveDerived | checkbox, readOnly, create/update `nobody` | written only by sync |
| hidden | checkbox, default false, index | |
| honours | array `{ years: text req, title: text req }` | table `players_honours`; drag-reorder replaces `HonoursEditor` |
| seasons | join → `player-seasons` on `player` | read-only table in the edit view |
| aliases | join → `player-aliases` on `player` | |
| merge | ui → `MergePlayerField` | shown only on existing docs |

Hooks:

- **`beforeDelete`:** throw `Forbidden` when `source === 'playhq'`. Otherwise delete the player's aliases and seasons with the same `req`.
- **Revalidate:** `/players`, `/players/${slug}`.

Everything else:

- **Access:** read is `staffOr({ hidden: { equals: false } })`. Create and update are staff. Delete is staff, and the hook enforces the rest.
- **Admin:** group **Players**, `defaultColumns: ['displayName','source','hidden','updatedAt']`, `listSearchableFields: ['displayName','slug']`, `beforeList: PlayerSyncPanel`.
- **Merge endpoint:** `POST /api/players/:id/merge` with body `{ targetId }` (§8.3).

### 3.13 `player-aliases` ← `public.player_aliases`

| Field | Type | Notes |
|---|---|---|
| nameKey | text, required, unique, index | `first|last` lower-cased. It was the legacy PK and is now a unique column on a serial id. |
| player | relationship → players, required, index | |

- **Access:** read staff, create/update/delete admin (manual repair only). Sync and merge write it directly.
- **Admin:** group **Players**, `useAsTitle: 'nameKey'`.

### 3.14 `player-seasons` ← `public.player_seasons`

| Field | Type |
|---|---|
| player | relationship → players, required, index |
| seasonName | text, required |
| seasonOrder | number, required, index |
| teamId | text, required |
| teamName | text, required |
| gradeName | text (nullable) |
| games, batInnings, batNotOuts, batRuns, batHighScore, batBalls, batFours, batSixes, bowlBalls, bowlMaidens, bowlRuns, bowlWickets, bowlBestWickets, bowlBestRuns, catches | number, required, default 0 |
| batHighScoreNotOut | checkbox, default false |

- **Indexes:** `indexes: [{ fields: ['player', 'teamId'], unique: true }]`.
- **Access:** read is `staffOr({ 'player.hidden': { equals: false } })`. A plain `anyone` would leak hidden players' seasons through `?where[player][equals]=<id>`, because the relationship-hop access check only applies to `player.*` paths. Create, update and delete are `nobody`; only sync writes, through drizzle.
- **Admin:** group **Players**, `defaultColumns: ['player','seasonName','teamName','games','batRuns','bowlWickets']`.

### 3.15 `player-sync-runs` ← `public.player_sync_runs`

Fields:

- `startedAt` (date, required)
- `finishedAt` (date)
- `status` (select `running`/`ok`/`error`, index)
- `playersCreated` (number, default 0)
- `seasonRows` (number, default 0)
- `error` (textarea)

- **Access:** read staff, write `nobody`.
- **Admin:** group **Players**, `defaultSort: '-startedAt'`.

### 3.16 Legacy table → Payload map (all 15)

| Legacy table | Payload |
|---|---|
| documents | `documents` (upload) |
| gallery_photos | `gallery-photos` (upload) |
| sponsors | `sponsors` |
| site_settings | `site-settings` global (`sponsorCarouselTiers`) |
| committee_contacts | `people` |
| stories | `stories` |
| events | `events` |
| event_rsvps | `event-rsvps` |
| event_photos | `event-photos` (upload) |
| announcements | `announcements` |
| players | `players` |
| player_aliases | `player-aliases` |
| player_honours | `players.honours` array (`players_honours`) |
| player_seasons | `player-seasons` |
| player_sync_runs | `player-sync-runs` |

New: `users`, `media`, the `club` global.

Payload's internal collections (`payload-preferences`, `payload-migrations`, `payload-locked-documents`) stay hidden from the admin nav by default. Nothing here changes that.

**Admin groups.** Club (documents, gallery, sponsors, people, announcements), Events (events, rsvps, photos), Content (stories), Players (players, aliases, seasons, sync runs), Media, Settings (users, globals).

## 4. Globals

### 4.1 `club` (identity and copy) — the template's main seam

Access: read anyone, update `isAdmin`. It uses tabs. Every default lives in `payload/seed/club-defaults.ts` as a typed `ClubDefaults` object. Field `defaultValue`s, `seed-club.ts` and the frontend's `getClub()` fallback merge all import from it.

The implementing agent must lift **every string in content-misc §8 verbatim, with its file:line**. The page snapshot test (WP2) proves the result is identical.

| Tab | Fields (defaults = today's values) |
|---|---|
| Identity | `name` "Lang Lang Cricket Club"; `shortName` "Lang Lang CC"; `tagline` "Caldermeade, Victoria"; `sport` "Cricket"; `siteUrl` "https://langlangcricketclub.com"; `logo` (upload, fallback `/assets/branding/logo.png`); `locale` "en-AU"; `ogLocale` "en_AU" |
| Contact & location | `email` "langlangcricketclub@gmail.com"; `sponsorshipSubject` "Sponsorship enquiry"; `address { locality "Caldermeade", region "VIC", regionName "Victoria", country "AU", countryName "Australia" }`; `mapQuery` "Caldermeade, Victoria, Australia" |
| Socials | array `{ platform: select facebook/instagram/x/youtube/tiktok, url, label }`. Seed: `[{ facebook, url: '', label: 'Find us on Facebook' }]`. An empty URL renders as text, as today. Non-empty URLs feed JSON-LD `sameAs`. |
| SEO | `defaultTitle`; `titleSuffix` " \| Lang Lang Cricket Club"; `defaultDescription` (from `app/layout.tsx:29`); `ogImage` (upload, fallback `/og-image.jpg`); `ogImageAlt`; `pages` group with `{ title, description }` for home, sponsors, gallery, documents, contact, people, announcements, history, historySubmit, events, players and fixtures |
| History | `history { narrative (textarea, paragraphs), pullQuote, callout }`; `storySubmitIntro` |

**Defaults-module only in v1** (typed in `club-defaults.ts`, returned by `getClub()`, not admin-editable; promoting them to tabs later is additive):

| Group | Values |
|---|---|
| Home | `hero { image (fallback /assets/branding/hero.jpg), focalY 60, eyebrow, headline, headlineAccent, intro, primaryCta {label, href}, secondaryCta }`; `highlights[] { icon: select over a Hugeicons whitelist, title, body }` (the 4 current items); section blocks `about`, `galleryTeaser`, `committee`, `sponsors`, `joinCta`, each `{ eyebrow, title, intro, ctaLabel? }` |
| Page copy | headers and intros for sponsors, gallery, documents, contact, people, announcements; `tierBlurbs[] { tier, blurb }`; `documentCategories[] { category, icon, blurb }`; `peopleSections[] { key, label, heading, intro }`; `contactCards`; `safeguardingNote`; `emptyStates { committee, players, … }` |
| Navigation & footer | `primaryNav[] {label, href}`; `clubhouseNav[]`; `navCta {label, href}`; `footerColumns[] { heading, links[] }`; `footerBlurb`; `fundingCredit`; `copyrightName` |

`getClub()` lives in `lib/club.ts`. It is wrapped in React `cache()`, fetches with `depth: 1`, deep-merges the global over the defaults, and returns a plain typed object.

**What stays out of the global.**

- Cookie names (`config/site.ts` `COOKIE_PREFIX`). The banner sets its cookie client-side, so the name must be a build-time constant.
- The agency credit (template constant in `config/site.ts`, with the `utm_source` derived from `siteUrl`).
- Canonical and redirect hosts. `next.config.mjs` evaluates its redirects at build time, before any DB is reachable, so these come from env `CANONICAL_HOST` and `REDIRECT_HOSTS`, whose defaults are today's values. `club.siteUrl` drives canonicals, the sitemap and JSON-LD at runtime. `seed-club` warns if `siteUrl`'s host is not `CANONICAL_HOST`.

### 4.2 `site-settings` (behaviour)

Access: read anyone, update staff.

| Field | Type | Default |
|---|---|---|
| sponsorCarouselTiers | select hasMany over the tiers | `['Platinum','Gold']`; `[]` is valid and hides the carousel; `normaliseTiers` runs on read |

Feature flags (`events`/`stories`/`players`/`fixtures`) are deferred to the template work (§16).

Revalidate: `/`, `/sponsors`.

## 5. Stories rich text

**The Lexical feature set (`payload/editor/storyLexical.ts`).** It mirrors exactly what Tiptap can produce, so both conversions are lossless.

- **Enabled:**
  - `ParagraphFeature`
  - `HeadingFeature({ enabledHeadingSizes: ['h2','h3','h4'] })`
  - `BoldFeature`, `ItalicFeature`, `StrikethroughFeature`, `InlineCodeFeature`
  - `BlockquoteFeature`
  - `UnorderedListFeature`, `OrderedListFeature`, `IndentFeature` (nested lists)
  - `HorizontalRuleFeature`
  - `LinkFeature({ enabledCollections: [], fields: drop 'newTab' })`: custom URLs only, href only
  - `UploadFeature({ collections: { media: { fields: [] } } })`
  - `FixedToolbarFeature`, `InlineToolbarFeature`
- **Disabled:** underline, sub/superscript, alignment, checklist, relationship, blocks, tables and internal links.

**Conversion module (`lib/stories-convert.ts`).** It is server-only, and the one module tested in both directions.

1. **`tiptapJsonToSafeHtml(json)`** wraps `JSON.parse` in try/catch and returns `{ error }`, never a 500.
   - It runs the existing `renderStoryHtml`: `generateHTML` under JSDOM with the existing extension set.
   - The ProseMirror schema is still the sanitiser. Raw `contentJson` is never trusted.
2. **`normaliseStoryHtml(html)`** does a JSDOM pass:
   - `h1` → `h2`, and `h5`/`h6` → `h4`
   - `pre` → `p` containing a `code` element
   - drops `img`s whose `src` is not an own-Blob, own-media or `/assets/` URL
   - strips every attribute except `href`, `src` and `alt`
3. **`htmlToLexical(html, payload)`** calls `convertHTMLToLexical({ editorConfig: await editorConfigFactory.fromFeatures({ config, features: storyFeatures }), html, JSDOM })`. This was verified in the spike.
4. **`resolveUploadNodes(lexical, payload, { allowRegisterPrefix })`** is load-bearing. It walks the tree, and for each `upload` node it takes `pending.src`:
   - If it is an own-Blob URL or a Payload media URL, parse `prefix` + `filename` and look for a `media` doc with that `prefix`/`filename` or `legacyUrl`. When found, set `relationTo: 'media'`, `value: id` and delete `pending`.
   - If not found, the URL passes `isOwnBlobUrl`, and its prefix is in `allowRegisterPrefix` (`stories/pending` for public saves, any own-store prefix for the ETL), **register** it as a `media` doc using the §7.4 recipe and link it.
   - If it is under `/assets/`, the ETL uploads it from `public/`. Public saves reject it.
   - Otherwise, a public save is **rejected** with "Images must be uploaded through the form". The ETL drops the node and reports it.
   - Afterwards it asserts that no node still has `pending`. The spike showed that an unresolved node fails validation with "invalid selection".
5. **`lexicalToTiptapHtml(content)`** calls `convertLexicalToHTML({ data, converters })` from `@payloadcms/richtext-lexical/html` on a doc fetched at `depth: 1`, so upload nodes emit `<img src=blobUrl alt>`. The token-edit page passes that HTML to Tiptap's `content`, and Tiptap's schema parses and sanitises it again.

**Write paths.**

- **Public submit:** Tiptap JSON → 1 → 2 → 3 → 4 → `payload.create`. Cover: `isOwnBlobUrl` + `stories/pending/` → register as media.
- **Public token edit:** same pipeline → `payload.update`.
- **Admin:** native Lexical editor. Inline images go through the UploadFeature, using the `media` client uploads.

**Rendering.** `components/stories/story-body.tsx` renders `<RichText data={story.content} converters={storyJsxConverters} className="story-content" />`. It is used on `/history/[slug]` and `/history/drafts/[token]`.

- The upload converter renders `<img src={doc.url} alt={doc.alt} loading="lazy">`.
- The link converter renders only `http:`, `https:` and `mailto:` hrefs, and anything else as plain text.
- The `.story-content` selectors in `globals.css:159-217` are retargeted to Lexical's output (`ul`/`ol` classes, `blockquote`, `hr`, `img` margins). The ProseMirror editor styles stay for Tiptap.
- `contentHtml` and `contentJson` are no longer stored. `dangerouslySetInnerHTML` is gone from the story pages.

**Behaviour change, deliberate.** A token edit to a `published` story sets `status = 'pending'` and leaves `publishedAt` alone. The story goes offline until it is re-approved. This closes stories map §6: a leaked edit link used to grant permanent publish rights. The copy in `draft-edit-form.tsx` STATUS_NOTE is updated to say so. The rule is enforced in `storyLifecycle` under `context.publicSubmission` (§3.11), not only in the action.

## 6. Auth and public token flows

- **Admin.** Payload login at `/admin/login`, with Payload's JWT cookie. The branded login is `admin.components.graphics.Logo`/`Icon` (the crest) plus `admin.css` brand variables. Middleware is deleted, and no `proxy.ts` is needed.
- **Custom route handlers and server actions that need staff:**
  ```ts
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })   // route handlers: req.headers
  if (!user) return new Response('Unauthorized', { status: 401 })
  ```
  Admin POST routes also require `Origin` to be in `config.csrf`. This is defence in depth: `payload.auth({ headers })` already runs `extractJWT`, which drops the cookie for a foreign `Origin`, but only because `csrf` is non-empty (§1 `csrfOrigins`). The manual check keeps working even if that config regresses.
- **Token-keyed writes (RSVP and stories).** Never update or delete by `where`. With `overrideAccess: true` an empty or `undefined` token would turn that into a multi-row write. Every token action does: require `typeof token === 'string' && token.length >= 32` (tokens are `randomUUID()`; WP3 confirms `min(length(edit_token))` on `langlang_legacy` before fixing the bound) → `find({ where: { editToken: { equals: token } }, limit: 1, depth: 0 })` → `update`/`delete` by `id`. Action `data` is built from an explicit allowlist of form keys, never from a spread of `formData`.
- **RSVP** (`app/(frontend)/events/actions.ts`, `events/rsvp/[token]/actions.ts`):
  - **Logic:** unchanged: `parseOccurrence`, `resolveMeal`, the cookie reuse only when `row.event === eventId`, and the 30-entry cap. Every Drizzle call becomes `payload.find`/`findByID`/`create`/`update`/`delete` with `overrideAccess: true` and `depth: 0`, following the token rule above.
  - **Validation added:** the length caps. A past-occurrence edit check is **not** added; behaviour stays as today.
  - **`getRsvpByToken`** moves out of the `'use server'` module into `lib/events-queries.ts` behind `import 'server-only'`, so it is no longer a publicly callable action.
  - **Cancel** keeps skipping `revalidatePath`. With `pg` there is no fetch cache, so freshness comes from `force-dynamic`. This is re-verified in WP3.
- **Story drafts:** `submitStory` and `updateDraftByToken` keep the honeypot (`website`), the required fields, and the `llcc_story_draft` cookie (180 days, not httpOnly). They use the §5 pipeline with `context: { publicSubmission: true }`. Tokens are generated by the collection hook and read back from the `create` result.
- **Event photo submit** (`submitEventPhoto`):
  - Checks unchanged: integer id, the event exists and is a past one-time event, `isOwnBlobUrl`, the `events/pending/` prefix, and text caps of 200.
  - Then `head(url)` gives `contentType` and `size`, and the action registers an `event-photos` doc with `{ filename: basename, prefix: 'events/pending', mimeType, filesize, focalX: 50, focalY: 50, event, status: 'pending', caption, submitterName }`.
  - A unique-filename violation means a resubmitted URL, and returns a friendly error.
- **`isOwnBlobUrl` hardening** (`lib/blob-url.ts`). The URL must be `https:` with host exactly `${storeId}.public.blob.vercel-storage.com` (the store id is lower-cased from `BLOB_READ_WRITE_TOKEN`). It must have no query or hash, a pathname under the expected prefix, no `..`, and a basename matching `[A-Za-z0-9._-]+`. Stories now use it for covers and inline images, replacing the weak `isBlobUrl`.
  - Phone filenames such as `IMG 1234 (1).jpg` would fail that pattern, so `lib/blob-client.ts` slugifies the basename (`slugify(name) + '.' + ext`, falling back to `image`) before every public `upload()`.
  - `resolveUploadNodes` looks up existing `media` by `legacyUrl`/`prefix`+`filename` **before** applying `isOwnBlobUrl`, so a token edit of a legacy story whose images have old-style names still resolves them.
- **Without a Blob token** (dev or tests): the public upload routes return 503 and the forms show "Uploads are unavailable". Tests mock `@vercel/blob`, and use `PAYLOAD_BLOB_FAKE=1` (§1) when the plugin itself must run. Every `@vercel/blob` call (`head`, `del`, `handleUpload`) passes `token: blobToken()` explicitly instead of relying on the implicit env read.

## 7. Uploads

### 7.1 Admin uploads

These are native Payload upload fields and bulk upload. With `clientUploads: true`, the browser PUTs straight to Blob through `POST /api/vercel-blob-client-upload-route`; access is the plugin default, `!!req.user`. That keeps uploads past the 4.5 MB function body limit. The plugin sets no `maximumSizeInBytes` (spike §3), so each upload collection's `upload` config sets an explicit cap, enforced in a `beforeValidate` hook on `filesize`: 15 MB for images and 25 MB for PDFs.

### 7.2 Public pending uploads (outside the plugin)

`/api/public/stories/upload` and `/api/public/events/upload` are the current routes, moved. Exposing the plugin's own client-upload route to anonymous users would let them mint tokens for every collection.

Each route uses `handleUpload` and allows only:

- a pathname starting with `stories/pending/` or `events/pending/`
- `image/jpeg`, `image/png` or `image/webp`
- at most 8 MB
- `addRandomSuffix: true`

`lib/blob-client.ts` points `uploadPublicStoryImage` and `uploadPublicEventPhoto` at the new paths. `/api/stories/upload` and `/api/events/upload` are deleted. Nothing external calls them, because they are only reached from our own pages.

### 7.3 Client-side optimisation

`optimiseImage` stays (`lib/blob-client.ts`) and is used by the public forms and by the `RecapPhotosField` admin component. Native admin uploads store originals in v1. The `<img>` tags on public pages stay as they are; no `next/image` is used for Blob URLs.

### 7.4 Registering an existing blob (ETL and public flows)

This recipe was verified in the spike:

- **Collection config:** `filesRequiredOnCreate: false` and `alwaysInsertFields: true`.
- **Data:** create with `data: { filename: <decoded basename incl. random suffix>, prefix: <dirname of pathname>, mimeType, filesize, width?, height?, focalX: 50, focalY: 50, alt: '' }`.
- **Never send `url`.** It is overwritten anyway, and with non-default focal values it triggers a remote re-fetch.
- **No image sizes** are generated, and none are configured.
- `filename` is unique **per collection**. A duplicate is a hard error, and the caller decides what to do with it (§12.4).

### 7.5 Blob deletion

The plugin deletes the blob when an upload doc is deleted. That covers documents, gallery, event photos (reject and remove) and media.

**Legacy blobs are shared with the rollback target.** Registered rows point at the same blobs the legacy app (the Instant Rollback target) and any preview read. Until decommission (§13.5), they must never be deleted by the new app. The plugin's `afterDelete` does not honour `skipCloudStorage`, and the adapter is not exported for wrapping, so `payload/plugins/guardLegacyBlobDeletes.ts` wraps the plugin as a config transform. It runs `vercelBlobStorage(...)`, diffs each upload collection's `hooks.afterDelete` before and after, and wraps only the hooks the plugin added:
- skip (and `req.payload.logger.info` the URL) when `doc.legacyUrl` is non-null and `LEGACY_BLOBS_RELEASED !== 'yes'`;
- skip every delete when `BLOB_DELETE_DISABLED === '1'` (set on Preview).
File replacement on a `legacyUrl` row is refused (§1), so the plugin's `afterChange` old-file delete never targets a legacy blob. `LEGACY_BLOBS_RELEASED=yes` is set in the decommission PR. `event-photos.int` covers both branches, with the plugin enabled through the fake token.

The plugin does nothing when a parent changes its media relation. Old `media` docs remain and can be deleted from the Media library.

Cleaning up orphaned media is out of scope. An "unused media" list filter is noted for later.

### 7.6 WP1 verification items

Each is recorded as an acceptance check, not assumed.

- **(a)** Whether `resizeOptions` on an upload collection actually rewrites the stored blob under `clientUploads: true`. `getFileContentRequirement` returns `'full'` (the server fetches the bytes), but the plugin's `afterChange` filters out files that carry a `clientUploadContext` before `handleUpload`, so the expected answer is **no**. Test it with the fake token. If it does rewrite, enable `resizeOptions: { width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }` on `media`, `gallery-photos` and `event-photos`. If not, leave it off, and keep the 15 MB cap plus the client-optimised custom paths.
- **(b)** With the plugin enabled (fake token): the delete hook removes exactly `prefix/filename` for a registered `media` row (collection prefix `''`), and `guardLegacyBlobDeletes` skips it when `legacyUrl` is set.
- **(c)** Whether a REST multipart `POST /api/event-photos` (server-side upload) still stores the file through the plugin when `clientUploads: true`. `RecapPhotosField` relies on it. Fallback: the component uses `@vercel/blob/client` against the plugin's own client-upload route. The uploader is a logged-in staff member, so the §7.2 concern about anonymous access does not apply.

## 8. Players sync on Payload

### 8.1 Data access

`lib/players/db.ts` exports `playerTables(payload)`, which returns:

```ts
{ players, player_aliases, player_seasons, player_sync_runs, players_honours } = payload.db.tables
```

Operators come from `import { eq, and, inArray, sql, count, desc } from '@payloadcms/db-postgres/drizzle'`. Nothing in `lib/players` imports the app-level `drizzle-orm`. Table keys are snake_case; **column keys are camelCase field names** (§3 conventions): `t.player_seasons.player` (SQL `player_id`), `t.player_aliases.nameKey`, `seasonOrder`, `isActiveDerived`, `displayName`, `updatedAt`, `createdAt`, and `t.players_honours._parentID`/`_order`. Raw `sql` fragments use the SQL names. `players-sync.int` asserts every column key `lib/players` uses is defined.

### 8.2 `syncPlayers(payload)`

Same steps and order as today. The pure `buildSyncPlan`, `uniqueSlug`, `combineCounts`, `planMerge` and `collectSeniorAggregates` are unchanged.

1. **Lock.** In a short `drizzle.transaction`:
   - `SELECT pg_advisory_xact_lock(hashtext('player-sync'))`
   - check that the latest run is not `running` and less than 10 minutes old
   - insert the `running` row

   Two concurrent starts serialise on the transaction lock and the second sees the first's row. This is safe under the Neon pooler, because the lock is transaction-scoped.
2. **Collect**, network only, before any write.
3. **Heal** orphaned `playhq` players that have no alias.
4. **Plan**, pure.
5. **New players and aliases.** Inserted in chunks of 200, outside the big transaction, with `source='playhq'`, `display_name`, and explicit `created_at`/`updated_at`. Aliases use `onConflictDoNothing({ target: t.player_aliases.nameKey })`.
6. **Wipe guard**, unchanged.
7. **One `drizzle.transaction`:**
   - delete all `player_seasons`
   - insert the new rows in chunks of 500
   - set `is_active_derived = false` for all players
   - set it to `true` for the active ids
   - bump `updated_at` on players whose active flag changed, because the sitemap reads `updated_at`
8. **Mark the run** `ok` or `error`.
9. **Revalidate** `/players` and `/players/[slug]` (page). The `/history` call is dropped.

Raw writes bypass hooks. That is intended, and it is why step 9 is explicit.

**Callers:**

- `app/api/cron/players-sync/route.ts` (unchanged contract: Bearer secret, 500 on error, 200 on locked).
- `app/api/admin/players-sync/route.ts` (staff auth + Origin check, `maxDuration = 300`, returns the `SyncResult` JSON). `maxDuration` is never set on Payload's `[...slug]` catch-all.

### 8.3 Merge (`payload/endpoints/mergePlayers.ts`)

The endpoint is `POST /api/players/:id/merge`, body `{ targetId }`. It requires `req.user` and rejects `sId === tId`. It loads both players with their honours and seasons through the Local API (`depth: 0`) and runs the pure `planMerge`. Then, in one `payload.db.drizzle.transaction`:

1. patch the target (photo/bio fill-if-empty, OR of `is_active_derived`, `updated_at`)
2. update `player_aliases` set `player` (SQL `player_id`) = target
3. move honours: update `players_honours` set `_parentID` = target, `_order` = `_order` + <target max `_order`>. The `_order` base, 0 or 1, is verified in WP5.
4. apply the season combines
5. delete the combined source rows
6. reassign the remaining source seasons
7. delete the source player and its leftover aliases

After the transaction it revalidates both slugs and returns `{ ok, targetId }`. `MergePlayerField` then navigates to the target's edit view.

### 8.4 PlayHQ refresh

`app/api/admin/playhq-refresh/route.ts` (POST, staff) runs:

- `revalidateTag('playhq', 'max')` (the Next 16 two-argument form)
- `revalidatePath('/fixtures')`
- `revalidatePath('/fixtures/[gameId]', 'page')`

`lib/playhq/**` is unchanged.

## 9. Custom admin components (`payload/components`)

All of these are client components unless marked RSC. They use Payload's `@payloadcms/ui` primitives (`Button`, `Banner`, `Pill`, `toast`) and its CSS variables, not Tailwind. Styles live in `payload/components/admin.css`, imported from `app/(payload)/custom.scss`. Brand accent: `--theme-elevation-*` is untouched, and `--color-success-*` and the button primary are set to gold `#F5B700` on `#0B0B0D`.

| Component | Mounted at | Exact behaviour |
|---|---|---|
| `Logo`, `Icon` | `admin.components.graphics` | Crest `/assets/branding/logo.png` in a white rounded tile. The Logo adds the `club.shortName` wordmark, read from the defaults module (the login screen has no DB access guarantee). |
| `Dashboard` (RSC) | `beforeDashboard` | Count cards linking to the lists, built from a registry (`payload/components/dashboardCards.ts`) that each WP appends to for its own collections: WP2 documents, gallery photos, sponsors, people; WP3 upcoming events, **pending event photos**; WP4 published stories, **pending stories**; WP5 players. No card references a collection that is not yet registered. Each count is a `payload.count` (overrideAccess, with `where`). Also the `PlayHQRefreshButton` and today's "How this site works" help text, verbatim. |
| `PlayHQRefreshButton` | inside `Dashboard` | POSTs `/api/admin/playhq-refresh`, shows a toast "Fixtures and ladder will refetch on next view", and disables itself while pending. |
| `PlayerSyncPanel` | `players.admin.components.beforeList` | Shows the last `player-sync-runs` row (status pill, finishedAt, playersCreated, seasonRows, error text) fetched from REST. A "Run sync now" button POSTs `/api/admin/players-sync`, shows a spinner for up to 300 s, toasts the result (`ok`: "Synced N rows, M new players"; `locked`; `error`), then calls `router.refresh()`. |
| `MergePlayerField` | `players.fields.merge` (ui) | Select a target player from a searchable list (REST `players?where[id][not_equals]=…&limit=0&select[displayName]=true`). A confirm modal explains that this player is deleted and its seasons, aliases and honours move to the target. It then POSTs `/api/players/:id/merge` and redirects to `/admin/collections/players/<targetId>`. It is hidden on create. |
| `RsvpSummaryField` | `events.fields.rsvpSummary` (ui) | Uses `useDocumentInfo().id` and fetches `event-rsvps?where[event][equals]=id&pagination=false&depth=0&sort=occurrenceDate`. It ports today's admin event page: grouped per occurrence (formatted with `formatEventDateTime`), "Going (N)" and "Not going (N)" lists, a tally bar, meal counts plus a "no dinner" count, and a delete button per RSVP (REST DELETE, confirm, refetch). Hidden on create. |
| `PendingPhotosField` | `events.fields.pendingPhotos` (ui) | Fetches `event-photos?where[and][0][event][equals]=id&where[and][1][status][equals]=pending`. Thumbnail grid with submitter and caption. **Approve** sends `PATCH {status:'approved'}`. **Reject** sends `DELETE` after a confirm, and the blob goes with it. Rendered only when pending photos exist. |
| `RecapPhotosField` | `events.fields.recapUpload` (ui) | Ports `BulkImageUploader`: drag-drop multi-select, a per-file state machine, concurrency 3, retry, and dedupe by name, size and mtime. Each file goes through `optimiseImage(maxEdge 1600)` and is then POSTed as multipart to `/api/event-photos` with `_payload = { event: id, status: 'approved' }`. Optimised files are well under 4.5 MB; anything still over 4 MB after optimisation is refused with a message. It refreshes the `photos` join on completion. The `admin.condition` shows it only for a one-time event whose `getOneTimeEventDateTime(event) < nowAsEventClock()`, the same past-event test as `submitEventPhoto`. |
| `RsvpCountCell`, `PendingCountCell` | `events` list columns (ui fields with `admin.components.Cell`) | Fetch `event-rsvps?where[event][equals]=<row id>&where[response][equals]=yes&limit=1&depth=0` and show `totalDocs`. This keeps the commit `0555d48` semantics: only `yes`, across all occurrences. The pending-photos count works the same way. |
| `PendingQueueBanner` | `stories` and `event-photos` `beforeList` | If any pending items exist, shows "N awaiting review — Show pending" linking to the list with `?where[status][equals]=pending`. |
| `StoryModerationControls` | `stories.admin.components.edit.beforeDocumentControls` | Buttons depend on status. Pending gets **Approve** and **Reject**. Published gets **Unpublish**, which sets `rejected`. Rejected gets **Restore to review**, which sets `pending`. Each calls `useForm().submit({ overrides: { status } })`, so unsaved edits in the form are saved with the status change rather than discarded by a separate PATCH. The lifecycle hook sets the timestamps. |
| `StoryLinksField` | `stories.fields.submitterLinks` (ui) | Staff-only, read-only. Shows `/history/drafts/<viewToken>` and `/history/drafts/<editToken>/edit` with copy buttons. Hidden on create. |

After any component path changes, run `payload generate:importmap` and commit `app/(payload)/admin/importMap.js`.

## 10. Next 16 / React 19 upgrade checklist

1. **pnpm.** Delete `package-lock.json`, add `pnpm-workspace.yaml` with `onlyBuiltDependencies: [sharp, esbuild, unrs-resolver]`, add `"packageManager"` and `"engines": { "node": ">=20.9" }`, and pin the Node version on Vercel.
2. **Async request APIs.** Run `npx @next/codemod@canary next-async-request-api` on the surviving public pages, then review. It covers the 21 `cookies()` calls (most admin ones are deleted) and 13 pages' `params`/`searchParams`, including the six `generateMetadata`s.
3. **React 19.**
   - `useFormState` → `useActionState` from `react`. Only the forms that survive matter; the old admin ones are deleted.
   - `@types/react@19` and `npx types-react-codemod preset-19`.
   - **Auto-reset fix** for the four surviving forms that return validation errors: `rsvp-form.tsx`, `rsvp-edit-form.tsx`, `draft-edit-form.tsx` and `submit-story-page-client.tsx`. Each switches to `onSubmit` + `preventDefault` + `startTransition(() => action(formData))`, so a failed submit keeps the user's input.
4. **Cache APIs.**
   - Remove the 17 `unstable_noStore` calls, which are redundant with `force-dynamic`. Use `await connection()` only where a page has no `force-dynamic`.
   - Use the two-argument `revalidateTag`.
   - Leave `cacheComponents` off.
5. **Layouts and error pages.**
   - `app/layout.tsx` → `app/(frontend)/layout.tsx`, which owns `<html lang>`, fonts, `globals.css`, `SiteNav`, `SiteFooter` and `<main id="main">`.
   - Delete `SiteChrome`.
   - `app/error.tsx` → `app/(frontend)/error.tsx`.
   - Add `app/(frontend)/not-found.tsx`, styled like the error card.
   - Unmatched top-level URLs: check whether `app/global-not-found.tsx` with `experimental.globalNotFound` works in 16.3.8 (WP1). If it does not, use the fallback `app/(frontend)/[...notFound]/page.tsx` that calls `notFound()`. More specific routes, such as `/admin` and `/api`, still win.
6. **Lint.** Remove `next lint` and run `npx @next/codemod@canary next-lint-to-eslint-cli`. That gives ESLint 9 flat config with `eslint-config-next@16`, ignoring `app/(payload)/admin/importMap.js`, `payload-types.ts` and `payload/migrations/**`. The script becomes `"lint": "eslint ."`.
7. **next.config.mjs.**
   ```js
   const canonical = process.env.CANONICAL_HOST ?? 'langlangcricketclub.com'
   const redirectHosts = (process.env.REDIRECT_HOSTS ?? 'www.langlangcricketclub.com,lang-lang-cricket-website.vercel.app').split(',')
   // same redirects() as today, built from these; /history/players redirects unchanged
   export default withPayload(nextConfig, { devBundleServerPackages: false })
   ```
   Do not add `serverExternalPackages`: jsdom and sharp are already in Next's built-in list (spike §5). Do not add `images.remotePatterns` either, because Blob images are plain `<img>`.
8. **tsconfig.json.**
   - Add the path `"@payload-config": ["./payload.config.ts"]`; `@/*` is unchanged.
   - Keep `jsx` as Next 16 rewrites it.
   - Exclude `payload/migrations/*.json`.
9. **Tailwind.**
   - `content` becomes `['./app/(frontend)/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}']`. That excludes `app/(payload)` and `payload/components`.
   - Fix `components.json`: `tailwind.css` → `app/(frontend)/globals.css`, `iconLibrary` → `hugeicons`, and remove the `hooks` alias.
10. **Route handlers.** The cron route keeps its path. The upload routes move (§7.2). `app/api/{admin,gallery}/upload` are deleted.
11. **Dependencies.**
    - Remove `bcryptjs`, `jose`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` and `react-easy-crop`. The last of these is replaced by Payload's crop.
    - Keep `@tiptap/*` v2, `jsdom` and `@vercel/blob`.
    - Add `payload`, the `@payloadcms/*` packages, `sharp`, `graphql` (a Payload peer, even with GraphQL disabled) and `server-only`.

## 11. Environment variables and build pipeline

### 11.1 `.env.example`

Re-add the file with `git add -f`, because `.gitignore` covers `.env*`.

```
# Payload database — NEVER the production URL on a dev machine.
DATABASE_URI=postgres://postgres:postgres@127.0.0.1:54329/langlang_dev
DATABASE_URI_UNPOOLED=                 # prod/preview only: direct (non -pooler) Neon URL for `payload migrate`
DATABASE_POOL_MAX=5
PAYLOAD_SECRET=                        # 32+ random bytes
PAYLOAD_PUSH=true                      # dev only; ignored in production and refused for non-local hosts
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
BLOB_READ_WRITE_TOKEN=                 # NEVER set locally (assertSafeEnv refuses it) → files go to ./media etc.
PAYLOAD_BLOB_FAKE=                     # tests only: '1' enables the plugin with a fake token + mocked @vercel/blob
BLOB_DELETE_DISABLED=                  # Preview only: '1' makes every plugin blob delete a logged no-op
LEGACY_BLOBS_RELEASED=                 # set to 'yes' only by the decommission PR (§13.5)
CRON_SECRET=
PLAYHQ_ORG_ID=484ced51-403a-466c-9a94-bd95eedf7319
PLAYHQ_CLIENT_ID=
PLAYHQ_TENANT=ca
CANONICAL_HOST=langlangcricketclub.com
REDIRECT_HOSTS=www.langlangcricketclub.com,lang-lang-cricket-website.vercel.app
PROD_DATABASE_HOST=                    # a hostname, not a secret: set on Vercel for ALL envs; the build refuses when empty
# Operator shell only (never in a file, never on Vercel):
ALLOW_REMOTE_DB=                       # 'yes' lets assertSafeEnv accept a non-local DATABASE_URI
ALLOW_REMOTE_BLOB=                     # 'yes' lets assertSafeEnv accept BLOB_READ_WRITE_TOKEN
# One-off scripts only (never set on Vercel):
INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=
LEGACY_DATABASE_URL=                   # ETL source; the UNPOOLED (non -pooler) URL; read-only transactions
PAYLOAD_ETL=                           # 'true' only while running the ETL (enables allowIDOnCreate)
```

**Vercel scoping.** `DATABASE_URI`, `DATABASE_URI_UNPOOLED` and `BLOB_READ_WRITE_TOKEN` are set for **Production only**. Preview gets its own `DATABASE_URI`/`DATABASE_URI_UNPOOLED` (a manually created Neon branch; the Neon Vercel integration is not used, because it injects `DATABASE_URL*`), a **separate preview Blob store** token, and `BLOB_DELETE_DISABLED=1`. Development gets none of them, so `vercel env pull` cannot bring production credentials to a laptop.

**Removed:** `AUTH_SECRET`, `ADMIN_PASSWORD_HASH` and `LEGACY_BLOB_BASE_URL` (replaced by the `legacyUrl` read rule, §1). During WP1–5 the transitional legacy `db/` reads `LEGACY_DATABASE_URL` (local `langlang_legacy`, host-asserted), not `DATABASE_URL`. `DATABASE_URL` and the legacy `db/` are gone after WP6; `LEGACY_DATABASE_URL` stays for the ETL. The README is rewritten in WP6, including the Node ≥ 20.9 requirement and the two-DB local setup.

### 11.2 Local databases

These are on the embedded or docker Postgres at `127.0.0.1:54329`:

| DB | Purpose |
|---|---|
| `langlang_dev` | push mode |
| `langlang_mig` | migrations only, used to check that the committed migrations replay cleanly. Push and migrate are never mixed on one DB (spike pattern `spike` / `spike_mig`). |
| `langlang_test` | integration tests |
| `langlang_legacy` | a restored `pg_dump --schema=public` of production for ETL rehearsal. The human operator produces and restores the dump; agents never handle production credentials. |

### 11.3 Migrations

- **Creating them.** After a schema change, run `pnpm payload migrate:create <name>`. It diffs against the last migration snapshot, not the DB. Commit both `.ts` and `.json`.
- **The first migration** (`payload/migrations/20261003_init.ts`) starts with:
  ```ts
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "payload"`)
  ```
  Payload only creates the schema when it creates the database itself, and on Neon the database always exists (spike §1).
- **Check.** `pnpm check:migrations` drops and recreates `langlang_mig`, runs `payload migrate`, then `payload migrate:status`. Every migration must show as Ran. The script **hard-codes** `postgres://postgres:postgres@127.0.0.1:54329/langlang_mig` and ignores the environment's `DATABASE_URI`.
- **Destructive CLI commands** (`migrate:fresh`, `migrate:down`, `migrate:reset`; `dropDatabase` runs `drop schema if exists payload cascade`) are covered by `assertSafeEnv()` in `payload.config.ts`, because the CLI loads the config.

### 11.4 Scripts (`package.json`)

```json
"dev": "next dev",
"build": "next build",
"vercel-build": "node scripts/vercel-build.mjs",
"start": "next start",
"lint": "eslint .",
"test": "vitest run --project unit",
"test:int": "vitest run --project int",
"payload": "payload",
"generate": "payload generate:types && payload generate:importmap",
"check:generated": "pnpm generate && git diff --exit-code payload-types.ts 'app/(payload)/admin/importMap.js'",
"check:migrations": "node scripts/check-migrations.mjs",
"seed:admin": "payload run payload/scripts/seed-admin.ts",
"seed:club": "payload run payload/scripts/seed-club.ts",
"etl": "PAYLOAD_ETL=true payload run payload/scripts/etl-legacy.ts --"
```

### 11.5 Vercel build

The Vercel build command is `pnpm vercel-build`. `scripts/vercel-build.mjs` does the following:

0. Refuse to build when `PROD_DATABASE_HOST` is empty (the guard below would otherwise fail open).
1. If `VERCEL_ENV === 'production'`: run `payload migrate` with `DATABASE_URI=$DATABASE_URI_UNPOOLED`, then `next build`.
2. If `VERCEL_ENV === 'preview'`: refuse when the `DATABASE_URI` or `DATABASE_URI_UNPOOLED` host equals `PROD_DATABASE_HOST`, comparing with any `-pooler` suffix stripped from both sides. Also refuse when `BLOB_DELETE_DISABLED !== '1'`. Previews must use a Neon branch. Otherwise migrate the branch and build.
3. Otherwise: `next build` only.

`payload-types.ts` and `importMap.js` are committed. `check:generated` is part of every WP's acceptance checks.

**Previews** are behind Vercel Deployment Protection (prerequisite, not optional), use the preview Blob store, and derive `serverURL`/`csrf` from `VERCEL_BRANCH_URL`/`VERCEL_URL` (§1).

**Before cutover**, the production Vercel project keeps the legacy app, and `feat/payload-cms` (a branch of the same `origin` repo) is **not merged to `main`**. A merge would trigger a production build that runs `payload migrate` against production and auto-assigns the apex domain, an unplanned cutover with no ETL. The new app is deployed only as previews against a Neon branch until §13, and the production deployment is created by `vercel deploy --prod --skip-domain` inside the cutover window (§13.2).

### 11.6 Scripts replaced

- `scripts/seed.ts`, `reset-sponsors.ts` and `add-gallery-photos.ts` (which writes to production by default) are **deleted**.
- `add-gallery-photos` is reborn as `payload/scripts/add-gallery-photos.ts`.
- Every `payload run` script imports `payload/scripts/_guard.ts`. The guard:
  - parses `DATABASE_URI`
  - requires `--target <host>/<db>` to equal it exactly
  - requires `--confirm` for any write
  - additionally requires `ALLOW_REMOTE_DB=yes` when the host is not local
  - prints the target and sleeps 5 s before writing
- `_guard.ts` is the script-level layer. The environment-level layer is `assertSafeEnv()` in `payload.config.ts` (§1), which also covers `next dev/start/build` and the Payload CLI.

## 12. Legacy ETL (`payload/scripts/etl-legacy.ts`)

### 12.1 Invocation

```
pnpm etl --target 127.0.0.1/langlang_rehearsal [--dry-run] [--confirm] [--only events,event-rsvps] \
         [--update [--reconcile-deletes]] [--report tmp/etl-report.json]
```

- **Source.** `LEGACY_DATABASE_URL` through its own `pg.Pool`, schema `public`. Read-only is enforced three ways, because a `SET` on a pool applies to one client and PgBouncer transaction mode drops session `SET`s:
  - the URL must be the **unpooled** host; a hostname containing `-pooler` is refused;
  - `pool.on('connect', c => c.query('SET default_transaction_read_only = on'))`, and every read runs inside `BEGIN READ ONLY … COMMIT`;
  - before the first read the script asserts `SHOW transaction_read_only` returns `on`.
- **Timestamps.** Type parser 1114 (`timestamp without time zone`) becomes `new Date(v.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1') + 'Z')`. Postgres returns up to 6 fractional digits, and they are truncated to 3 before parsing. This matches Drizzle's read semantics. The pg default would read the value in the process's local timezone and shift every date.
- **Target.** Payload via `getPayload({ config })`, with `PAYLOAD_ETL=true` so `allowIDOnCreate` is on.
- **Writes** use `overrideAccess: true` and `context: { etl: true, disableRevalidate: true }`. Every hook keeps supplied values under `context.etl` (§3 conventions table).
- **Code layout.** `etl/{source,media,report}.ts` and the per-collection `etl/steps/<collection>.ts` are written in the WP that introduces each collection (WP2–WP5), so each WP's parity checks run against ETL'd `langlang_legacy` data. WP6 adds the orchestrator, sequences, the timestamp post-pass and verify.
- **Dry run** reads, classifies and plans, then writes a report. It makes no DB or Blob writes.
- **Real runs** without `--confirm` are refused.

### 12.2 Order

Foreign keys force this order. Each step is idempotent.

1. **`site-settings`** ← `site_settings.sponsorCarouselTiers`. Other keys are reported.
2. **`club` global**, seeded from defaults unless it already exists. Then `logo`, `hero` and `ogImage` are uploaded from `public/assets/branding` and `public/og-image.jpg`.
3. **`documents`** (id kept), file per §12.4.
4. **`gallery-photos`** (id kept; `sortOrder` and `caption` kept).
5. **`sponsors`** (id kept). `logo` becomes a media relation. `sortOrder` takes the rank of the legacy id within its tier.
6. **`people`** ← `committee_contacts` (id kept). `photo` becomes a media relation. `section` is copied verbatim, with unknown values set to `committee`.
7. **`announcements`** (id kept).
8. **`events`** (id kept):
   - `coverImageUrl` → media
   - `mealOptions[]` → `[{label}]`
   - `dayOfWeek` → string
   - dates already at UTC midnight, so the hook short-circuits
9. **`event-rsvps`** (id kept). `editToken` and `occurrenceDate` are copied exactly. **Orphans**, rows whose `event_id` has no event, are **skipped and reported**. They stay in `public.*`; nothing is purged.
10. **`event-photos`** (id kept), file per §12.4, status and submitter kept. Orphans are skipped and reported.
11. **`stories`** (id kept). Slug, status, both tokens, `authorEmail` and `submittedByAdmin` are kept. Content goes from `contentHtml` (fallback: `renderStoryHtml(contentJson)`) through `normaliseStoryHtml`, `htmlToLexical` and `resolveUploadNodes`, with ETL mode registering any own-store prefix. `coverImageUrl` becomes media. `excerpt` is kept verbatim.
12. **`players`** (id kept), plus `honours` from `player_honours` ordered by `sortOrder`, and `photo` as media. `slug`, `source`, `displayName` and `isActiveDerived` are kept (`context.etl`).
13. **`player-aliases`.** The legacy PK is text, so new serial ids are fine. Upsert by `nameKey`.
14. **`player-seasons`.** Bulk-inserted via drizzle in chunks of 500, ids kept, with `.onConflictDoNothing({ target: t.player_seasons.id })`. A partially failed run therefore resumes cleanly; there is no row-count shortcut.
15. **`player-sync-runs`** (id kept).
16. **Timestamp post-pass.** For every row written, a drizzle `UPDATE <table> SET created_at = legacy.created_at, updated_at = COALESCE(legacy.updated_at, legacy.created_at)`. Story `published_at`/`reviewed_at` are written directly in step 11. The Local API sets `createdAt` to now, and the sitemap, "latest announcement" and gallery OG all depend on the original timestamps. Microsecond legacy values truncate to milliseconds, which is harmless.
17. **Sequences.** For each table that received explicit ids:
    ```sql
    SELECT setval(pg_get_serial_sequence('"payload"."<t>"','id'),
                  GREATEST(COALESCE((SELECT MAX(id) FROM "payload"."<t>"),0),
                           <legacy sequence last_value>) + 1, false);
    ```
    The legacy `last_value` is read from the source. It stops a new Payload row from reusing the id of a deleted legacy row, which a phone's `llcc_rsvps` cookie or an `llcc_ann_dismissed` cookie might still hold. There is no id gap: public writes are frozen during cutover (§13.2), so there is no delta pass.
18. **Verify.** This runs as part of every non-dry run, and also standalone as `payload/scripts/verify-cutover.ts`:
    - per-table counts, legacy minus skipped versus target
    - every story slug, player slug, event id, RSVP token and story token present
    - `occurrenceDate.toISOString()` equality for every RSVP
    - story plain-text equality (whitespace-normalised) between legacy `contentHtml` and `convertLexicalToHTML(content)`
    - inline image counts equal, minus reported drops
    - **for every registered row**, the plugin-equivalent URL (`generateURL` from `@payloadcms/storage-vercel-blob`, with the collection's prefix, the stored `prefix` and `filename`, against the store base URL) equals `legacyUrl`. No HTTP needed; this also catches `encodeURIComponent(basename)` differing from the legacy encoding, and any prefix nesting
    - field-for-field equality for the preserved fields: slugs, tokens, `submittedByAdmin`, `publishedAt`/`reviewedAt`, `source`, `displayName`, `sortOrder`, `createdAt`
    - with a token: media URL reachability (HEAD) sampled at 20

### 12.3 Ids and idempotency

- `allowIDOnCreate` is honoured only when `PAYLOAD_ETL=true`, so the running app never accepts client-chosen ids.
- For each id-preserving collection the ETL does `findByID`. If the row exists it is skipped, or updated in place with `--update`. Otherwise it is created with `data.id`.
- `--reconcile-deletes` (only with `--update`) deletes target rows whose id is ≤ the legacy max id and missing from legacy, and reports Payload-native rows (id > legacy max). It exists for the re-attempt fallback (§13.4), not the normal cutover.
- Media is deduplicated on `legacyUrl`, which is unique, and aliases on `nameKey`.
- A re-run therefore never duplicates anything. A partial run can be resumed with `--only`. Skip-if-exists idempotency assumes the source did not change between runs; the frozen cutover window guarantees that.

### 12.4 Media import: the 3-way branch (`payload/scripts/etl/media.ts`)

`classify(url)` returns one of:

| Class | Rule | Action |
|---|---|---|
| empty | `''`/null | relation null |
| own-blob | `https://<storeId>.public.blob.vercel-storage.com/<path>`. `storeId` comes from `BLOB_READ_WRITE_TOKEN`, or from `--blob-store-id` in dry runs. | **Register** using §7.4 in the target collection: `documents`, `gallery-photos` or `event-photos` for those tables, `media` for everything else. `prefix = dirname(path)`, `filename = decodeURIComponent(basename)`. `mimeType` comes from the extension. `filesize` comes from `head()` when a token is present, otherwise null. `legacyUrl = url`. No bytes move. |
| local-asset | starts with `/assets/` | **Upload** from `public${url}` with `payload.create({ filePath })`. Payload renames on collision, and the bytes go to Blob (prod) or disk (dev). `legacyUrl = url`. A missing file is reported and the relation set null. |
| other | anything else (a foreign store, http, data:) | **Flag**: relation null, recorded in the report with table, id, field and url. |

A `filename` uniqueness collision on register (the same basename under two prefixes), or a `documents`/`gallery-photos`/`event-photos` URL whose path is not under that collection's prefix (it would be nested, §1), falls back to downloading the blob and uploading it through Payload, which renames it. The fallback is reported. It only happens on a real run with a token, and its `legacyUrl` is set so the read rule (§1) keeps showing the original until decommission. Registration creates pass no `url` and are checked by verify (§12.2 step 18).

### 12.5 Rehearsal (WP6 acceptance)

1. Restore the human-provided dump into `langlang_legacy`.
2. `payload migrate` against `langlang_rehearsal`.
3. `pnpm etl --target 127.0.0.1/langlang_rehearsal --dry-run`, then with `--confirm`.
4. Run it again and confirm zero writes.
5. `verify-cutover` passes.
6. `next start` against it and walk the smoke list (§13.3).

## 13. Production cutover runbook (human-run; agents prepare, never execute)

### 13.1 Prerequisites

- The rehearsal (§12.5) passed within the last 48 h, on a dump from that week.
- The preview deployment of the new app is green against a manually created Neon branch made from production, behind Vercel Deployment Protection, with the preview Blob store and `BLOB_DELETE_DISABLED=1` (§11.5).
- **`feat/payload-cms` is not merged to `main`.** In the Vercel project settings, auto-assignment of custom production domains is **turned off** before the window, so no production build can take the apex domain by itself.
- **Firewall rules are live:** a per-IP rate limit on `POST /api/users/login` and `/api/users/forgot-password` (lockout DoS, §3.1); and a prepared, disabled custom rule "deny every `POST` to the production hosts" for the write freeze (server actions are POSTs to page URLs; the cron is a GET).
- These Vercel env vars are set, **scoped to Production only**, and unused until the new deployment is promoted:
  - `DATABASE_URI` (the pooled `-pooler` URL) and `DATABASE_URI_UNPOOLED`
  - `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL` (the apex URL), `CANONICAL_HOST` and `REDIRECT_HOSTS`
  - `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET` and `PLAYHQ_*`, all unchanged
  - `PROD_DATABASE_HOST` is set for all environments (it is a hostname, not a secret).
- The operator's machine has the worktree **without** `.env.local`. Production credentials live only in the one-off shell below.

### 13.2 Steps

Run these in a low-traffic window, around 30 minutes. The operator shell exports `ALLOW_REMOTE_DB=yes ALLOW_REMOTE_BLOB=yes` plus the production `DATABASE_URI` (unpooled), `LEGACY_DATABASE_URL` (the same unpooled URL) and `BLOB_READ_WRITE_TOKEN`. Nothing is written to a file.

1. Announce the admin freeze, so the committee stops editing in the old `/admin`.
2. **Freeze public writes:** enable the Firewall "deny POST" rule. RSVPs, story submits and edits, and photo submits on the legacy site fail with a block page for the duration. The ETL source can no longer change, so there is no delta pass and no id gap.
3. Record the Neon restore point (timestamp) for the production branch.
4. `pnpm payload migrate`. This creates schema `payload` and the tables. `public.*` is untouched.
5. `pnpm seed:admin --target <host>/<db> --confirm`. Even before this, first-register is closed by the `users` `beforeOperation` hook (§3.1).
6. ETL dry run: `pnpm etl --target <host>/<db> --dry-run`. Review the report: orphans, flagged media, collisions, prefix fallbacks.
7. The same command with `--confirm`. Then `verify-cutover`, which must pass, including the per-row URL equality check.
8. **Create the production deployment** from the cutover commit with `vercel deploy --prod --skip-domain`. Its build runs `payload migrate` (a no-op now). Smoke-test the admin login and two public pages on its deployment URL.
9. **Promote that specific deployment** (`vercel promote <deployment-url>`) to the apex domain. The cron in `vercel.json` is unchanged, so the next 17:00 UTC sync runs on Payload.
10. Disable the Firewall "deny POST" rule.
11. Run the smoke list (§13.3) on the apex domain.
12. Fast-forward `main` to the cutover commit, so the next push to `main` cannot redeploy the legacy app over Payload. Leave production-domain auto-assignment off until the stability period ends (§13.5). Instant Rollback stays the rollback path.
13. Invite the committee: admins create the other users in the Payload admin.

### 13.3 Smoke list

- Home, sponsors, gallery, documents, contact, people and announcements render as before. Compare with the pre-cutover screenshots captured in WP2.
- `/events`, an `/events/<old id>`, and an RSVP from a phone that RSVP'd before cutover. The cookie must be recognised and the existing answer prefilled.
- An old `/events/rsvp/<token>` link opens and edits.
- `/history/<old slug>` with inline images; an old `/history/drafts/<viewToken>` and its edit link.
- `/players/<slug>` with seasons and honours. `/fixtures`.
- In the admin: log in, edit an announcement and see it live, approve a pending photo, trigger player sync, and refresh PlayHQ.
- `sitemap.xml` lists events, stories and players with their original lastModified dates.

### 13.4 Rollback

- **Trigger:** any smoke failure that cannot be fixed forward within 30 minutes.
- **Action:** in Vercel, "Instant Rollback" to the previous production deployment, the legacy app. It reads `public.*`, which the new app never wrote. Its images are intact because the new app never deletes a blob that has a `legacyUrl` (§7.5). If `main` was already fast-forwarded (step 12), revert it to the legacy commit too.
- **Lost on rollback:** writes made in Payload after step 9, such as new RSVPs, stories, photos and admin edits.
- **Mitigation:** `payload/scripts/export-since.ts --since <step-9 time>` prints those rows as CSV so they can be re-entered by hand. Re-entry is out of scope.
- **Before a second attempt**, the `payload` schema is **not** reusable: skip-if-exists would keep the first attempt's stale rows, and Payload-native rows from the failed window would remain. The operator runs `payload/scripts/reset-payload-schema.ts --target <host>/<db> --confirm` (guarded by `_guard.ts` and `ALLOW_REMOTE_DB`; it runs `DROP SCHEMA payload CASCADE` and nothing else, and refuses any schema name other than `payload`), then repeats §13.2 from step 1. The fallback, when the schema must be kept, is a full `pnpm etl --update --reconcile-deletes`. Blobs uploaded natively during the failed window stay as orphans in the store; that is accepted.

### 13.5 Decommission (≥ 30 days after a stable cutover; separate PR)

- Drop the `public.*` legacy tables, with a final `pg_dump` archived first.
- Remove `LEGACY_DATABASE_URL` and the ETL script, or keep it in `payload/scripts/legacy/` for the template's "importing from another system" docs.
- Remove `PAYLOAD_ETL`.
- Set `LEGACY_BLOBS_RELEASED=yes` (blob deletes for `legacyUrl` rows resume; the legacy app is no longer a rollback target) and drop the `legacyUrl` file-replace guard.
- Re-enable production-domain auto-assignment.

## 14. Query layer (`lib/*-queries.ts`)

- **Types.** `lib/domain.ts` defines the shapes the components already consume (`Event`, `EventPhoto`, `Story`, `Player`, `PlayerSeason`, `Sponsor`, `Person`, `GalleryPhoto`, `DocumentItem`, `Announcement`). These were inferred from Drizzle before and are now hand-written. Image fields resolve to URL strings (`coverImageUrl`, `photoUrl`, `logoUrl`, `url`), so presentational components are unchanged.
- **Mappers.** `lib/payload/mappers.ts` converts Payload docs (from `payload-types.ts`) into those domain types.
- **Access.** `lib/payload/client.ts` exports `getPayloadClient = cache(() => getPayload({ config }))`.

| Module | Functions (signatures kept) | Local API |
|---|---|---|
| `events-queries.ts` | `listUpcomingItems`, `listPastOneTimeEvents`, `getEventById`, `getEventPhotosPublic`, `getRsvpTally`, `listGoingCounts`, `getRsvpByToken` (server-only), `getDeviceRsvp` | `find`/`findByID events pagination:false depth:1 joins:false` (the `rsvps`/`photos` joins would load tokens, emails and pending photos under `overrideAccess`); photos `where status=approved, sort sortOrder,id`; tallies via `payload.count` per response, and `listGoingCounts` via `find event-rsvps where response=yes and occurrenceDate>=nowAsEventClock() select {event, occurrenceDate}` grouped in JS. Every comparison against "now" uses `nowAsEventClock()` (wall-clock-as-UTC), never `new Date()` |
| `stories-queries.ts` | `listPublishedStories`, `getPublishedStoryBySlug`, `getStoryByEditToken`, `getStoryByViewToken` | `where status=published` / token `where`, `depth: 1` (cover and upload nodes) |
| `players/queries.ts` | `listPlayers`, `getPlayerProfile` | `find players where hidden=false depth:1 joins:false`; `find player-seasons select {player, seasonName, seasonOrder, teamName} pagination:false`. The profile is wrapped in React `cache()` so `generateMetadata` and the page share one fetch. |
| `announcements-queries.ts` | `getLatestAnnouncement`, `listPublishedAnnouncements` | `where published=true sort -createdAt` |
| `site-settings.ts` | `getSponsorCarouselTiers` (+ the pure `normaliseTiers` and `selectCarouselSponsors`, split into `site-settings-core.ts`) | `findGlobal site-settings` |
| new `content-queries.ts` | `listSponsors`, `listGalleryPhotos(limit?)`, `getGalleryOgPhoto`, `listDocuments`, `listPeople(section?)` | the existing orderings (§3) |
| `club.ts` | `getClub()` | `findGlobal club` merged over defaults |
| `app/sitemap.ts` | — | `find … pagination:false depth:0 joins:false select {slug|id, updatedAt|createdAt}` with the same try/catch fallback. **Filters, as today (`app/sitemap.ts:35,39`):** players `where hidden=false`, stories `where status=published`. Included in the query `where` assertion test. |

`lib/structured-data.ts` and `lib/site-metadata.ts` take club values from `getClub()`, passed in as arguments so they stay pure and testable. `CLUB_EMAIL`, `SITE_URL` and `SITE_NAME` become defaults only. The pure libraries are unchanged: `event-occurrences`, `events-meal`, `events-format`, `rsvp-cookie`, `people`, `slugify`, `announcements-format`, `lib/playhq/**`, and `lib/players/{plan,merge,season-math,view}`. The type imports from `@/db/schema` are retargeted to `lib/domain.ts`.

## 15. Test strategy

**Harness.** Vitest 3. `vitest.config.ts` defines `projects`:

- **`unit`:** node env, `tests/**/*.test.ts` with `exclude: ['tests/int/**', 'tests/_pending/**']` (the include glob would otherwise also match `*.int.test.ts`). It never connects to a database. `vi.mock('@/lib/payload/client')` is backed by `tests/helpers/payload-fake.ts`, an in-memory store supporting `find({ where (equals, not_equals, in, greater_than_equal, and), sort, limit, select })`, `findByID`, `create`, `update`, `delete`, `count`, `findGlobal` and `updateGlobal`, with `lastWrite` accessors. It replaces the roughly 15 hand-rolled Drizzle chains and the two duplicated `eq`/`and` evaluators.
- **`int`:** `tests/int/**/*.int.test.ts`, with `fileParallelism: false` and `globalSetup: tests/int/setup.ts`. The setup:
  - **refuses to run** unless `DATABASE_URI` matches `^postgres://[^@]+@(127\.0\.0\.1|localhost):\d+/[a-z_]+_test$`
  - drops and recreates schema `payload`
  - runs `payload migrate`, which also proves the migrations are complete
  - lets each file truncate its collections in `beforeAll` through `payload.db.drizzle`
- **Both:** `server.deps.inline: [/^@payloadcms\//, 'payload']` and aliases for `@` and `@payload-config`.
- **Plugin in tests:** `PAYLOAD_BLOB_FAKE=1` with `@vercel/blob` mocked, so the plugin's hooks run (§1). Without it the plugin is disabled, as in local dev.
- **Boundary mocks kept:** `next/cache`, `next/headers` (cookie jar), `@vercel/blob` (`del`, `head`, `handleUpload`, `put`), `nowAsEventClock` pinning and `fetch` stubs.
- **Fixture hazard:** today is 2026-10-03 and the fixtures use Oct/Nov 2026. Every test that touches dates pins its clock.

**Per-file fate for all 43 existing files:**

| Fate | Files |
|---|---|
| **KEEP** (21), with a type retarget where noted | `playhq/{client,format,games,ladder,names,players,queries,rounds,scorecard,seasons}`; `announcements-format`; `event-occurrences`; `events-meal`; `people`; `players-merge` (type); `players-season-math`; `players-sync-plan`; `players-view` (type); `rsvp-cookie`; `slugify`; `players-cron-route` (mock path) |
| **ADAPT** (unit + payload-fake) (9) | `site-metadata` (club values become arguments, §14); `structured-data` (domain types and club args); `site-settings` (pure split); `stories-content` → `stories-convert.test.ts` (keeps the XSS cases: attribute stripping and href protocol, the h1/h5 mapping, pre→code, foreign img drop, Tiptap→Lexical→HTML round trip, excerpt); `events-rsvp-action`; `events-rsvp-token-actions`; `events-photo-submission-action` (keeps every URL-origin case and adds a duplicate-filename case); `stories-submit-action` (honeypot, required fields, a rejected foreign image, and token-edit-of-published → pending); `events-queries` (occurrence logic, plus asserting `where status=approved`) |
| **REAL** → `tests/int/` (10) | `announcements-queries` → `announcements.int` (published filter and sort; trivial admin-action cases folded in); `announcements-admin-actions` (folded into the same); `stories-queries` + `stories-admin-actions` → `stories.int` (slug hook incl. reserved and collision, lifecycle timestamps, re-approve keeps `publishedAt`, excerpt derivation, tokens hidden from anonymous REST-style `overrideAccess:false` reads; public-edit rule forces `pending` and strips protected keys; `publishedAt` cannot be set by an editor); `events-admin-actions` → `events.int` (branch nulling, required-per-type, date normalisation idempotency incl. a UTC-west mock tz, meal normalisation, payment URL, cascade delete); `events-admin-rsvp-photo-actions` → `event-photos.int` (plugin enabled via fake token: approve, reject deletes doc + `del` called for a non-legacy row and skipped for a `legacyUrl` row, `BLOB_DELETE_DISABLED`, `sortFirst`); `sponsor-carousel-actions` → `site-settings.int`; `contacts-admin-actions` → `people.int` (trim, section default); `players-admin-actions` → `players.int` (playhq delete refused, including after a REST `source` PATCH; cascade; merge endpoint transaction incl. honours `_order`); `players-sync` → `players-sync.int` (lock incl. two concurrent starts, wipe guard, PlayHQ failure leaves players untouched, active flags, `updated_at` bump) |
| **REPLACE/DROP** (3, deleted in WP1; `access.int` is written in WP2 and extended in each later WP) | `auth.test` and `admin-actions-auth` → `access.int` (anonymous `overrideAccess:false` is denied create/update/delete on every collection and globals, denied read on rsvps/sync-runs/aliases and token fields, and gets only published or approved rows; editor cannot change roles; plus the leak-path cases below); `crud.test` is dropped |

**`access.int` leak-path cases** (anonymous REST, via the REST handler, not only `overrideAccess:false` Local calls):

- `stories?where[editToken][like]=a` and `?sort=editToken` → 400.
- `GET /api/events?depth=1` carries no `rsvps` data; public `getEventById` passes `joins: false`.
- `GET /api/media?where[prefix][equals]=stories/pending` → no docs.
- `authorEmail` (stories) and `submitterName` (event-photos) are absent from anonymous responses.
- `GET /api/player-seasons?where[player][equals]=<hidden player id>` → no docs.
- `POST /api/users/first-register` on an empty users table → 403 without the seed context; `seed-admin` succeeds with it. The test calls the operation through the REST handler, since first-register has no Local API.
- An editor PATCHing `players.source`, `stories.slug`, `submittedByAdmin` or `publishedAt` → the stored values are unchanged, so a `source=manual` PATCH followed by DELETE is still refused for a PlayHQ player.
- A public token update under `context.publicSubmission` carrying `status: 'published'` and new tokens leaves the story `pending` with its tokens unchanged.

**New tests:**

- `env-guard.unit`: `assertSafeEnv()` throws for a remote `DATABASE_URI` without `ALLOW_REMOTE_DB=yes` and for a set `BLOB_READ_WRITE_TOKEN` without `ALLOW_REMOTE_BLOB=yes`, including under `NODE_ENV=production`; passes on `VERCEL=1`. `resolveServerURL()` throws when the variable is missing.
- `int-smoke.int` (WP1): boots Payload in vitest against `langlang_test`, creates a user and a `media` doc, and proves the harness before WP2 relies on it.

- `revalidate.unit`: the hook never throws outside a request.
- `etl.int`: a fixture legacy schema created in the test DB under schema `legacy_fixture`, run twice to prove idempotency; covers orphans skipped, the 3-way media branch, ids + `setval` from `GREATEST(MAX(id), last_value)`, a partially failed `player-seasons` insert resumed, timestamp post-pass and verify. It asserts a **field-for-field round trip** of slug, tokens, `submittedByAdmin`, `publishedAt`/`reviewedAt`, `source`, `displayName`, `sortOrder`, `excerpt` and `createdAt` (§3 conventions table).
- `media-register.int`: runs with the plugin **enabled** (`PAYLOAD_BLOB_FAKE=1`). The §7.4 recipe for every legacy prefix (`players`, `contacts`, `sponsors`, `stories`, `stories/pending`, `events`); the stored `prefix` round-trips unchanged; `url === legacyUrl`; no fetch occurs; deleting a `legacyUrl` row calls no `del`.
- `blob-url.unit`: the hardened `isOwnBlobUrl` cases.

**Running them.** Agents iterate with `vitest run <file>` and run the whole suite once per WP at the end, piping output through `| tail -40`.

## 16. Template-readiness notes (groundwork only)

- **Club-specific content** is confined to `payload/seed/club-defaults.ts`, `config/site.ts`, `public/assets/branding`, env (`CANONICAL_HOST`, `REDIRECT_HOSTS`, `PLAYHQ_*`) and `tailwind.config.ts` colours. A new club means forking those five and running `seed:admin` + `seed:club`. The ETL is never run.
- **Sport-specific vocabulary** stays as select options exported from `lib/` constants: tiers, people sections, document categories, and `sport: 'Cricket'` in the global. The next step is moving those options into the `club` global as arrays.
- **Feature flags** (deferred) would live in `site-settings` and be the hook for clubs without PlayHQ, followed by conditional collection registration in `payload.config.ts`.
- **Theme.** The follow-up is CSS variables for `brand.*`, with Tailwind tokens of the form `rgb(var(--brand-x) / <alpha-value>)`, emitted from a `theme` group on `club` (design-system §12).
- **Cookie prefix** is in `config/site.ts`. The names keep `llcc_` for this club.

## 17. Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Something points Payload or the Blob plugin at production in dev | Medium / high | `.env.local` moved out of the worktree (WP1 step 0); `assertSafeEnv()` in `payload.config.ts` and `db/index.ts` refuses remote DB hosts and any Blob token off Vercel; production vars scoped to Production only; push is opt-in and local-only; scripts need `--target` + `--confirm` + `ALLOW_REMOTE_DB`; tests are regex-guarded to `_test` on localhost; `check-migrations` hard-codes its DB; preview build guard refuses an empty `PROD_DATABASE_HOST` |
| Timezone drift in event dates | Medium / high | The §3.8 hook is idempotent with a UTC-midnight short-circuit; `int` tests cover both east and west of UTC; the pg type parser is set in the ETL; RSVP `occurrenceDate` equality is checked in verify |
| HTML→Lexical conversion loses content or images | Medium / medium | Restricted feature set; pre-normalisation; per-story plain-text and image-count verification in rehearsal; flagged items reviewed before cutover |
| Registered blobs: prefix nesting, filename collisions | Medium / high | `media` collection prefix `''`; ETL asserts other collections' paths sit under their prefix; per-row URL equality in verify; collision fallback re-upload (§12.4) |
| New app deletes blobs the legacy rollback target still shows | Medium / high | `guardLegacyBlobDeletes` skips `legacyUrl` rows until decommission; `BLOB_DELETE_DISABLED=1` and a separate Blob store on previews (§7.5) |
| Unplanned production cutover (merge to `main`, open first-register) | Low / high | No merge before the window; production-domain auto-assign off; `vercel deploy --prod --skip-domain` + promote; `users` `beforeOperation` guard; Deployment Protection on previews |
| `revalidatePath` throwing in `payload run` | Medium / low | try/catch + `disableRevalidate` context; unit test |
| Neon pooler + `pg` Pool exhaustion on serverless | Medium / medium | Pooled URL, `max: 5`, migrations over the unpooled URL |
| Advisory lock or transactions under PgBouncer transaction mode | Low / medium | Only `pg_advisory_xact_lock` (transaction-scoped) is used, never session locks |
| Lost public writes during the cutover window | Low / low | Firewall POST freeze for ~30 min (§13.2 step 2); no delta pass |
| Public REST leaks PII or hidden content | Low / medium | Field-level `read: isStaff` on PII; `joins: false` on public Local API reads; `access.int` leak-path cases |
| `next build` time (the spike took 6.4 min compile on a busy machine) | Medium / low | Acceptable on Vercel; agents run one build per WP |
| React 19 form auto-reset regressions | Medium / medium | The four forms are fixed explicitly; WP3/WP4 checks submit invalid data and confirm the input is kept |
| Payload admin CSS bleed or Tailwind preflight | Low / medium | `globals.css` is only imported in `(frontend)`; Tailwind content globs exclude the payload dirs |
| Story token-edit behaviour change surprises submitters | Low / low | Updated STATUS_NOTE copy; restore-to-review in the admin |

## 18. Implementation plan — work packages

These run sequentially, one large agent per WP.

Every WP ends with:

- `pnpm lint`
- `pnpm tsc --noEmit`
- `pnpm check:generated`
- `pnpm test` (once, `| tail -40`)
- `pnpm test:int` where it exists
- one `pnpm build`, as `| tail -60`

Agents use only local Postgres at `127.0.0.1:54329`. They never read `.env.local`, never set `BLOB_READ_WRITE_TOKEN`, and use `PAYLOAD_BLOB_FAKE=1` when the plugin must run.

**Parity data.** From WP2 on, each WP writes the ETL steps for its own collections (`payload/scripts/etl/steps/<collection>.ts`, plus `etl/{source,media,report}.ts` in WP2) and runs them against `langlang_legacy` (or the `legacy_fixture` schema when no dump is available) before its parity comparison. Snapshots of the "before" pages are captured from the transitional legacy `db/` against the same `langlang_legacy`.

### WP1 — Scaffold: pnpm, Next 16, route groups, Payload boot, env guards, old admin removed

**Step 0 (pre-flight).** The working copy's `.env.local` must contain only local values: `DATABASE_URI`, `LEGACY_DATABASE_URL` and `DATABASE_URI_TEST` pointing at `127.0.0.1`, with no `BLOB_READ_WRITE_TOKEN`. The agent checks the hosts with `grep` before running anything, and aborts if any URL is not local or a Blob token is present. The production `.env.local` in the main checkout is never read.

**Files and changes:**

- `package.json` and `pnpm-workspace.yaml`. Delete `package-lock.json`.
- `next.config.mjs` (withPayload, env hosts), `tsconfig.json`, `eslint.config.mjs` (delete `.eslintrc.json`), `tailwind.config.ts` content, `components.json`.
- Move every public route into `app/(frontend)/`, with `layout.tsx`, `error.tsx` and `not-found.tsx`.
- `app/(payload)/**` from the template.
- `payload/env.ts` (`assertSafeEnv`, `assertLocalDb`, `blobToken`, `resolveServerURL`, `csrfOrigins`) and `payload.config.ts` with `users` and `media` only (media collection prefix `''`), the `users` `beforeOperation` first-register guard, `payload/plugins/guardLegacyBlobDeletes.ts`, the `legacyUrl` read rule and file-replace guard, plus `access/` and `hooks/revalidate.ts`.
- `db/index.ts` switches from `drizzle-orm/neon-http` (HTTP to Neon only; it cannot reach local Postgres) to `drizzle-orm/node-postgres` on `LEGACY_DATABASE_URL`, calling `assertSafeEnv`-style host checks first. It is deleted in WP6.
- `payload/scripts/_guard.ts` and `seed-admin.ts` (passes `context.seedAdmin`).
- First migration with `CREATE SCHEMA`.
- `scripts/vercel-build.mjs` (empty-`PROD_DATABASE_HOST` refusal, preview checks) and `check-migrations.mjs` (hard-coded `langlang_mig` URL).
- `.env.example`.
- Delete `middleware.ts`, `app/admin/**`, **`components/admin/**`**, `app/api/{admin,gallery}/upload`, `lib/{auth,require-admin,crud}.ts`, `tests/auth.test.ts`, `tests/crud.test.ts` and `tests/admin-actions-auth.test.ts`. Before deleting, `components/admin/bulk-image-uploader.tsx` is moved to `payload/components/_source/BulkImageUploader.tsx` (excluded from lint/tsc) as the port source for WP3's `RecapPhotosField`.
- Move the admin-coupled tests that import deleted modules into `tests/_pending/`, which the unit project excludes (`exclude: ['tests/int/**', 'tests/_pending/**']`). The WP that owns each one replaces it: `announcements-admin-actions`, `contacts-admin-actions` and `sponsor-carousel-actions` in WP2; `events-admin-actions` and `events-admin-rsvp-photo-actions` in WP3; `stories-admin-actions` in WP4; `players-admin-actions` and `players-sync` in WP5. `tests/_pending/` must be empty at the end of WP5.
- Next 16 codemods on the public pages: async APIs, `noStore` removal, `useActionState`, React 19 types.
- Tests: `env-guard.unit`, `int-smoke.int`, and `access.int` started with the `users` cases (first-register 403 without the seed context).

**Transitional state.** The public pages still read through the legacy `db/`, now on `node-postgres` against local `langlang_legacy` (or the seed). The old admin is gone. `vitest` is upgraded to 3 with the two projects and the `int` guard.

**Acceptance:**

- `next build` succeeds.
- `next start`: log in at `/admin` as the seeded admin and upload an image to `media`. Without a token the file lands in `./media`.
- On an empty `langlang_dev`, `/admin/create-first-user` and `POST /api/users/first-register` are refused.
- With `DATABASE_URI` pointed at a non-local host, or with `BLOB_READ_WRITE_TOKEN` set, `next dev`, `next start` and `pnpm payload migrate:status` each refuse to start.
- Every public page renders against the local legacy DB.
- `check:migrations` passes. `int-smoke.int` passes.
- A grep finds no `cookies()` sync calls and no `useFormState`.
- **Recorded verification results:**
  - 7.6(a) resize with client uploads (fake token)
  - 7.6(b) delete of a registered row and the legacy-delete guard (fake token)
  - 7.6(c) REST multipart create under `clientUploads: true`
  - `global-not-found` in 16.3.8
  - `revalidatePath` outside a request
  - `players_honours._order` base
  - the REST join `where` syntax

  Each result goes into a short "WP1 findings" section appended to this spec.

### WP2 — Globals and simple content

**Files and changes:**

- `payload/globals/{Club,SiteSettings}.ts` and `payload/seed/club-defaults.ts`. Every content-misc §8 string is lifted verbatim; the global holds identity, contact, socials, SEO and history copy, and the rest stays in the defaults module (§4.1).
- `seed-club.ts` and `lib/club.ts`.
- Collections `documents`, `gallery-photos`, `sponsors`, `people` and `announcements`, plus their hooks (`sortFirst`, trim, revalidate), each with its `context.etl` bypass.
- `lib/domain.ts`, `lib/payload/{client,mappers}.ts`, `content-queries.ts`, and the `announcements-queries` / `site-settings` swap.
- Every frontend file that hard-codes club strings now reads `getClub()`. That includes nav, footer, home, contact, people, documents, sponsors, gallery, announcements, `history/page.tsx` copy, `site-metadata` and `structured-data`.
- `Dashboard` with the card registry and its WP2 cards, `PlayHQRefreshButton` + `/api/admin/playhq-refresh`, plus `Logo`/`Icon`/`admin.css`.
- ETL: `etl/{source,media,report}.ts` and steps for `site-settings`, `club`, `documents`, `gallery-photos`, `sponsors`, `people`, `announcements`.
- `payload/scripts/add-gallery-photos.ts`.
- Tests: `announcements.int`, `site-settings.int`, `people.int`, `media-register.int`, and the unit adapts for `site-settings`, `site-metadata` and `structured-data`.

**Acceptance:**

- After ETL'ing these collections from `langlang_legacy`, with an **empty** `club` global and again after `seed:club`, the HTML of `/`, `/sponsors`, `/gallery`, `/documents`, `/contact`, `/people` and `/announcements` matches the pre-WP2 snapshots taken from the legacy `db/` on the same data. Snapshots are captured with `curl` against `next start` and compared after stripping build hashes.
- A grep finds no "Lang Lang", "Caldermeade" or gmail address under `app/(frontend)` or `components/`.
- The admin can CRUD all five collections. Gallery bulk upload works.

### WP3 — Events, RSVPs, event photos

**Files and changes:**

- Collections `events`, `event-rsvps` and `event-photos`; hooks `eventDates`, `mealOptions` and `cascadeDelete`, each with its `context.etl` bypass; `submitterName` field read `isStaff`.
- `events-queries.ts` swap (`joins: false`) and the public actions (`submitRsvp`, the token update/cancel by id after a `limit: 1` lookup, `submitEventPhoto`).
- `app/api/public/events/upload`, the hardened `lib/blob-url.ts`, and `lib/blob-client.ts` paths with filename slugging.
- Components `RsvpSummaryField`, `PendingPhotosField`, `RecapPhotosField` (ported from the WP1-preserved `BulkImageUploader`), `RsvpCountCell`/`PendingCountCell`, `PendingQueueBanner`, and the events Dashboard cards.
- React 19 form fixes in `rsvp-form` and `rsvp-edit-form`.
- `sitemap.ts`: the events part.
- ETL steps for `events`, `event-rsvps`, `event-photos`.
- Tests: `events.int`, `event-photos.int`, `blob-url.unit`, the events `access.int` cases, and adapts of the four events unit files.

**Acceptance:**

- Locally: create a one-time event and a recurring one. Recurring dates appear as UTC midnight in the DB and display correctly in the admin.
- RSVP yes with a meal, then reload: the cookie prefills the form. Edit via `/events/rsvp/<token>`. Cancel. An empty token never matches a row.
- Submitting invalid RSVP data keeps the input.
- With ETL'd legacy events, admin summary counts match the legacy admin's counts.
- Deleting an event removes its RSVPs and photos.
- Public photo submit with a phone-style filename and mocked Blob registers a pending doc. Approve and reject work from the event edit view.

### WP4 — Stories

**Files and changes:**

- `payload/editor/storyLexical.ts`, the `stories` collection, the `slug`/`storyLifecycle`/token fields with field access, the public-edit enforcement and the `context.etl` bypasses; `authorEmail` read `isStaff`.
- `lib/stories-convert.ts` and `stories-queries.ts`; the domain `Story` has no tokens or email.
- The submit and draft-edit actions with the new pipeline and allowlisted `data`, and `app/api/public/stories/upload`.
- `components/stories/story-body.tsx` and the `.story-content` CSS retarget.
- `StoryModerationControls` (`useForm().submit({ overrides })`), `StoryLinksField`, `PendingQueueBanner` reuse, and the stories Dashboard cards.
- Form fixes in `draft-edit-form` and `submit-story-page-client`.
- `sitemap` (`status=published`) and `storyJsonLd` (dateModified from `updatedAt`).
- Delete `lib/stories-content.ts`'s `contentHtml` usage; keep `renderStoryHtml` for conversion.
- ETL step for `stories`.
- Tests: `stories.int`, `stories-convert.test`, the stories `access.int` cases, and the `stories-submit-action` adapt.

**Acceptance:**

- A story submitted publicly with an inline image (mocked Blob, register path) appears in the admin as pending and is approved via the controls.
- Its `/history/<slug>` renders the image and formatting. Visual parity is checked against ETL'd legacy stories and a fixture HTML.
- The token edit loads the content into Tiptap, saves, and moves the story to pending, even if the request carries `status: 'published'`.
- A foreign `img` src is rejected.
- No `dangerouslySetInnerHTML` remains under `app/(frontend)/history`.

### WP5 — Players and PlayHQ

**Files and changes:**

- Collections `players`, `player-aliases`, `player-seasons` (read `staffOr({'player.hidden': false})`) and `player-sync-runs`, with the hooks `displayName`, the `source` guard and delete-guard/cascade, and field access on sync-owned fields.
- `lib/players/{db,sync,queries}.ts` on `payload.db.drizzle`, with camelCase column keys.
- `payload/endpoints/mergePlayers.ts`.
- `app/api/admin/players-sync/route.ts` and the cron route internals.
- `PlayerSyncPanel`, `MergePlayerField`, and the players Dashboard card.
- `sitemap`: the players part (`hidden=false`).
- ETL steps for `players`, `player-aliases`, `player-seasons` (`ON CONFLICT DO NOTHING`), `player-sync-runs`.
- Tests: `players.int` and `players-sync.int` (PlayHQ queries mocked, fixtures reused), the players `access.int` cases, plus the type retargets.

**Acceptance:**

- A sync against mocked PlayHQ fixtures creates players, aliases and seasons, and a second run is stable.
- Two concurrent runs: one returns `locked`.
- Merging two players moves their seasons, aliases and honours, with the honours order correct.
- A PlayHQ player cannot be deleted, including after an editor PATCHes `source`. A manual player can, and the delete cascades.
- `/players` and `/players/<slug>` render the same as before against ETL'd legacy data.

### WP6 — ETL orchestration, verify, legacy removal

**Files and changes:**

- `payload/scripts/etl-legacy.ts` (orchestrator, `--update`, `--reconcile-deletes`), `etl/{sequences,timestamps,verify}.ts`, `verify-cutover.ts` (per-row URL equality, field round trip), `export-since.ts` and `reset-payload-schema.ts`.
- Read-only source enforcement (unpooled URL, `READ ONLY` transactions, `SHOW` assert).
- Delete `db/`, `drizzle.config.ts`, `scripts/{seed,reset-sponsors,add-gallery-photos,sponsors-data}.ts` and `lib/blob.ts`. Remove the drizzle and neon dependencies and `DATABASE_URL`.
- Rewrite the README: setup, `.env.local` rule, the local DBs, env, migrations workflow, scripts and the template notes.
- `seed-demo.ts`, which seeds `langlang_dev` from `public/assets` (local disk, never Blob) so that a fresh club, or a developer, gets a populated site without the legacy DB.
- Tests: `etl.int`, plus a final `access.int` pass over every collection.

**Acceptance:**

- The full rehearsal (§12.5) passes on `langlang_legacy` if the human has provided a dump. Otherwise it runs against the `etl.int` fixture.
- A second run writes 0 rows. Verify's per-row URL check passes for every registered row.
- A grep finds no `drizzle-orm` import outside `@payloadcms/db-postgres/drizzle`, and no `DATABASE_URL`.
- The full unit and int suites pass.

### WP7 — Cutover readiness

**Files and changes:**

- `docs/superpowers/plans/…-cutover-checklist.md`: the operator copy of §13 with blanks for timestamps, the Firewall rules, the auto-assign setting and the deploy/promote commands, plus screenshots of the pre-cutover pages, to be captured by the human.
- `vercel.json` unchanged. Confirm `vercel-build` is wired in the project settings, which the human does.
- Final pass: `check:migrations`, `check:generated`, one full `pnpm build`, and a preview deployment against a manually created Neon branch with the preview Blob store, `BLOB_DELETE_DISABLED=1` and Deployment Protection, which the human triggers.

**Acceptance:**

- The preview passes the §13.3 smoke list against a branch restored from production and ETL'd with the runbook commands, including admin login on the branch URL (derived `serverURL`/`csrf`).
- On that preview, rejecting a legacy pending photo leaves its production blob intact.
- The human signs off on the runbook.
- Agents do not perform §13.2 and never merge `feat/payload-cms` to `main`. Both need production access and are executed by the operator.

## Appendix — Review resolutions

Three reviews (safety-data S1–S11, access-security A1–A10, feasibility-completeness F1–F14). Payload-behaviour claims were checked against the 3.90.2 sources in the spike's `node_modules`. Duplicates are resolved once and cross-referenced.

| # | Verdict | Resolution |
|---|---|---|
| S1 / F2 | Accept (F2 guard key rejected) | WP1 step 0 removes `.env.local` (agents abort if present); `assertSafeEnv()` in `payload.config.ts` and `db/index.ts`; `ALLOW_REMOTE_DB`/`ALLOW_REMOTE_BLOB`; `check-migrations` hard-coded (D4, §1, §11). F2's `NODE_ENV !== 'production'` key is rejected because a local `next start` runs as production; the guard keys on `!VERCEL`. F2's new Blob variable name is rejected as unnecessary once the guard exists and every `@vercel/blob` call passes `token` explicitly. |
| S2 / F1 | Accept, with F1's primary fix rejected | Confirmed in `normalizeUploadPrefix.js`/`buildUploadPrefix`. The field hook is installed even when the plugin is disabled (`getFields.js`, `alwaysInsertFields`), so F1's "only when enabled" is wrong. F1's `skipCloudStorage` fix is rejected: `generateURL` and `afterDelete` also call `buildStoragePathData` with the collection prefix and would still nest. `media` uses collection prefix `''`; the ETL asserts other collections' paths sit under their prefix; verify checks URL equality for every registered row; `media-register.int` runs with the plugin enabled (§1, §12). |
| S3 | Accept | `guardLegacyBlobDeletes` skips deletes for `legacyUrl` rows until decommission; previews get a separate store and `BLOB_DELETE_DISABLED=1`; file replacement on legacy rows is refused (§7.5). The plugin's `afterDelete` ignores `skipCloudStorage`, so a context flag could not do it. |
| S4 / A4 | Accept | `users` `beforeOperation` guard plus `seedAdmin` context, confirmed against `registerFirstUser.js`; Deployment Protection on previews; `access.int` case (§3.1, §11.5). |
| S5 / F7 (merge) | Accept | No merge before the window; auto-assign off; `vercel deploy --prod --skip-domain` then promote that deployment; fast-forward `main` afterwards (§11.5, §13.2). |
| S6 / F13 | Accept (freeze) | Firewall POST freeze for steps 2–10 replaces the id gap and the delta pass. Sequences use `GREATEST(MAX(id), legacy last_value) + 1`. `--update --reconcile-deletes` kept only as the re-attempt fallback (§12.2, §12.3, §13.2). |
| S7 | Accept | Guarded `reset-payload-schema.ts` and a full re-run before a second attempt; `--update --reconcile-deletes` as the fallback (§13.4). |
| S8 / F12 | Accept | Every hook's `context.etl` behaviour is enumerated in a table; `etl.int` asserts a field-for-field round trip (§3, §15). |
| S9 | Accept | Unpooled URL only, per-client `SET` on connect, `BEGIN READ ONLY`, `SHOW` assert (§12.1). |
| S10 | Accept | Build refuses an empty `PROD_DATABASE_HOST`; `DATABASE_URI*` and the Blob token are scoped to Production only (§11.1, §11.5). |
| S11 | Accept | `onConflictDoNothing` on id; no row-count shortcut (§12.2 step 14). |
| A1 | Accept | Field `read: isStaff` on `authorEmail` and `submitterName`; `media` read `staffOr(prefix ≠ stories/pending)`. The `isStaff` variant is rejected because it breaks dev-mode `/api/media/file/*` for public pages. Principle stated in §2; domain `Story` carries no tokens or email. |
| A2 | Accept | `player-seasons` read `staffOr({'player.hidden': false})` (§3.14). |
| A3 | Accept | `create/update: nobody` on hook- and sync-owned fields, plus `beforeChange` resets. Owning hooks must be `beforeChange`, because field access strips data during the `beforeValidate` traversal (§2, §3.11, §3.12). |
| A5 | Accept | `resolveServerURL()` requires the variable; explicit `csrf`; confirmed in `defaults.js`, `sanitize.js` and `extractJWT.js`. The manual Origin check is kept, with the dependency noted (§1, §6). |
| A6 | Accept | Firewall login and forgot-password rate limit is a cutover prerequisite; Payload defaults kept (§3.1, §13.1). |
| A7 | Accept | Token gate, then a `limit: 1` lookup, then a write by id; allowlisted `data`; public-edit rule enforced in `storyLifecycle` (§3.11, §6). |
| A8 | Accept | The sitemap `where` clauses are stated and tested (§14). |
| A9 | Accept | `joins: false` on public `events`/`players` reads; confirmed in `sanitizeJoinQuery.js` (§2, §14). |
| A10 | Accept | The leak-path cases are added to `access.int` (§15). |
| F3 | Accept | `db/index.ts` moves to `node-postgres` on `LEGACY_DATABASE_URL` with a host assert in WP1. |
| F4 | Accept | The ETL is built per WP; parity checks run on ETL'd `langlang_legacy` data (§12.1, §18). |
| F5 | Accept | `PAYLOAD_BLOB_FAKE=1` passes a fake token straight to the plugin with `@vercel/blob` mocked (§1, §15). |
| F6 | Accept | Confirmed in `traverseFields.js`: column keys are camelCase. Fixed in D13, §3, §8.1, §8.2 and §8.3. |
| F7 (preview login, Neon vars) | Accept | Previews derive `serverURL`/`csrf` from `VERCEL_BRANCH_URL`/`VERCEL_URL`; the Neon branch is created manually with explicit `DATABASE_URI*` (§1, §11.1). |
| F8 | Accept | Client-side filename slugging before `upload()`; existing media is looked up before the strict check (§6). |
| F9 | Accept | WP1 deletes `components/admin/**` and preserves `bulk-image-uploader` as the port source. |
| F10 | Accept | The Dashboard card registry grows per WP (§9). |
| F11 | Accept | The unit project excludes `tests/int/**` and `tests/_pending/**`; WP1 adds `int-smoke.int`. |
| F14a scope | Partial | The `club` global keeps identity, contact, socials, SEO **and history copy**, as the fixed decisions require. Home, page copy, nav and footer stay in `club-defaults.ts`; the `site-settings.features` flags are dropped (§4). |
| F14b CSRF | Reject | The manual Origin check is kept as defence in depth; the A5 note covers the dependency. |
| F14c resize | Reject | `'full'` only means the server reads the bytes. The plugin's `afterChange` skips files that have a `clientUploadContext`, so the resized output is not re-stored. 7.6(a) stays as a check, with an expected answer of no. |
| F14d–f | Accept | `site-metadata` moves to ADAPT; the `StoryLinksField` edit link is `/history/drafts/<editToken>/edit`; moderation uses `useForm().submit({ overrides })`, confirmed in the `@payloadcms/ui` Form types. |

## WP1 findings

Recorded 2026-10-03 against Payload 3.90.2 / Next 16.3.8 / pnpm 11.18.0, local Postgres. Items marked *test* are asserted in `tests/int/wp1-verification.int.test.ts` (plugin enabled with the fake token, `@vercel/blob` mocked, probe collections in schema `probe` of `langlang_test`).

| Item | Result |
|---|---|
| 7.6(a) `resizeOptions` under `clientUploads` (*test*) | **Rewrites — the expected answer "no" was wrong.** With sharp adjustments configured, core `generateFileData` deletes `file.clientUploadContext` after processing, so the plugin's `afterChange` no longer filters the file and re-`put`s the processed buffer at the same path (`allowOverwrite: true`). Without `resizeOptions` a client upload is not re-uploaded. Per §7.6(a), `media` now has `resizeOptions: { width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }`; WP2/WP3 add the same to `gallery-photos` and `event-photos`. Registered legacy rows carry no file and are never resized. Cost: the server downloads the full client-uploaded original once to resize it. |
| 7.6(b) delete of a registered `media` row (*test*) | Works as designed. Collection prefix `''` stores the per-row `prefix` verbatim; `url` = `https://<store>.public.blob.vercel-storage.com/players/<file>`; delete calls `del` with exactly that URL. `guardLegacyBlobDeletes` skips it when `legacyUrl` is set and for every row with `BLOB_DELETE_DISABLED=1`. Replacing the file of a `legacyUrl` row is refused. |
| 7.6(c) REST multipart create under `clientUploads: true` (*test*) | Works. `POST /api/media` (multipart, staff JWT) stores the file through the plugin (`put('<filename>')`) and returns the direct Blob URL. `RecapPhotosField` can rely on it; the fallback is not needed. |
| `global-not-found` in 16.3.8 | Works with `experimental.globalNotFound: true`. `app/global-not-found.tsx` renders the public shell (`app/(frontend)/shell.tsx`) + the not-found card for unmatched top-level URLs (`/nope`, `/a/b`), 404 status. The `[...notFound]` fallback is not used. In-segment `notFound()` uses `app/(frontend)/not-found.tsx`. |
| `revalidatePath` outside a request (*test*) | Raw `next/cache` `revalidatePath` **throws** outside a Next request (vitest / `payload run`). `payload/hooks/revalidate.ts` wraps each call and is a no-op under `context.disableRevalidate`; `tests/revalidate.test.ts` covers it. |
| `players_honours._order` base (*test*) | Array rows are written with `_order` **1, 2, 3 …** (1-based). Drizzle merge/sync code that appends honours must continue from `MAX(_order) + 1`. |
| REST join `where` syntax (*test*) | `GET /api/<coll>/<id>?joins[<join>][where][<field>][equals]=<v>` filters the join (verified). `?joins[<join>]=false` omits it. A bare `?joins=false` does **not** disable joins over REST. |
| First-register on an empty DB | `POST /api/users/first-register` → 403 and no row (dev server on an empty migrated DB, and `access.int`). `/admin/create-first-user` still **renders** its form (Payload routes there when no user exists), but submitting it is refused the same way, so the table cannot be claimed. |
| `payload run` argv | `payload run` parses flags with minimist and forwards only positionals, so script flags must follow `--` (`payload run script.ts -- --target … --confirm`). `seed:admin` ends with `--`, as the §11.4 `etl` script already does. Scripts must use top-level `await`: `payload run` exits as soon as the import resolves. |
| pnpm 11 | `onlyBuiltDependencies` alone did not approve builds under pnpm 11.18 (`ERR_PNPM_IGNORED_BUILDS`); `pnpm-workspace.yaml` also needs `allowBuilds: { sharp: true, esbuild: true, unrs-resolver: true }`. |
| vitest `server.deps.inline` | Patterns match resolved file paths (`node_modules/.pnpm/...`), so `/^@payloadcms\//` never matches. Use `/@payloadcms\//`, `/node_modules\/payload\//`. The storage plugin pins its own `@vercel/blob@2.3.1` (the app uses 2.8.0): tests must mock that file (`createRequire` from the plugin, `index.js`) and inline `/@vercel\/blob/`, or real network calls happen. Payload caches its instance on `global._payload`; int files share one fork, so `destroyTestPayload()` also clears that cache. |
| Next dev side effects | Next 16 writes `AGENTS.md`/`CLAUDE.md` on `next dev`; disabled with `agentRules: false`. |
