# Payload CMS cutover — operator checklist

The operator copy of spec §13 (`docs/superpowers/specs/2026-10-03-payload-cms-migration-design.md`), with blanks to fill in during the run. Print it or copy it into the ticket for the window.

**Agents prepare this; a human runs it.** Every step that touches production (the Vercel project, Neon, the production Blob store, `main`) is done by the operator. Agents never run §13.2 and never merge `feat/payload-cms` to `main`.

| | |
|---|---|
| Operator | ____________________ |
| Second person (on call) | ____________________ |
| Cutover commit (`feat/payload-cms`) | `____________________` |
| Production Blob store id (`<id>.public.blob.vercel-storage.com`) | `____________________` |
| Preview Blob store id | `____________________` |
| Production Neon project / branch | ____________________ |
| Planned window (local time, ~30 min, low traffic; **must end before 17:00 UTC**, see D) | ____________________ |

Sections A–D happen before the window. E is the window. F is the smoke list, G the rollback, H the decommission.

---

## A. One-time setup (Vercel and Neon)

### A.1 Vercel project settings

- [ ] **Build command.** `vercel.json` on `feat/payload-cms` sets `"buildCommand": "pnpm vercel-build"`, and `vercel.json` takes precedence over the dashboard. Confirm that the first preview build log shows `node scripts/vercel-build.mjs` and a `payload migrate` run. `main`'s `vercel.json` has no `buildCommand`, so legacy deploys are unaffected. `vercel.json` is not changed for the cutover; the cron (`/api/cron/players-sync`, 17:00 UTC) is the same.
- [ ] **pnpm 11.** `package.json` pins `"packageManager": "pnpm@11.18.0"`, and the build-script approvals live in `pnpm-workspace.yaml` (`allowBuilds`). Set `ENABLE_EXPERIMENTAL_COREPACK=1` for **Preview only** here, so Vercel uses that exact pnpm; the Production scope is added in D (legacy `main` has no `packageManager`, so leave its production builds untouched until then). Confirm the install step of the first preview log prints pnpm 11 and that `sharp` was built.
- [ ] **Node.js 22.x** (≥ 22.13: pnpm 11 refuses to run on anything older; `engines.node` is `>=22.13`). The project's Node.js setting applies to every build, legacy `main` included, while `engines.node` in `package.json` overrides it per build. So leave the project setting as it is until the cutover (changing it would also rebuild the legacy app on a new Node) and let `engines.node` select 22.x for the new app; confirm the first preview build log shows Node 22. Project setting: ________ Preview build Node version: ________
- Production domain auto-assignment is switched off in **D**, not here: from that moment a push to `main` (a legacy hotfix) builds but never goes live.
- [ ] **Deployment Protection** (Vercel Authentication) is on for Preview deployments, and for production deployment URLs (Standard Protection). The apex stays public.

### A.2 Environment variables

`DATABASE_URI`, `DATABASE_URI_UNPOOLED` and `BLOB_READ_WRITE_TOKEN` are never given the Development scope, so `vercel env pull` cannot bring production credentials to a laptop. Do not use the Neon Vercel integration: it injects `DATABASE_URL*` and production URLs into previews.

- [ ] **Audit the scopes of what is already there.** Connecting a Blob store defaults to all three environments, and the legacy README had the production token and `DATABASE_URL` copied into `.env.local`, so the production values are probably in Development and Preview today. Run `vercel env ls` (and check the dashboard for integration-managed variables). For the production `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL*`, `POSTGRES_*`/`PG*` and any other Neon-integration variable, remove the **Development** and **Preview** scopes (`vercel env rm <name> development`, `vercel env rm <name> preview`), keeping Production. Then `vercel env ls` again: no production credential is left in Development or Preview. Done on ________ by ________. Afterwards, any laptop that ran `vercel env pull` before this should delete its `.env.local` copy of those values.

| Variable | Production | Preview (scope it to the `feat/payload-cms` branch) | Set? |
|---|---|---|---|
| `DATABASE_URI` | pooled production URL (`-pooler` host) | pooled URL of the Neon **branch** (A.3) | [ ] / [ ] |
| `DATABASE_URI_UNPOOLED` | direct production URL | direct URL of the branch | [ ] / [ ] |
| `PAYLOAD_SECRET` | 32+ random bytes (`openssl rand -hex 32`) | a different random value | [ ] / [ ] |
| `NEXT_PUBLIC_SERVER_URL` | `https://langlangcricketclub.com` | not needed (derived from `VERCEL_BRANCH_URL`) | [ ] |
| `CANONICAL_HOST` | `langlangcricketclub.com` | same | [ ] / [ ] |
| `REDIRECT_HOSTS` | **BLOCKER:** `www.langlangcricketclub.com,lang-lang-cricket-website.vercel.app`. Set before deploying: the code default is now only `www.<CANONICAL_HOST>`, so without this the vercel.app 308 is lost | same | [ ] / [ ] |
| `PLAYHQ_ORG_ID`, `PLAYHQ_TEAM_PREFIX` | **BLOCKER:** `484ced51-403a-466c-9a94-bd95eedf7319` and `Lang Lang`. No fallback in production: with either unset (or `CANONICAL_HOST` unset above) the server refuses to start (`instrumentation.ts`, `assertClubEnv`) | same values (Preview is not `VERCEL_ENV=production`, so the Lang Lang defaults apply, but set them anyway) | [ ] / [ ] |
| `EXPORT_FILENAME_PREFIX` | `langlang` (keeps the StatLab download named `langlang-statlab-<scope>.csv`) | same | [ ] / [ ] |
| `COOKIE_PREFIX` | `llcc` (the default; set it only if you want it explicit, a different value resets visitors' saved RSVPs and dismissed banners) | same | [ ] |
| `BLOB_READ_WRITE_TOKEN` | the existing production store token (unchanged) | the **preview** store's token (A.3) | [ ] / [ ] |
| `BLOB_DELETE_DISABLED` | unset | `1` (the build refuses a preview without it) | [ ] |
| `CRON_SECRET`, `PLAYHQ_CLIENT_ID`, `PLAYHQ_TENANT` | unchanged | same values | [ ] / [ ] |
| `PROD_DATABASE_HOST` | the production Neon hostname (not a secret) | same; set it for **all** environments: the build refuses when it is empty | [ ] |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, added in D (not before: it also applies to legacy builds of `main`) | `1` | [ ] / [ ] |

Never on Vercel: `LEGACY_DATABASE_URL`, `PAYLOAD_ETL`, `ALLOW_REMOTE_DB`, `ALLOW_REMOTE_BLOB`, `INITIAL_ADMIN_*`, `PAYLOAD_PUSH`, `LEGACY_BLOBS_RELEASED` (until H).

The production values are unused until a deployment of the new app is promoted (E.9): the legacy app on `main` reads none of them.

`PROD_DATABASE_HOST` value: `____________________`

### A.3 Preview resources

- [ ] **Neon branch** created manually from the production branch (not by the integration). Name: ________ Created at (UTC): ________. It holds a copy of `public.*` and no `payload` schema.
- [ ] **Preview Blob store**, separate from production. Store id: ________. Its token goes into the Preview `BLOB_READ_WRITE_TOKEN`.

### A.4 Vercel Firewall

- [ ] **Login rate limit (live):** a per-IP rate limit on `POST /api/users/login` (forgot-password is disabled, so login is the only lockout surface). Rule name: ________ Limit: ____ requests / ____ s.
- [ ] **Write freeze (prepared, DISABLED):** a custom rule that denies every `POST` whose host is `langlangcricketclub.com`, `www.langlangcricketclub.com` or `lang-lang-cricket-website.vercel.app`. Server actions are POSTs to page URLs, so this freezes RSVPs, story submits and edits, and photo submits on the legacy site. The cron is a GET and is **not** affected, which is why the window must end before 17:00 UTC (D). Match on those hostnames only, so the new deployment's own URL stays usable during E.8. Rule name: ________

---

## B. Preview rehearsal (WP7 acceptance)

The new app, deployed as a preview against the Neon branch from A.3, ETL'd with the same commands as the window.

### B.1 Deploy the preview

- [ ] Push `feat/payload-cms` (or redeploy it). The preview build runs `payload migrate` on the branch (`scripts/vercel-build.mjs` refuses when either DB URL is the production host or `BLOB_DELETE_DISABLED` is not `1`).
- Preview branch URL: `https://____________________` Deployment URL: `https://____________________`

### B.2 Operator shell for the branch

Use a **clean clone** at the cutover commit with **no `.env.local`** (Payload's CLI loads `.env*` files). Secrets go in with `read -s`, so they never reach a file or the shell history.

```bash
git clone <origin> llcc-cutover && cd llcc-cutover && git checkout <cutover commit>
pnpm install --frozen-lockfile
unset HISTFILE
export ALLOW_REMOTE_DB=yes ALLOW_REMOTE_BLOB=yes PAYLOAD_PUSH=false BLOB_DELETE_DISABLED=1
read -rs DATABASE_URI && export DATABASE_URI               # the BRANCH's direct (non -pooler) URL
export LEGACY_DATABASE_URL="$DATABASE_URI"                 # the branch holds public.* too
read -rs BLOB_READ_WRITE_TOKEN && export BLOB_READ_WRITE_TOKEN   # the PREVIEW store token
read -rs PAYLOAD_SECRET && export PAYLOAD_SECRET           # the Preview PAYLOAD_SECRET
export NEXT_PUBLIC_SERVER_URL=https://<preview branch URL>
export TARGET=$(node -e 'const u=new URL(process.env.DATABASE_URI);console.log(u.hostname+u.pathname)')
export PROD_STORE=<production Blob store id>
mkdir -p ../cutover-reports   # ETL reports live OUTSIDE the clone (see E.8)
echo "$TARGET"   # must be the branch host, not PROD_DATABASE_HOST
```

`--blob-store-id $PROD_STORE --preview-rehearsal` is what makes this a faithful rehearsal: the legacy rows point at the production store, and the explicit `--blob-store-id` wins over the token's store. The scripts refuse a `--blob-store-id` that differs from the token's store unless `--preview-rehearsal` is also given, and refuse `--preview-rehearsal` when the two stores are the same (so it cannot be carried into the window by accident). Legacy blobs are registered in place (no bytes move, nothing is written to the production store); files the ETL uploads from `/assets/` go to the preview store. On a preview the `legacyUrl` read rule accepts the production store, so legacy images render.

### B.3 Run it

- [ ] `pnpm payload migrate` (a no-op after the preview build; it must not prompt).
- [ ] `INITIAL_ADMIN_EMAIL=… INITIAL_ADMIN_PASSWORD=… pnpm seed:admin --target $TARGET --confirm` (type them with `read -rs` as above).
- [ ] `pnpm etl --target $TARGET --dry-run --blob-store-id $PROD_STORE --preview-rehearsal --report ../cutover-reports/b-etl-dry.json`. Review: orphans, flagged media (`other`), collisions, prefix fallbacks and duplicate URLs. Notes: ________
- [ ] **Duplicate URLs.** `duplicate-url-skipped` (event photos): a later photo with the same URL as an earlier one is a resubmission and is skipped; nothing to do. `media-duplicate-url` (documents, gallery photos): informational. The ETL keeps every legacy row, registers the first on the original blob and gives each later one its own copy named `<name>-dup<id>.<ext>` (downloaded and re-uploaded, so it needs the Blob token; the legacy data is not touched). Nothing to fix by hand; just confirm each listed row is expected. A `media-download-failed` / `media-fallback-failed` item next to one means its copy did not upload: re-run the ETL with `--update` (verify fails that row until it does). Rows noted: ________
- [ ] `pnpm etl --target $TARGET --confirm --blob-store-id $PROD_STORE --preview-rehearsal --report ../cutover-reports/b-etl.json`. It ends with `VERIFY PASSED`. Any `media-fallback-failed` item (a re-upload Payload rejected; the run continues and verify fails that row) must be resolved before the window. Rows written: ________
- [ ] **Merge duplicate people (after every ETL run).** The ETL re-creates legacy `committee_contacts` rows by id, so a person the club entered twice (one row per job) comes back twice. Dry run, review, then apply: `pnpm dedupe:people --target $TARGET`, then `pnpm dedupe:people --target $TARGET --apply --confirm` (a group with conflicting phone/email/photo is listed and skipped; resolve it by hand or add `--prefer-primary`). Then `pnpm payload run payload/scripts/link-people-players.ts -- --target $TARGET` and the same with `--apply --confirm` to link people to players. Groups merged / conflicts: ________
- [ ] Run it again: **0 rows written**.
- [ ] `pnpm verify:cutover --target $TARGET --blob-store-id $PROD_STORE --preview-rehearsal` passes, including "registered rows: generateURL(prefix, filename) = legacyUrl" and the HEAD sample.

These runs are the first real exercise of the two-store path (the local fixture uses one store for both). If "upload reachability" fails here, look at the failing row's stored `prefix`/`filename` and which host was HEADed (rows registered in place: the production store; files the ETL uploaded: the preview store) before concluding the data is wrong. The operator shell has no `VERCEL_ENV`, so the `legacyUrl` read rule is not active there; the ETL and verify build URLs from `prefix`/`filename` and do not depend on it. On this two-store run the ETL cannot `head()` legacy blobs (wrong token), so a fallback re-upload takes its type from the download's `Content-Type`; in production it comes from `head()`.

### B.4 Check it

- [ ] The smoke list (F) on the preview branch URL, signed into Deployment Protection. Admin login works on the branch URL (`serverURL` and `csrf` are derived from `VERCEL_BRANCH_URL`/`VERCEL_URL`).
- [ ] **Legacy pending photo survives a reject.** In the admin, open an event with an ETL'd pending photo (Event photos, status Pending, from the legacy data). Its URL (`https://<production store>…/events/pending/…`): ________. Reject it. Then `curl -sI <that URL>` still returns **200**, and the function log shows `[blob] legacy blob kept (shared with rollback target): <that URL>`. This cannot fail on a preview: the plugin's delete would target the *preview* store (preview base URL, preview token), never the production blob, and `BLOB_DELETE_DISABLED=1` skips every delete anyway. It only shows the guard's `legacyUrl` branch is reached. The guard itself is proven by the int tests (`event-photos.int`, `wp1-verification.int`) and, after promotion, by production.
- [ ] **Story token edit** of a legacy story with inline images on the preview saves without "foreign image" errors, and the images stay.

Preview rehearsal passed on ________ (UTC) by ________.

---

## C. Local rehearsal (spec §12.5) — within 48 h of the window

On the operator's machine against local Postgres only, from a dump taken that week.

```bash
# dump: read-only production URL, operator shell only; keep the dump outside the clone
pg_dump "<production direct URL>" --schema=public --no-owner --no-privileges -Fc -f ../legacy-YYYYMMDD.dump
# fresh local databases: drop and recreate langlang_legacy and langlang_rehearsal
node -e '
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgres://postgres:postgres@127.0.0.1:54329/postgres" });
  await c.connect();
  for (const db of ["langlang_legacy", "langlang_rehearsal"]) {
    await c.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${db}`);
  }
  await c.end();
})()'
pg_restore --no-owner -d postgres://postgres:postgres@127.0.0.1:54329/langlang_legacy ../legacy-YYYYMMDD.dump
export DATABASE_URI=postgres://postgres:postgres@127.0.0.1:54329/langlang_rehearsal
export LEGACY_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/langlang_legacy
export PAYLOAD_PUSH=false
export PAYLOAD_SECRET=$(openssl rand -hex 32) NEXT_PUBLIC_SERVER_URL=http://localhost:3000
unset BLOB_READ_WRITE_TOKEN ALLOW_REMOTE_DB ALLOW_REMOTE_BLOB BLOB_DELETE_DISABLED VERCEL VERCEL_ENV VERCEL_URL
export PROD_STORE=<production Blob store id>   # as recorded at the top of this checklist
```

Use a **new shell**, not the B.2 one: that shell holds the preview `NEXT_PUBLIC_SERVER_URL` (wrong `serverURL`/`csrf` for `pnpm start` on localhost), `ALLOW_REMOTE_DB` and `BLOB_DELETE_DISABLED`; the clean clone has no `.env.local`, so `PAYLOAD_SECRET` and `NEXT_PUBLIC_SERVER_URL` must be exported here. (Run it from the clone root, where `pg` resolves. `WITH (FORCE)` needs Postgres ≥ 13; `createdb`/`dropdb` work too where the client tools are installed.) Then, against the fresh `langlang_rehearsal` with **no Blob token** (no `--preview-rehearsal`: without a token there is no second store):

- [ ] `pnpm payload migrate`
- [ ] `pnpm etl --target 127.0.0.1/langlang_rehearsal --dry-run --blob-store-id $PROD_STORE`, then the same with `--confirm`
- [ ] a second `--confirm` run writes 0 rows
- [ ] `pnpm verify:cutover --target 127.0.0.1/langlang_rehearsal --blob-store-id $PROD_STORE` passes
- [ ] `pnpm build && pnpm start` against it, and walk the smoke list (F)

Dump taken (UTC): ________ Rehearsal passed (UTC): ________ Delete the dump afterwards: [ ]

---

## D. Before the window

- [ ] B passed, and C passed within the last 48 h.
- [ ] **The window ends before 17:00 UTC** (E.2 to E.10). The legacy cron `/api/cron/players-sync` runs at 17:00 UTC, is a GET (the write freeze does not block it) and rewrites `public.players`, `player_seasons` (new ids), `player_aliases` and `player_sync_runs`: the ETL's source. If it overlapped, the ETL would read a half-synced source and verify would fail mid-window (or the Payload copy would be stale). If the window cannot avoid 17:00 UTC, prepare a second disabled Firewall rule denying `/api/cron/players-sync` on the legacy hosts, enable it at E.2 and disable it at E.10. Window end (UTC): ________
- [ ] **Production domain auto-assignment: OFF** (Settings → Domains / Git → "Auto-assign custom production domains"), as late as possible before the window. From now on a push to `main` (a legacy hotfix) builds but does not go live: promote such a deployment by hand (`vercel promote`) if one is needed before E. It stays off until the decommission (H). Done on ________ by ________.
- [ ] Add the **Production** scope to `ENABLE_EXPERIMENTAL_COREPACK=1` (A.2). It only affects production builds, which no longer take the domain.
- [ ] `feat/payload-cms` is **not merged** to `main`.
- [ ] `main` is an ancestor of the cutover commit (`git merge-base --is-ancestor origin/main <cutover commit>`). If `main` moved, merge it into `feat/payload-cms` first and repeat B.
- [ ] Every Production env var in A.2 is set.
- [ ] Firewall: login rate limit live; "deny POST" prepared and disabled (A.4).
- [ ] The committee knows the admin freeze time.
- [ ] Pre-cutover screenshots captured from the live legacy site (desktop and phone width), stored at ________:

| Page | URL | Screenshot file |
|---|---|---|
| Home | `/` | |
| Sponsors | `/sponsors` | |
| Gallery | `/gallery` | |
| Documents | `/documents` | |
| Contact | `/contact` | |
| People | `/people` | |
| Announcements | `/announcements` | |
| Events | `/events` | |
| One event | `/events/<id>` | |
| History | `/history` | |
| One story | `/history/<slug>` | |
| Players | `/players` | |
| One player | `/players/<slug>` | |
| Fixtures | `/fixtures` | |

- [ ] Note for the smoke list: an old event id ________, an RSVP edit link `/events/rsvp/<token>` ________, a story slug with inline images ________, a draft `/history/drafts/<viewToken>` ________, a player slug ________, and a phone that has RSVP'd on the legacy site.

---

## E. The window (spec §13.2)

Operator shell: the clean clone from B.2, but with **production** values. The same `read -rs` pattern; nothing is written to a file.

```bash
unset HISTFILE
export ALLOW_REMOTE_DB=yes ALLOW_REMOTE_BLOB=yes PAYLOAD_PUSH=false
unset BLOB_DELETE_DISABLED
read -rs DATABASE_URI && export DATABASE_URI               # PRODUCTION direct (non -pooler) URL
export LEGACY_DATABASE_URL="$DATABASE_URI"
read -rs BLOB_READ_WRITE_TOKEN && export BLOB_READ_WRITE_TOKEN   # PRODUCTION store token
read -rs PAYLOAD_SECRET && export PAYLOAD_SECRET           # the Production PAYLOAD_SECRET
export NEXT_PUBLIC_SERVER_URL=https://langlangcricketclub.com
export TARGET=$(node -e 'const u=new URL(process.env.DATABASE_URI);console.log(u.hostname+u.pathname)')
mkdir -p ../cutover-reports
echo "$TARGET"
```

Here the token's store is the legacy store, so `--blob-store-id` is not needed; the scripts refuse one that differs from the token's store (and refuse `--preview-rehearsal`).

Reports go to `../cutover-reports/`, outside the clone: step 8 deploys from the clone with the Vercel CLI, which (as far as we know) honours `.vercelignore`, not `.gitignore`, and the repo has no `.vercelignore`: a report under `tmp/` could ship legacy data in the deployment source.

| # | Step | Time (UTC) | By |
|---|---|---|---|
| 1 | Announce the admin freeze: the committee stops editing in the old `/admin`. | | |
| 2 | **Freeze public writes:** enable the Firewall "deny POST" rule (and the cron deny rule, if D needed one). Check that a POST to the apex is blocked: `curl -s -o /dev/null -w '%{http_code}' -X POST https://langlangcricketclub.com/events` → 403. | | |
| 3 | Record the Neon restore point (timestamp) of the production branch: ________ | | |
| 4 | `pnpm payload migrate` — creates schema `payload` and its tables; `public.*` is untouched. | | |
| 5 | `INITIAL_ADMIN_EMAIL=… INITIAL_ADMIN_PASSWORD=… pnpm seed:admin --target $TARGET --confirm` | | |
| 6 | `pnpm etl --target $TARGET --dry-run --report ../cutover-reports/e-etl-dry.json`. Review orphans, flagged media, collisions, prefix fallbacks and duplicate URLs against the B/C reports; a new `media-duplicate-url` item is a document or gallery row that will get its own copy (as in B.3; nothing to fix, check it is expected). Anything new: ________ | | |
| 7 | `pnpm etl --target $TARGET --confirm --report ../cutover-reports/e-etl.json` → `VERIFY PASSED`. Then `pnpm verify:cutover --target $TARGET` passes (per-row URL equality included). Rows written: ________ | | |
| 7a | **Merge duplicate people, then link them to players** (after the ETL, which re-creates legacy duplicates by id): `pnpm dedupe:people --target $TARGET` (review), `pnpm dedupe:people --target $TARGET --apply --confirm`, then `pnpm payload run payload/scripts/link-people-players.ts -- --target $TARGET --apply --confirm`. Conflicts skipped: ________ | | |
| 8 | **Production deployment without the domain**, from the clean clone (`vercel link` to the project first; there is no `tmp/` and no report or dump file inside the clone): `vercel deploy --prod --skip-domain`. Its build runs `payload migrate` (a no-op now). Deployment URL: `https://____________________`. On it: `/admin` login, the dashboard and a collection list load, and two public pages render. (Saving in the admin is checked after promotion: `csrf` trusts only the apex origin.) | | |
| 9 | **Promote that deployment:** `vercel promote <deployment URL>`. The apex now serves Payload; the next 17:00 UTC cron runs on it. **Step-9 time** (for `export:since`): ________ | | |
| 10 | Disable the Firewall "deny POST" rule (and the cron deny rule, if enabled). | | |
| 11 | Run the smoke list (F) on the apex. | | |
| 12 | Fast-forward `main`: `git push origin <cutover commit>:main` (a fast-forward; never force). The resulting production build does not take the domain (auto-assign is off). Leave auto-assign off until H. Instant Rollback stays the rollback path. | | |
| 13 | Invite the committee: admins create the other users in the Payload admin (Users → Create). | | |

---

## F. Smoke list (spec §13.3)

| Check | Preview (B) | Apex (E.11) |
|---|---|---|
| Home, sponsors, gallery, documents, contact, people and announcements render as before (compare with the D screenshots) | [ ] | [ ] |
| `/events` and an `/events/<old id>` | [ ] | [ ] |
| RSVP from a phone that RSVP'd before: the cookie is recognised and the answer prefilled | [ ] | [ ] |
| An old `/events/rsvp/<token>` link opens and edits | [ ] | [ ] |
| `/history/<old slug>` with inline images | [ ] | [ ] |
| An old `/history/drafts/<viewToken>` and its edit link | [ ] | [ ] |
| `/players/<slug>` with seasons and honours; `/fixtures` | [ ] | [ ] |
| Admin: log in | [ ] | [ ] |
| Admin: edit an announcement and see it live | [ ] | [ ] |
| Admin: approve a pending photo | [ ] | [ ] |
| Admin: trigger player sync (Players → "Run sync now") | [ ] | [ ] |
| Admin: Refresh PlayHQ data (dashboard) | [ ] | [ ] |
| `sitemap.xml` lists events, stories and players with their original `lastModified` dates | [ ] | [ ] |
| (Preview only) rejecting a legacy pending photo logs "legacy blob kept" and its production URL still returns 200 (B.4; cannot reach the production store from a preview) | [ ] | — |

---

## G. Rollback (spec §13.4)

**Trigger:** any smoke failure that cannot be fixed forward within 30 minutes. Decision by ________ at ________ (UTC).

1. [ ] Vercel → Deployments → the previous production deployment (the legacy app) → **Instant Rollback**. It reads `public.*`, which the new app never wrote; its images are intact because the new app never deletes a blob that has a `legacyUrl`.
2. [ ] If `main` was already fast-forwarded (E.12): `git push origin <legacy commit>:main --force-with-lease` (the only force push in this runbook), so the next push cannot redeploy Payload. Legacy commit: `____________________`
3. [ ] If the "deny POST" rule is still on, disable it.
4. [ ] Export what was written in Payload after step 9 (it is lost on rollback): `pnpm export:since --target $TARGET --since <step-9 time>` → `tmp/export-since.csv` (move it out of the clone before any further `vercel deploy` from it). Hand it to the committee for re-entry by hand.
5. [ ] **Before a second attempt**, reset the `payload` schema — it is not reusable (skip-if-exists would keep stale rows): `pnpm reset:payload-schema --target $TARGET --confirm` (drops schema `payload` only). Then repeat E from step 1. Fallback when the schema must be kept: `pnpm etl --target $TARGET --confirm --update --reconcile-deletes`.

Blobs uploaded natively during a failed window stay in the store as orphans; that is accepted.

---

## H. Decommission (≥ 30 days after a stable cutover; separate PR, spec §13.5)

- [ ] Final `pg_dump --schema=public` archived at ________, then drop the `public.*` legacy tables.
- [ ] Remove `LEGACY_DATABASE_URL` and the ETL (or move it to `payload/scripts/legacy/`), and `PAYLOAD_ETL`.
- [ ] Set `LEGACY_BLOBS_RELEASED=yes`, drop the `legacyUrl` file-replace guard.
- [ ] Re-enable production-domain auto-assignment.
- [ ] Delete the Neon preview branch and the preview Blob store if no longer needed.

---

## Sign-off

| | Name | Date |
|---|---|---|
| Runbook reviewed and accepted | | |
| Preview rehearsal (B) passed | | |
| Cutover complete, smoke list green | | |
