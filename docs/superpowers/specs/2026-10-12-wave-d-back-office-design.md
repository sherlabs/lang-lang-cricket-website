# Wave D: socials leftovers and the club back office (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #21 (leftovers only), #24, #25, #26, #27, #28, #29, #30. Out of scope: any payment provider or card handling, payroll or wages, accounting export (Xero/MYOB), a member self-service portal or login, member-facing balances, public minutes, live calls to any external service (email is env-gated, section 9), two-factor, a `treasurer` role (flagged in section 14), bounce/complaint webhooks (flagged), PDF generation (print CSS only).

| WP | Issues | One line |
| --- | --- | --- |
| WP-0 | #21 | Toss graphic (from the match store), name-only sponsor thank-you, minimal-style leaders spacing fix. |
| WP-1 | #24 | One "Club office" menu entry and landing page; member directory with admin-only personal data; exports, sends, erasure and bulk changes are logged (reads of one record are not). |
| WP-2 | #25 | Membership tiers, manual payments (with a payer and an optional target), waivers, derived per-game status for the open season, closed seasons frozen as charge snapshots, household view, credit, treasurer report. |
| WP-3 | #26 | Volunteer roster by week, per-person availability links, confirm week into an hours ledger (paid vs volunteer), grant report. |
| WP-4 | #27 | Meetings from templates, attendance, motions and votes, actions, minutes (items can be marked restricted); committee seats that hand over at the annual meeting; office-bearer-only documents. |
| WP-5 | #28 | Season diary (annual jobs) with overdue and blocked callouts; strategic plan (pillars, objectives, linked jobs); one-click generic starter content. |
| WP-6 | #29 | Bulk email behind an `EmailAdapter` seam (mock in tests and dev, Resend when env is set), unsubscribes, suppression, Payload password-reset email. |
| WP-7 | #30 | Stock and merch: items, a movements ledger, issue to a person, returns, what is owed back. |

Build order: WP-0 (independent), WP-1 (foundation every other WP uses), WP-3, WP-5, WP-7, then WP-4, WP-2, WP-6 last. Each ships alone behind its own migration and doc, and the wave can stop after any WP.

**Minimum viable set: WP-0, WP-1, WP-3, WP-5, WP-7.** These deliver the member directory, the volunteer roster and hours, the season diary and plan, and stock, none of which need money handling or outbound mail. The fee ledger (WP-2), meetings with documents (WP-4) and bulk email (WP-6) carry the most risk (financial data, legal-ish records, outbound mail), so they come last, in that order of increasing external dependency. WP-5 needs only a seat to own a job, so `committee-seats` (title, holder, `holderUser`, `officeBearer`, `termStart`, `termEnd`, `handoverNote`) is created by migration `d5_diary_plan` if WP-4 has not shipped, and WP-4 reuses it unchanged. WP-6 needs the member filters from WP-1 and picks up the fee and volunteer segments only if those WPs exist.

Product goal (applies everywhere): this repo is reused for other clubs. Everything club-specific (colours, crest, fonts, names, copy, hosts, cookie names, currency, shift types, sender identity) comes from the `theme`/`club`/`office-settings` globals or env (`config/site.ts`), never code. Tailwind `brand-*` tokens, no hex literals, no club-name strings outside `config/site.ts` and seed defaults. Starter content (diary jobs, plan, meeting templates, shift types) is generic and club-neutral. Regionally specific wording is configuration too: address labels (locality, region, postal code), the compliance and unsubscribe wording, category names and the name of the annual meeting come from `office-settings` with neutral defaults, never from code strings. The guards in section 12 scan the new folders.

## 0. Findings that shape the design

Checked against this branch.

1. **Wave C is built.** `lib/social/` has nine graphic types (`TYPE_KEYS` in `lib/social/types.ts`), three styles (`kits.ts`), specs in `lib/social/specs/*`, loaders in `lib/social/sources/*`, a height budget in `fit.ts` that every test pushes every type, size and style through, and a queue with adapters. WP-0 extends these; it adds no new renderer.
2. **Toss data is already stored.** `matches` carries `tossWinnerTeamId`, `tossChoice` (`bat`|`bowl`) and `clubWonToss` (written from PlayHQ `coinToss` in `lib/playhq/match-rows.ts`), all nullable. No new sync work.
3. **Sponsor thank-you draws a grey tile today.** `lib/social/render.tsx` (`case 'logos'`) draws a `surfaceAlt` tile with the initial when `src` is null. The spec passes `name: ''` for a single sponsor, so a logo-less single sponsor would also show no name in the block (only in the headline).
4. **Minimal leaders blank space has a likely cause.** `stats-leaders` calls `cutRows(rows, size, 0)` with no style, so the row count and height are the same for every style, while `availableHeight()` in `fit.ts` is larger for `minimal` (corner crest at 0.7 scale, plain frame). The unused height shows as blank space. Reproduce first (section 3.3); this is a hypothesis.
5. **`people` is public.** `People` has `read: anyone` and feeds Contact, Home and People pages. Private fields must never be added to it. `players` is also public-read for visible rows. So member contact data cannot live on either; `members` is a new admin-only collection that links to them.
6. **`match-appearances` already supports fees.** It has `match`, `player`, `isClubSide`, `isFillIn`, `isRegisteredPlayer`, `nameKey`; `matches` has `seasonName` and a date. Appearances with `player` null cannot be charged and are reported as a data-quality count, not guessed.
7. **Forgot-password is hard-disabled in code** (`payload/collections/Users.ts`, `beforeOperationGuard`, `operation === 'forgotPassword'` throws 403) and `payload.config.ts` has no `email` adapter. WP-6 makes that conditional on a configured adapter and adds a throttle bucket (the `rest-login` bucket in `lib/throttle.ts` is the model).
8. **Files are public by default, and uploads are client-side.** `payload.config.ts` sets `disablePayloadAccessControl: true` for every blob collection, so uploaded files are direct public URLs, and sets `clientUploads: true` so the browser uploads straight to Blob. Office-bearer-only documents need `disablePayloadAccessControl: false` so downloads go through Payload's access-controlled route, **and** must not use client uploads, because a client upload hands the blob URL to the uploading browser. The underlying blob URL is unguessable but not a secret-grade store (section 6.5, section 14).
9. **GraphQL is disabled.** "REST and GraphQL" in each access table therefore means REST and the Local API (the Local API ignores access unless `overrideAccess: false`, so every `lib/*-queries.ts` states its own filter, as the repo rule says). A test pins `graphQL.disable`.
10. **Menu caps.** `everydayNav` is at its cap of 16, `jobTiles` at 14. This wave adds exactly one `everydayNav` entry (Club office, cap 16 to 17; justification: it replaces seven would-be entries, so the committee menu grows by one, not seven) and no `jobTiles`. Everything else is reached from the landing page or sits under Advanced.
11. **Existing reusable pieces:** `isStaffUser`/`isAdminUser`/`isAdmin`/`isAdminField` (`payload/access`), `hiddenFromEditors`, HKDF labels and `deriveKey` (`lib/secrets.ts`), `ipHit`/`hit` throttle (`lib/throttle.ts`), `isJunior`/`isSocialEligible` (`lib/social/eligibility.ts`), `lib/stats/csv.ts` (`toCsv`, `csvCell`, `needsGuard`; already formula-safe, see section 1), claim/lease queue (`lib/social/queue-core.ts`), notification centre (`payload/components/NotificationCentre.tsx`, `payload/admin/copy.ts`, `dashboardCards.ts`), the availability link and cookie pattern (`lib/availability-link.ts`), `lib/selection/season.ts` and `SEASON_START_MONTH`/`SEASON_NAME_FORMAT` in `config/site.ts`.

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit `git add` paths, never `git add -A`, never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`: `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); verify hosts are `127.0.0.1` before DB work; no Blob token; no remote DB; no Vercel CLI. Anything that could reach PlayHQ runs with `PLAYHQ_CLIENT_ID=` empty. Dev servers on ports 4200-4299 only (the repo `CLAUDE.md` says 3400-3499; this run's brief overrides it, and nothing committed depends on either). **This wave makes no external call.** Email, social networks and the AI gateway are mocked in tests and off when env is unset.

**Migrations.** One per WP from `pnpm payload migrate:create <name>`, schema-qualified (`"payload"."..."`), `.ts` and `.json` committed, club-neutral SQL (function defaults, as `Theme` does): `d1_members_office`, `d2_membership_fees`, `d3_volunteers`, `d4_meetings_seats`, `d5_diary_plan`, `d6_email`, `d7_stock`. WP-0 has no migration. After each: `pnpm generate`, `git add payload-types.ts "app/(payload)/admin/importMap.js"`, then `pnpm check:migrations` and `pnpm check:generated` pass. Dev DB reset: `DROP SCHEMA payload CASCADE` via node + pg, then `pnpm payload migrate`.

**Staff means staff.** Staff is admin or editor (`isStaffUser`). Selectors are a separate role and get nothing from this wave. New code never writes `Boolean(user)` or `!req.user` as an access check; `tests/staff-guard.test.ts` scope is extended (section 12). Server actions and route handlers are public POSTs: each re-derives the caller (`getPayload().auth({ headers })`), validates input with a pure function, and derives `createdBy`, status and totals on the server, never from form fields.

**Access vocabulary** used in every table below: public (anyone), token (holder of a signed link), selector, staff (admin or editor), admin, office-bearer (admin, or a staff user who currently holds a seat marked office-bearer, section 7.3), nobody (no REST write; only a server action or script writes, using `overrideAccess` after its own check).

**Personal and financial data rules (hard).**
- Personal data (contact details, date of birth, address, emergency contact, ledger rows with a person and an amount, email addresses) is admin-only in REST and the Local API with `overrideAccess: false`, and never reachable from a public query. Every field on a personal collection declares `access.read`, `access.update` (and `create`) explicitly (`isAdminField` or stricter); a test fails if one omits it.
- Editors never read member contact data. Editor-facing screens get **scoped name projections** from `lib/members-queries.ts`: `listMemberNames(screen)` returns `{ id, displayName }` only for members relevant to that screen, generated server-side after a staff check. Screens: `roster` (members with the `volunteer` or `committee` role), `stock` (active members who are players, volunteers, committee or coaches), `actions` (committee role and seat holders). A junior (`isJunior`, the socials rule) is shown as first name and last initial only ("Sam T."). There is no "all members" projection for editors. Whether editors should see even this is a **decision, not a settled default** (section 14).
- Paid status is employment information. Editors never see per-person `paid` hours or a per-person paid flag: they see rostering without the `kind` of an assignment and **totals only** for paid hours (section 5.2). Admins see everything.
- No card data anywhere: no field, no provider, no card-shaped text accepted in free-text fields (a Luhn-based validator, `looksLikeCardNumber`, rejects 13-19 digit runs in reference and note fields).
- CSV exports are admin-only POSTs. The cell escaping is **reused, not rebuilt**: `lib/stats/csv.ts` (`toCsv`, `csvCell`, `needsGuard`) already guards `= + - @ | tab CR`, the full-width lookalikes and leading whitespace, with a `'` round-trip (`unescapeCell`), which is stricter than the list this wave would have written. Wave D adds only an audited-export wrapper, `lib/office/export.ts` (`auditedExport({ module, filterSummary, header, rows, includeSensitive })`), that checks admin and same-origin (`Origin`/`Sec-Fetch-Site`), writes the `office-audit-log` row (user, module, filter summary without free-text search terms, row count, time, whether sensitive columns were included) before streaming, calls `toCsv`, and sets `Cache-Control: no-store`. **`dateOfBirth`, emergency contact and notes are excluded from every export by default** and included only behind an explicit "Include date of birth, emergency contact and notes" tick, which is recorded in the audit row.
- Audit scope is stated plainly: the log records exports, email sends, personal-data removal and bulk member changes. **Opening a single member's record is not logged**, and docs and the WP-1 summary do not claim it is.
- Erasure: a member can be archived (status past) or have personal details removed by an admin. The action blanks every contact field and the typed name, keeps ledger rows against a "Former member" label, bumps `volunteerLinkVersion` so old personal links die (archive and `doNotEmail` bump it too), and **scrubs every copy of the person's data held elsewhere**: `email-recipients.email` and `firstName` snapshots for that member are blanked (the row, status and counts stay), and the action refuses to run if it cannot reach those tables. The one deliberate exception is the `email-suppressions` row, kept because honouring an unsubscribe is a legitimate retention. `email-campaigns.audience` and `office-audit-log.summary` never hold addresses or names by construction (they store a filter spec of keys and enumerated values, validated by a pure function that drops free text), and a test pins that. The action writes an audit row. See section 9.2 for the time-based purge of recipient snapshots.
- Ledgers are append-only: payments, waivers, hours, stock movements and closed-season fee charges are voided (with who, when, why), never edited or deleted. Reports are reproducible only for what is stored: the **open** season's fee figures are derived from live match data and can change when that data changes (section 4); closing a season freezes them.
- Money is integer cents. Currency and locale come from `office-settings` (default from `config/site.ts`, `OFFICE_CURRENCY`, `OFFICE_LOCALE`); nothing assumes dollars in code.

**Shared building blocks (new, built once in WP-1).**

| Need | Where | Notes |
| --- | --- | --- |
| Module registry | `lib/office/modules.ts` | Key, label, plain hint, admin path, role (`admin`|`staff`), env gate. Drives the landing page, the notification lines, the help page and the tests, so a module cannot appear in one and not another. |
| Landing page | `payload/components/OfficeView.tsx`, route `/office` | Tiles per role, one stat line per tile, callouts. |
| Name projection | `lib/members-queries.ts` | Staff-checked, `listMemberNames(screen)`, `{id, displayName}` only, scoped to relevant members, juniors as first name and initial. |
| CSV | `lib/stats/csv.ts` (existing) + `lib/office/export.ts` | `toCsv` is reused unchanged; the wrapper adds admin check, same-origin check, audit row and sensitive-column opt-in. |
| Audit | `office-audit-log` collection + `lib/office/audit.ts` | Admin read; nobody write. Logs exports, email sends, personal-data removal, bulk member changes. |
| Money | `lib/office/money.ts` | `formatMoney(cents, settings)`, `parseMoney(text)` (rejects negatives, more than two decimals, absurd sizes). |
| Season | `lib/office/season.ts` | Thin wrapper over `config/site.ts` season rules: `currentSeason(date)`, `seasonRange(name)`. |
| Settings | `office-settings` global | Admin only, under Advanced. Currency, locale, shift types, diary lead days, sender text, rate limits. Function defaults. |

**Docs.** New: `club-office.mdx` (landing, access model, exports and audit), `member-directory.mdx`, `membership-fees.mdx`, `volunteer-roster.mdx`, `committee-meetings.mdx`, `season-diary-and-plan.mdx`, `bulk-email.mdx`, `stock-and-merch.mdx`. Updated: `social-graphics.mdx` (toss, name-only sponsor, leaders), `index.mdx` (new "Club back office" table), `committee-admin.mdx` (the one new entry), `admin-notifications.mdx` (new lines), `users-and-authentication.mdx` (password reset), `multi-club-template.mdx` (new env and settings), `.env.example`. Each follows the `tests/feature-docs.test.ts` shape (frontmatter plus Persona, Why it was built, What it does, How to use it, Not included/deferred) and describes only what is built, linking deferred items to their issue and #38. Ticking items in #38 is left to the human.

**Efficiency.** Iterate with `tsc --noEmit`, `pnpm generate`, single vitest files, eslint on changed files. Full vitest once and one `next build` in the final Verify step. Never two vitest runs at once; pipe big output through `tail`/`grep`.

## 2. WP-0: socials leftovers (#21)

### 2.1 Toss graphic

- **Type.** Add `'toss'` to `TYPE_KEYS`, a `tossSpec` in `lib/social/specs/toss.ts` registered in `specs/index.ts`, a loader `lib/social/sources/toss.ts`, and its entry wherever the registry lists types (`lib/social/registry.ts`, caption defaults, composer type list, help text). All sizes and styles come free because specs emit generic blocks (`kicker`, `headline`, `text`) that the one renderer and the `fit.ts` budget already handle.
- **Source.** `getMatchByGameId` (match store). Data: `clubWonToss` (true/false/null), `tossWinnerTeamId`, `tossChoice`, opponent name (`opponentOrgName`), round or date, venue if stored, grade label. Winner name = club short name from the `club` global when `clubWonToss === true`, else `opponentOrgName`. No player names, so the junior-eligibility rule is untouched.
- **Absent data hides the type for that game.** A game has toss data when the winner is known (`clubWonToss !== null` or `tossWinnerTeamId` present with a resolvable team name). `tossChoice` is optional: headline "X won the toss and chose to bat" when present, "X won the toss" otherwise. If the winner is unknown, the game is omitted from the Toss chooser (`/api/admin/social/sources?type=toss`), the loader returns the same plain not-found as other types, and the composer shows "Toss details are not in yet for this game." when a stale link is opened. A game that has not started has no toss; the chooser lists only games with toss data.
- **Layout.** Kicker "The toss" (copy from the spec's label, not a club string), headline the sentence above, text line "vs {opponent}  |  {round or date}", optional venue line. `describe`/`captionVars`: `winner`, `choice`, `opponent`, `round`.
- **Tests.** Unit: `parse` rejects bad ids; `layout` for club-won/bat, club-won/bowl, opponent-won, winner without choice; `empty` when no winner. Existing size x style x type matrix test (`fit` overflow, ellipsis on a 60-character opponent name) grows from 9 to 10 types (update the counts in the same commit). Source test with a stored-match fixture: toss null yields no chooser entry. Rendered-PNG smoke through `themedImageResponse` for all 9 size/style cells.

### 2.2 Sponsor thank-you, name-only fallback

- A sponsor with no drawable logo (null, WebP/SVG, or load failure) renders name-only: no tile, no initial, no grey box. In `render.tsx` the `logos` block keeps logo-bearing items only. The spec's `layout` splits sponsors: those with a logo go in the `logos` block; the rest go in a new `names` block (`{ kind: 'names', items: { name, tier }[] }`) drawn as large display-font text lines (one per line when 3 or fewer, wrapped line otherwise), tier in the accent text colour beneath. If no sponsor has a logo, the layout is kicker, headline, `names` block, optional message line. For a single sponsor with no logo, the headline already carries the name, so no second block (no duplicate); the tier shows as the kicker suffix.
- `fit.ts` `blockHeight` gains a `names` case (line height times count plus tier lines) so the overflow test covers it; `logosFor` counts only logo items.
- The `Sponsor` loader must report why a logo was dropped only in the composer's warning line ("X has no logo we can draw, so the name is shown"), not in the image. The footer sponsor strip (other types) already skips logo-less sponsors silently; unchanged.
- **Tests.** Unit: layout for 1/2/4 sponsors x all-logo / none / mixed; no `initial` text produced; matrix test includes a no-logo fixture at all sizes and styles; snapshot of block kinds, not pixels. Check nothing else relied on the initial fallback (Appendix B).

### 2.3 Minimal-style season leaders blank space

- **Reproduce first.** Render `stats-leaders` with 3 and 5 rows in `minimal` at square, portrait and landscape from the seeded fixture and measure used height against `availableHeight('minimal')`; commit the measurement as a failing test (`used / available >= 0.8`, the density target already used for other types, or the existing density constant if one exists) before changing code.
- **Fix (if the hypothesis holds).** Pass the style and the available height into the leaders layout (`layout(d, style, size)` already receives style; use it) and make `cutRows` style-aware: row height and text size scale up (capped, e.g. up to 1.35x) to fill the space the minimal masthead frees, rather than adding rows (the requested count of 3 or 5 stays). Bold and classic output must not change, so their golden block lists stay byte-identical in the test.
- **Tests.** The density assertion for all three styles x three sizes x two counts; existing overflow matrix still passes.

### 2.4 WP-0 acceptance (local, no external calls)

`pnpm vitest run tests/social-*.test.ts` (the touched files), `pnpm seed:demo` then open `/admin/social` on port 42xx, pick Toss for a seeded game that has toss data (one seeded game without it is absent from the chooser), view all sizes and styles, pick Sponsor thank-you with a seeded logo-less sponsor, view Season leaders in Minimal. Docs: `social-graphics.mdx` updated. Seed: one stored match with toss data and one without; one logo-less sponsor.

## 3. WP-1: Club office landing and member directory (#24)

### 3.1 Data model (migration `d1_members_office`)

`members` (admin only):

| Field | Notes |
| --- | --- |
| `player` rel players, unique, optional | **Link, do not duplicate.** When set, name, photo and active flag are read from the player; the name fields below are hidden and ignored. |
| `person` rel people, optional | A committee/coach contact record for the same human. |
| `firstName`, `lastName`, `preferredName` | Required only when neither link is set (validate hook). |
| `roles` hasMany select | `player`, `parent`, `life-member`, `volunteer`, `sponsor-contact`, `committee`, `coach`, `supporter`, `other`. One person, several roles. |
| `status` select | `active` (default), `past`. Directory also shows the derived "played this season" from `isActiveDerived`. |
| `membershipSince` date, `lifeMemberSince` int | Optional. |
| `email`, `phone` | Trimmed; empty saved as null so "missing" filters are exact. Email validated, lowercased. |
| `addressLine`, `locality`, `region`, `postalCode` | Optional. Neutral field names; the labels shown to users (for example suburb, state, postcode) come from `office-settings.addressLabels`, so no regional term is in code. |
| `dateOfBirth` date | Optional; used only to flag juniors with `isJunior` (the same function as socials). |
| `guardians` rel members hasMany | For a junior without their own email; the guardian's email is used for mail (WP-6). |
| `emergencyContact` group (`name`, `phone`, `relationship`) | Admin only. |
| `doNotEmail` checkbox | Counts as suppressed in WP-6. |
| `notes` textarea | Hint: "Do not record medical details here." |
| `volunteerLinkVersion` int (server-owned) | For WP-3 availability links. `access.update` nobody; bumped by an action, and automatically on erase, archive and `doNotEmail` so old links stop working. |
| `importedFrom` select | `manual`, `players`, `csv` for the audit trail. |

Also `office-audit-log` (`user`, `action` select export|email-send|erase|bulk-change, `module`, `summary` (keys and counts only, never names, addresses or free-text search terms), `rowCount`, `includedSensitive`, `at`) and the `office-settings` global (WP-1 adds currency, locale, shift types for WP-3, diary lead days for WP-5, sender text for WP-6, with club-neutral function defaults, and `addressLabels`, `complianceText` and `unsubscribeText` for section 9).

### 3.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `members` REST + Local API (find, findByID, count, create, update, delete) | deny | deny | deny | allow (delete = archive action preferred; hard delete allowed) |
| `members` any field | no | no | no | allow (each field declares `isAdminField`) |
| `office-audit-log` | deny | deny | deny | read; nobody writes |
| `office-settings` | deny | deny | read of non-sensitive fields via `lib/office/settings.ts` server helper only | read/write |
| Name projection (`listMemberNames(screen)`) | n/a | n/a | allowed, `{id, displayName}` only, scoped to the screen, juniors as first name and initial | allowed |
| Export `POST /api/admin/office/export/members` | 404 | 404 | 404 | allowed, logged; date of birth, emergency contact and notes only behind a tick |
| Public site | no route reads `members` | | | |

GraphQL disabled; a test asserts it. A member of the public learns nothing: `players` and `people` do not gain fields, and a test compares their `find` output keys to a stored allowlist.

### 3.3 UI

- **Menu.** `everydayNav` gains `{ key: 'office', label: 'Club office', path: '/office', matches: ['/office'] }`. The nav `path` is relative to the admin route, so the URL a person sees is `/admin/office` everywhere (this spec writes `/admin/office/...` for all office pages; there is no separate top-level `/office`). Cap 16 to 17 in `tests/admin-visibility.test.ts` with the justification as a one-line comment: the single entry replaces seven would-be entries and is the only new `everydayNav` entry; the `officeCollections` rule stays that nothing else in the wave gets a menu entry. `advancedNav` gains `{ key: 'office-settings', label: 'Club office settings', path: '/globals/office-settings' }` (admin only, `admin.hidden: hiddenFromEditors`). No `jobTiles` change. New `officeCollections` list in `navigation.ts` (like `socialCollections`): every collection in sections 3 to 9, each classified `admin` or `staff`, absent from both menus; the test asserts each is reachable from `lib/office/modules.ts` or an explicit parent view, and unclassified collections fail.
- **Blocking spike before any WP-1 code (Appendix B item 1).** Whether `admin.hidden` also blocks the native list and edit routes decides the navigation plan, so it is settled first, with a throwaway test against this Payload version. If `hidden` blocks the edit route, collections stay un-hidden but off the menus (guarded by access, not by hiding); if it does not, admin-only collections use `hidden: hiddenFromEditors`. WP-1 does not start until the answer is written into this spec.
- **Native forms are the admin fallback, not the everyday UI.** Long Payload forms and relationship pickers are poor on a phone for non-technical volunteers. The high-frequency flows get custom mobile-first quick-add forms (server action, labelled fields, one screen, large targets): **Add member** (name, roles, email, phone, nothing else), **Add diary job** (title, due, owner seat, category) and **Add stock item** (name, size, category, reorder level, starting quantity). Everything else (tiers, templates, settings, rare edits) uses the native pages, which remain reachable for admins from the matching module page ("Advanced edit").

- **Landing `/admin/office`.** One page, plain English, mobile first. A grid of module tiles (icon, name, one-line hint, one stat line such as "14 members have no email"), shown per role: editors see Volunteers, Meetings, Diary & plan, Stock; admins also see Members, Fees, Email (Email appears only when a provider is configured, section 9). Callouts above the tiles (overdue jobs, empty shifts this weekend, fees owing for admins). Every stat line states what it excludes (section 8). Footer links for admins: Office settings, "Exports and sends log".
- **Directory `/admin/office/members`** (admin). Search by name, filter chips: Status (Active/Past), Role (one per role), Season membership (from WP-2 once present), Age (Juniors), **Missing email, Missing phone, Missing both, Missing guardian (junior)**. Completeness strip at top ("312 members: 41 no email, 58 no phone"). Rows are cards on a phone and a table from 768 px; each links to the native edit page. Actions: Add member, "Add members for players who have none" (creates linked rows, role player, no contact data, idempotent via the unique `player` constraint), Export CSV (current filter; sensitive columns off unless ticked), duplicate warning when two members share an email. 50 rows per page, server pagination.
- **Quick-add and edit.** Add member uses the quick-add form above. The native edit page for one member (admin fallback): all fields with plain labels and helper text; read-only "Fees", "Volunteering" and "Email" summary panels added by later WPs. A "Remove personal details" button (admin, confirm dialog, audited).

### 3.4 Tests

- Unit: filter builder (`lib/office/member-filters.ts`: parse query params to a safe `Where`, unknown keys dropped), `displayNameFor` (linked player wins over typed name), `looksLikeCardNumber`, `auditedExport` wrapper (default columns exclude date of birth, emergency contact and notes; the tick includes them and is recorded; the CSV itself is `toCsv`, already covered by the stats CSV tests, so one smoke case with `=cmd` suffices), `listMemberNames(screen)` shape (scoped by screen, junior rendered as first name and initial, no all-members call for editors).
- Int: **access matrix** `tests/int/office-matrix.int.test.ts` (new): every office collection x anonymous / selector / editor / admin x find, findByID, count, create, update, delete via the Local API with `overrideAccess: false`, against a declared expectation table that also drives the docs table; plus the REST path for members. **Field-level audit** `tests/office-field-access.test.ts` (unit, walks the sanitised config): every field of every personal collection has explicit access functions that are admin-or-stricter; a list of sensitive names (`email`, `phone`, `address*`, `locality`, `region`, `postalCode`, `dateOfBirth`, `emergency*`, `notes`) appears on no collection outside the office set. Int: editor gets 403 on a members export; admin export writes one audit row with the row count; the export body has formula cells neutralised and omits date of birth, emergency contact and notes unless ticked (and the audit row records the tick); erasing details blanks every contact field and keeps ledger rows.
- Public leak test: render `/players`, `/people`, `/contact` and a player profile for a seeded member who is also a player and committee person; the page text contains none of their email, phone or address.

### 3.5 Seed and acceptance

`seed:demo`: about 40 members built from the demo players plus parents, a life member, a volunteer, a sponsor contact; deliberately 6 with no email, 9 with no phone, 3 with neither, 4 juniors with a guardian. Acceptance: migrate a clean `langlang_dev`, `pnpm seed:demo`, start on 42xx, sign in as admin (directory, filters, export, audit row) and as the seeded editor (landing shows no Members/Fees/Email tiles; `/admin/collections/members` 403/404; REST `GET /api/members` 403).

### 3.6 Risks

Editors seeing names via the projection is a policy choice (section 14), narrowed by scope and by the junior rule. Single-record reads are not audited; if a club wants that, it is a follow-up (a read hook writing an audit row). Native admin pages for a hidden collection depend on the Payload routing behaviour, which the blocking spike above settles before WP-1 starts. Importing real members is out of scope; a CSV import is deferred with its own issue because it needs mapping UI and duplicate rules.

## 4. WP-2: membership tiers and match-fee ledger (#25)

### 4.1 Data model (migration `d2_membership_fees`)

- `membership-tiers` (admin): `season` (text, season name format), `name`, `kind` select `upfront` | `per-match` | `free`, `upfrontCents`, `perMatchCents`, `active`. One tier can be both (upfront membership plus a match rate) by setting both amounts. **Amounts are frozen once a season has any membership or charge on them**: an edit of `upfrontCents` or `perMatchCents` is refused by a hook with the plain message "This rate is in use. Create a new tier or copy it for next season." Name and `active` stay editable.
- `memberships` (admin): `member`, `season`, `tier`, `joinedOn`, `note`, and **`upfrontCentsSnapshot`, `perMatchCentsSnapshot`** copied from the tier when the membership is created (a second guard, so even a bypassed hook cannot change what a member owes). Charges always use the snapshot, never the live tier. Unique `(member, season)`.
- `fee-seasons` (admin read; nobody writes): `season`, `status` `open` | `closed`, `closedAt`, `closedBy`, `chargesTotalCents`, `snapshotCount`. At most one row per season; a missing row means open.
- `fee-charges` (admin read; nobody writes; **append-only**): written only by the Close season action. `member`, `season`, `kind` `season` | `game`, `date`, `matchId` (stored as a value, not a live relation, so a later PlayHQ re-sync or player merge cannot move or delete it), `amountCents`, `description` snapshot, `closedAt`, `voidedAt`, `voidedBy`, `voidReason`. A correction after closing is a void plus a manual adjustment charge (`kind` `adjustment`, note required), never an edit.
- `fee-payments` (nobody writes over REST; admin reads): `member` (who the money is for), **`payer`** (a member, the person who paid; defaults to `member`), `splitGroup` (id shared by the rows made in one split action), `receivedOn`, `amountCents` (> 0), `method` select `cash` | `bank-transfer` | `other` (no card options), `reference`, `note` (both card-number validated), **`appliesTo`** (optional target: `{ kind: 'season', season }` or `{ kind: 'charge', chargeId | matchId }`; empty means "general"), `recordedBy`, `voidedAt`, `voidedBy`, `voidReason`.
- `fee-waivers` (same): `member`, `scope` select `game` | `season` | `amount`, `match` (rel matches, game scope), `season`, `amountCents` (amount scope), `note` (required), `grantedBy`, `voidedAt`.
- **Households are derived, not stored.** A household is the connected set of members linked by `guardians` (a junior and their guardians, siblings via the same guardian). `householdFor(member)` is a pure function over `members`; no new collection.
- **Charges for an open season are derived on read** from `match-appearances` x `matches` x the membership snapshot. **Charges for a closed season are the stored `fee-charges` rows and are never re-derived.**

### 4.2 Derivation (pure, `lib/office/fees.ts`)

Inputs per member: charges `[{ id, kind: 'season'|'game'|'adjustment', date, season, amountCents, matchId? }]` (stored rows for closed seasons plus derived rows for the open one), waivers, payments. Derived charges: for each membership of an open season, an upfront charge dated `joinedOn` (or season start) if the snapshot `upfrontCents > 0`; for each club-side appearance in a final game of that season where `appearance.player = member.player` and the snapshot `perMatchCents > 0`, one game charge dated the match date. Fill-ins are charged only if `isRegisteredPlayer` is set or the member is linked (settings flag `chargeFillIns`, default off). Free tier produces no charges.

`allocate(charges, waivers, payments)` returns per-charge `{ payableCents, waivedCents, paidCents, owedCents, status }` and `creditCents`:
1. Sort charges oldest first by `(date, id)`.
2. Apply game and season waivers (zero the charge); apply amount waivers oldest first.
3. **Targeted payments first.** A payment with `appliesTo` settles only its target (a season: that season's charges oldest first; a charge: that charge). Any amount beyond the target's owed becomes general credit, not silently spent elsewhere.
4. **Then the general pool.** Non-voided payments with no target form one running pool for the member across seasons. Walk the remaining owed amounts oldest-first settling `min(owed, pool)`; leftover pool is `creditCents`, which rolls forward. So a member who pays the new season's membership with a target keeps it against the new season and still shows the old arrears as owing, and a member who just hands over cash has it applied to the oldest debt first, which is what the preview shows before saving.
Status words (text plus icon, never colour only): Paid, Part paid, Owing, Waived, Not charged.

**What the numbers mean.** Because untargeted payments are one pool across seasons, a season's Paid, Owing and Credit are **"as at all payments to date"**, not season totals, and every report column says so ("Paid (all payments to date, targeted payments first)"). A second column group "Paid specifically for this season" counts only targeted payments, so the treasurer can see both. Per-season pools are not the default because arrears would then have to be carried by hand; targeting is the explicit way to say "this is for 2027".

**Payer and splitting.** Recording a payment takes a payer (default the member) and an optional "Split across" list of dependants in one action: the treasurer enters one amount, picks the children (the household's members are pre-listed), and sets each share (an even split is the default; shares must sum to the amount). The action writes one `fee-payments` row per dependant sharing a `splitGroup`, in one transaction, and the preview shows each child's settlement. Voiding any row of a group offers to void the whole group. Reports show **owing per household as well as per member**, summing the household's members, and the member ledger shows "Paid by {payer}".

**Closing a season.** The **Close season** action (admin, confirm dialog, audited) computes the season's derived charges once and writes one `fee-charges` row per charge, marks the season closed in `fee-seasons`, and refuses if appearances in that season are still unmatched unless the admin ticks "Close anyway" (recorded). From then on the season's figures come from the stored rows. The open-season screen carries a persistent note: **"Figures for the open season are worked out from match data and can change if that data changes (for example after a PlayHQ sync or a player merge). Close the season to freeze them."** For a closed season the report also recomputes the derived total in memory and shows a warning when it differs from the snapshot ("Match data now gives $X; the closed figure is $Y"), changing nothing.

Tests of `allocate` are limited to four invariants plus worked examples: total paid + credit equals total payments; never over-pays a charge; deterministic and independent of input row order; adding a waiver never increases owed. Voiding and targeting are covered by worked examples, not property tests.

### 4.3 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `membership-tiers`, `memberships` REST + Local | deny | deny | deny | create/read/update/delete (tier amounts frozen once in use) |
| `fee-payments`, `fee-waivers`, `fee-charges`, `fee-seasons` read | deny | deny | deny | read |
| same, create/update/delete | deny | deny | deny | nobody (only the Fees server actions, after an admin check, validation and audit; void instead of delete) |
| Fees report, member ledger, household view, CSV | 404 | 404 | 404 | allowed; CSV logged |

### 4.4 UI (admin routes)

- `/admin/office/fees`: season picker (default current) with an Open or Closed badge. Summary cards: Payable, Paid, Waived, Outstanding, Credit held, each with a one-line "what this excludes" hint: **archived members, appearances that could not be matched to a member, appearances in games that are not in the match store, and voided rows are not counted.** Table per member, with a Households toggle that groups by household: name, tier, payable, paid (all payments to date), paid for this season, waived, owing, credit; sort by owing; "Owing only" toggle. Data-quality line: "N appearances could not be matched to a member, and M appearances are in games that are not in the match store (junior games may be missing), so the totals below may be incomplete", linking to the lists (fix by linking the player). When either count is above zero the Outstanding card shows "incomplete" beside the figure. Actions: Close season, "Set up fees". Export one CSV (summary rows with a detail section selectable by tick), admin only, logged.
- `/admin/office/fees/member/[id]`: per-game list with status chips, payments and waivers lists (void with a reason), forms: Record payment (amount, date, method, reference, note, payer, optional target, optional split across household) with a live "This will settle: Rd 3 v X, Rd 4 v Y; $10 credit left" preview computed by the same pure function, Add waiver (game / whole season / amount, note required). The preview names the target and any split.
- Tiers: native admin list/edit (admin fallback) reachable from the Fees page "Set up fees" link; a "Copy last season's tiers" action creates new unfrozen rows.
- Notification line (admin only): "N members owe $X in match fees (open season, unmatched appearances not counted)." Landing tile stat the same.

### 4.5 Tests

Unit: `allocate` invariants above plus worked examples (three games, part payment, waiver then payment, credit roll across a season boundary, **a 2027 targeted payment while 2026 is owing leaves 2026 owing and 2027 paid**, a general payment going to the oldest debt, fill-in rule, free tier, voided payment, a split payment across two children); `householdFor`; money parse/format; card validator; closing writes one charge per derived charge and a closed season ignores later appearance changes. Int: server action rejects non-admin and bad amounts; record then void re-derives; **editing a tier's amount after the first membership is refused and does not change any member's owing**; a player merge or re-sync after Close season leaves the closed figures unchanged and shows the differs-from-snapshot warning; the open season does change (and carries the note); report totals equal the sum of member rows; household total equals the sum of its members; split payment writes one row per dependant in one transaction; CSV neutralises a member named `=HYPERLINK(...)`; matrix rows. Security: no fee data in any public render; REST create of a payment denied even for admin.

### 4.6 Seed and acceptance

Two tiers (season upfront; pay-as-you-play with a per-match rate), memberships for the demo members, payments that part-settle some, one overpayment (credit), one waiver, one targeted payment for the new season while the old one is owing, one household (two children, one guardian) with a split payment, and one closed past season. Acceptance: open Fees on 42xx, see owing and credit and the "as at all payments to date" labels, record a $20 payment and watch the oldest games flip to Paid, record a split payment for a household, void it, close a season and see the note change, export the CSV and check the audit row.

### 4.7 Risks

Appearances arrive from PlayHQ after games, so an open-season charge appears when the sync lands; docs say so, and closing the season is the freeze point. Players renamed or unlinked in PlayHQ can leave appearances unlinked (the data-quality line). Junior games may not be in the store, which is why the report counts appearances in games the store lacks and marks the totals incomplete; juniors use an upfront tier. Refunds are not modelled (void and re-enter, documented). Data protection: this is financial plus personal data, hence admin-only.

## 5. WP-3: volunteer roster and hours ledger (#26)

### 5.1 Data model (migration `d3_volunteers`)

- `office-settings.shiftTypes` (array: `key` slug, `label`, `defaultHours`, `defaultSlots`, `kind` default `volunteer` | `paid`); generic defaults: Canteen, Bar, Gate. A club adds its own; keys never change once used (labels do).
- `volunteer-weeks`: `season`, `date` (game day), `label`, `status` `draft` | `open` | `confirmed`, `confirmedAt`, `confirmedBy`. "Create weeks for the season" builds one per home-game date from `selection-fixtures` (confirm the right source in Appendix B) plus manual add.
- `volunteer-shifts`: `week`, `shiftTypeKey`, `labelSnapshot`, `hours`, `slots`.
- `volunteer-assignments`: `shift`, `member`, `kind` `volunteer` | `paid`, `hours` (default from shift), `state` `rostered` | `confirmed` | `no-show` | `cancelled`. Separate rows (not an array) so assignments have stable ids, as Wave C finding 9 requires for anything written concurrently.
- `volunteer-availability`: `member`, `week`, `state` `yes` | `no` | `maybe`, `preferredShiftKeys`, `note`, unique `(member, week)`.
- `volunteer-hours` (the ledger): `member`, `date`, `hours`, `kind` `volunteer` | `paid`, `shiftTypeKey`, `week`, `assignment` (confirm is idempotent through a **partial unique index** on `(assignment) WHERE assignment IS NOT NULL AND "voidedAt" IS NULL`, so at most one live row exists per assignment but a voided row never blocks a later confirm), `source` `roster` | `manual`, `note`, `voidedAt`, `voidedBy`, `voidReason`. Hours only; no pay rates, no wages (payroll is out of scope). The index is created in raw SQL in the migration (Payload cannot express a partial index) and replayed by `check:migrations`.
- `members.volunteerLinkVersion` (WP-1) for per-person links.

### 5.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `volunteer-weeks`, `-shifts` read | deny | deny | allow | allow |
| `volunteer-assignments` read | deny | deny | allow, **without the `kind` field** (field-level read: admin) | allow |
| `volunteer-hours` read | deny | deny | **deny** (per-person ledger; paid status is employment information) | allow |
| Hours **totals** (volunteer hours, paid hours, by shift type, no names) | deny | deny | allow, via the `lib/volunteer-queries.ts` projection only, subject to the small-count rule below | allow |
| same, create/update/delete | deny | deny | nobody (roster server actions after `isStaffUser`) | nobody (same actions) |
| `volunteer-availability` read | deny | deny | allow | allow |
| `volunteer-availability` write | nobody (only the token route and staff actions) | | | |
| Token page `/volunteer/[token]` | token only | | | |
| Hours CSV | 404 | 404 | 404 | allowed, logged |

Editors may roster people and see names, dates and availability, but never a per-person paid flag or paid hours. The roster screen shows an editor "Assigned" without the paid/volunteer distinction; paid and volunteer hours are separated only in admin screens and in editor totals. Contact details stay on `members`. Whether editors get even these totals is part of the section 14 decision.

### 5.3 Availability links (reuse of the availability pattern, with a deliberate change)

`/volunteer/[token]` where `token` is an HMAC of `(memberId, volunteerLinkVersion)` with a new HKDF label `volLink` in `lib/secrets.ts`. Each volunteer has a **personal** link, unlike the club-wide player link with a name picker and PIN, because a name picker would expose the volunteer list to anyone holding a forwarded link. The page shows the volunteer's first name, the open weeks and Yes / No / Maybe buttons with a note, plus their confirmed shifts. Constant-time token compare, `ipHit` bucket `vol` (60 per 10 minutes), `Referrer-Policy: no-referrer`, `noindex`, `Cache-Control: private, no-store`. Rotating the link bumps the version and kills the old URL. Staff copy the link from the roster screen; WP-6 can mail it as a per-recipient merge tag. Mutations are server actions that re-verify the token on every call.

### 5.4 UI

`/admin/office/volunteers`: season weeks list with fill status ("2 of 6 slots empty", text plus icon). Week page: one section per shift type, slots as cards on a phone. Each open slot shows people who said Yes first, then Maybe, with their season hours so the load is visible; tap to assign. Warnings (not blocks): double booking, over capacity, assigned someone who said No. **Confirm week** posts hours: one `volunteer-hours` row per confirmed assignment (idempotent through the partial unique index on live rows); status goes `confirmed`; **Reopen** voids that week's roster-sourced rows (the voided rows stay as history). **Confirming again after a reopen inserts new live rows**, because the voided rows no longer hold the key. A no-show voids that assignment's row and reverting the no-show confirms again the same way. The roster screen shows the total hours of voided and live rows separately in the week history. Manual hours entry for ad-hoc work (working bee). Report `/admin/office/volunteers/hours`: season or date range; totals split paid vs volunteer; by shift type; per person (admin only); a name-free aggregate view for grant applications with a **small-count rule**: any cell (a shift type, a week, a month) covering fewer than 3 distinct people is shown as "fewer than 3" and merged into an "other" row so it cannot be recovered by subtraction from a total, which stops the aggregate identifying a single volunteer; the same rule applies to the editor totals. The page states what it excludes: voided rows, no-shows, unconfirmed weeks and archived members' names (their hours still count in totals). CSV for admins (aggregate and per-person), logged.

### 5.5 Tests

Unit: confirm builds exactly the expected ledger rows; idempotent twice; reopen voids; **int test: confirm, reopen, confirm again yields exactly one live row per assignment plus the voided one (never zero, never two); no-show then revert the no-show yields one live row plus one voided row; the database itself rejects a second live row for the same assignment**; paid and volunteer never mix in totals; token sign/verify/rotate; availability state machine; week generation dedupes dates. Int: editor can roster but not call the CSV; token route rejects wrong, rotated and replayed-for-other-member tokens; throttle triggers; availability row is only writable through the route; matrix rows. Public leak: the token page shows no other person's name.

### 5.6 Seed and acceptance

Six weeks, shifts from the default types, availability for a dozen volunteers, two confirmed weeks with hours (some paid). Acceptance: open a week, assign, confirm, view the hours report and aggregate, open a seeded personal link in a private window, change a response, see it on the roster.

### 5.7 Risks

Forwarded links give one person's availability to whoever holds them (accepted, rotatable). Shift types are free text keys: renaming a type's label must not rewrite history (hours keep `labelSnapshot`). Needs fixtures to generate weeks; manual add is the fallback.

## 6. WP-4: committee meetings, seats and office-bearer documents (#27)

### 6.1 Data model (migration `d4_meetings_seats`)

- `committee-seats` (may already exist from `d5_diary_plan`): `title`, `sortOrder`, `holder` rel `people`, `holderUser` rel users (optional; makes that login the seat's holder for document access), `officeBearer` checkbox, `termStart`, `termEnd` (optional), `handoverNote`. **There is no `seat-terms` collection**: past holders are read from the `office-audit-log` handover rows (seat, outgoing and incoming person, date). Deferred unless a club asks for a browsable history.
- `meeting-templates`: `name`, `kind` `ordinary` | `annual` | `special` (the label of `annual` comes from `office-settings`, default "Annual general meeting"), `items` array (`title`, `kind`, `defaultNotes`, `restricted`). A "Add the standard templates" action seeds generic annual and ordinary agendas (welcome and apologies, previous minutes, business arising, reports, financial statements, election of office bearers, general business, close). The `financial` item kind and every item of a `special` template default to `restricted`.
- `meetings`: `kind`, `title`, `startsAt`, `venue`, `status` `planned` | `in-progress` | `closed` | `cancelled`, `chairSeat`, `minuteTakerSeat`, `minutesText`, `minutesStatus` `draft` | `approved`, `approvedAtMeeting` rel, **`restricted`** checkbox (default true when `kind` is `special`; can be set on any meeting). No quorum figure or arithmetic: the attendance count is shown, and whether a quorum was met is a sentence the minute-taker writes.
- `meeting-items`: `meeting`, `order`, `title`, `kind`, `notes`, `outcome`, **`restricted`** (copied from the template; default true for `financial` items and for items of a restricted meeting).
- `meeting-attendance`: `meeting`, `person` rel people or `guestName`, `state` `present` | `apology` | `absent`.
- `meeting-motions`: `meeting`, `item`, `text`, `votesFor`, `votesAgainst`, `abstain`, `result` `carried` | `lost` | `tabled` | `withdrawn`. Counts only; no mover and seconder tracking (write them into the text if wanted), and per-person votes are deferred.
- `meeting-actions`: `meeting`, `item`, `text`, `ownerSeat` or `ownerPerson`, `due`, `status` `open` | `done` | `blocked` | `dropped`, `doneOn`, `carriedFrom`.
- Child rows (items, motions, actions) carry a server-maintained `restricted` copy of their effective restriction (item or meeting), set by a hook, so access functions need no join.
- `office-files` (upload collection, see 6.5) and `committee-documents`: `title`, `category`, `file` rel `office-files`, `meeting` (optional), `uploadedBy`.

### 6.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| seats, templates, unrestricted meetings and unrestricted children (items, motions, actions, attendance, `minutesText`) | deny | deny | read; write only via meeting/seat server actions or native edit for templates | all |
| **restricted** meetings, items and their children, including `minutesText` of a restricted meeting | deny | deny | **only if office-bearer** (read and write); otherwise the row is invisible and counted only as "N restricted items" | allow |
| `committee-documents`, `office-files` read and download | deny | deny | only if office-bearer | allow |
| same, create/update/delete | deny | deny | only if office-bearer (creates), nobody for delete | allow |
| Minutes print view | 404 | 404 | allowed, restricted items omitted unless office-bearer | allowed |

Minutes routinely contain finance, disciplinary or personnel matters, so the restriction exists from the first migration (adding it later would mean migrating already-stored sensitive minutes). Notes, outcomes, motions and actions of a restricted item are not readable by ordinary editors, and the print view and `buildMinutes` skip them for them. A restricted item that creates an action shows that action only to office-bearers.

**`isOfficeBearer(user)`** (async access function, fails closed on any error): true when `user` is an active admin, **or** an active staff user and a seat exists with `holderUser = user.id`, `officeBearer = true`, and `termEnd` is null or later than now. "No ended term" therefore means exactly: `termEnd IS NULL OR termEnd > now()`. Selectors never qualify. The result is **cached per request** (memoised on the `req` object, keyed by user id), because access functions run on every document read and list; it is never cached across requests, so a handover takes effect on the next request.

### 6.3 Meeting flow (`/admin/office/meetings`)

List with upcoming and past. **New meeting**: pick a template and date; the action copies items, adds attendance rows for current seat holders, copies the restricted flags from the template, and puts every open action from earlier meetings (restricted ones only if the creator is an office-bearer) into a "Business arising" item. **Run view** `/admin/office/meetings/[id]`, mobile first: agenda as a list with the current item expanded; attendance chips (Present / Apology / Absent) with a plain present count; quick add motion (text, for/against/abstain, result); quick add action (text, owner seat, due); notes per item. **Close meeting** builds a draft minutes text from structured data with the pure `buildMinutes(meeting)` (editable `minutesText`), then status closed. At the next meeting the "Approve previous minutes" item sets `minutesStatus = approved`. Print view `/admin/office/meetings/[id]/minutes` with print CSS (browser print to PDF). Open actions list `/admin/office/meetings/actions` filterable by seat, overdue first; overdue and blocked counts feed the dashboard (section 7.5).

### 6.4 Seat handover at the annual meeting

On an annual-kind meeting, a **Hand over seats** step lists every seat with its current holder and a person picker for the new holder (or "vacant"), plus an optional "login for this seat" picker (a staff user). Confirming, per **changed** seat and in one transaction: sets `termEnd` to the meeting date on the outgoing term and writes the audit row (seat, outgoing and incoming person, date), sets `holder` to the new person, sets `termStart`, **clears `holderUser` unconditionally**, and then sets `holderUser` to the new login only if the picker linked one. An unchanged seat is untouched. So an ex-holder loses office-bearer access on the next request, and the incoming holder gets none until someone links their login; this fails closed. Because jobs, actions and diary items are owned by the **seat**, they follow the seat automatically. The step ends with a checklist: "Update Committee & contacts page" linking to the affected `people` records (the public committee page is still edited by hand; deriving it from seats is deferred, section 14), and a read-only summary "Who can now open office-bearer documents: {names}" computed from `isOfficeBearer` rather than a manual tick. No automatic edit to public `people` data.

### 6.5 Office-bearer documents and storage

`office-files` is a separate upload collection (PDF, Word, Excel, images) with `disablePayloadAccessControl: false` in the blob plugin config so **downloads** are served through Payload's access-controlled route. The existing `clientUploads: true` would make the browser upload straight to Blob and receive the blob URL, so it must not apply to this collection. If the plugin allows `clientUploads` per collection, it is turned off for `office-files`; if it is a global setting, `office-files` is registered through a second `vercelBlobStorage` instance with `clientUploads: false` (Appendix B item 8 settles which). Server-side uploads pass through the function body, so the cap is **4 MB**, not 15 MB; larger files are refused with a plain message ("Files over 4 MB are not supported here; share a link instead"), and the docs say so. Locally files use local storage. **Honest limits:** the blob object behind a document is an unguessable but public URL on the current store (section 14), and the blob URL is held server-side and in the database, so anyone with database or blob-list access can read it; the blob URL is not given to the browser on download, but it is exposed to the uploader on a client upload, which is why client uploads are off here. Download route sets `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `noindex`. Download route sets `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `noindex`.

### 6.6 Tests

Unit: `buildMinutes` golden outputs (attendance, motions, actions, apologies, restricted items omitted for a non-office-bearer), template copy and restricted defaults (special meetings, financial items), handover planner (term closing, vacant seat, unchanged seat untouched, `holderUser` cleared on every changed seat and set only when a login is picked, jobs still referencing the seat), `isOfficeBearer` decision table including `termEnd` null, future and past, and per-request memoisation (one lookup for many calls in a request, none carried to the next). Int: handover end-to-end; **an ex-holder loses `committee-documents` read and download immediately after handover, in the same test run, with no re-login**; an editor who is not an office-bearer cannot read a restricted meeting, item, motion, action or `minutesText` (REST, Local API and the print view); editor without a seat cannot read or upload a committee document (REST and download route); office-bearer editor can read and upload but not delete; selector and anonymous denied; direct `office-files` URL shape does not expose the blob URL (response headers); matrix rows.

### 6.7 Seed and acceptance

Seats for the usual offices (generic titles) with holders from demo people, two completed meetings (one with a restricted finance item), one planned annual meeting, a few actions (one overdue), two office-bearer documents. Acceptance: create an ordinary meeting from the template, mark attendance, add a motion, close and print the minutes; sign in as a non-office-bearer editor and confirm the restricted item is hidden; run the annual handover, see a seat's owned jobs follow it, and see the outgoing holder lose document access.

### 6.8 Risks

Minutes are legal-ish records (retention, approval wording): the app records, the club decides. Per-person votes are deferred (#27 follow-up). Restricted items cover the in-camera case; a sensitive item has a safe place from day one. The public Committee page and the seats can disagree until a human edits both; flagged in docs.

## 7. WP-5: season diary and strategic plan (#28)

### 7.1 Data model (migration `d5_diary_plan`)

- `diary-jobs`: `title`, `season`, `category` select (`registration`, `governance`, `insurance`, `permits`, `finance`, `ground`, `events`, `other`; neutral keys, labels editable in `office-settings`), `due`, `ownerSeat` rel `committee-seats` (optional `ownerPerson` rel people), `budgetCents`, `actualCents`, `status` `todo` | `in-progress` | `blocked` | `done`, `blockedReason` (required when blocked), `doneOn`, `objective` rel `plan-objectives` (this is how an objective has "linked actions": a plan action is a diary job with an objective), `repeatsYearly`, `sourceKey` (stable starter key), `notes`.
- `plan-pillars`: `title`, `summary`, `sortOrder`. `plan-objectives`: `pillar`, `title`, `ownerSeat`, `targetDate`, `budgetCents`, `status`, `progressNote`, `sortOrder`, `sourceKey`.
- Derived on read, never stored: overdue (`due < today` and not done), due soon (within `office-settings.diaryLeadDays`, default 14), blocked, objective progress (done jobs of linked jobs), spend versus budget with a warning when linked job budgets exceed the objective budget, unowned (seat with no holder).

### 7.2 Starter content (one click, generic)

`lib/office/starter-diary.ts` and `starter-plan.ts` hold generic content: a dozen annual jobs (registration and membership fees paid to the governing body, annual general meeting, insurance renewal, permit and licence renewals, tax and reporting returns, ground and pitch preparation, equipment check, food and venue permit check, working bee, awards event, registration opening, season review) each with a month offset relative to `SEASON_START_MONTH`, a category and an unassigned seat; and five generic pillars (Participation and growth, Facilities and ground, Finance and sustainability, Community and culture, Governance and people) with two or three example objectives each, marked "example, edit me". Both actions are idempotent by `sourceKey` (+ season for jobs), only add what is missing, and never overwrite edits. A guard test fails if any starter string contains a club name or place name from the theme/club seed defaults or config, or a regionally specific term from a denylist (for example affiliation, canteen licence, suburb, state, postcode, Spam Act, AGM and similar locale words); the starter files use neutral wording, and anything a region needs is added by the club in settings. The denylist lives in the guard test and is extended as other regions adopt the template.

### 7.3 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `diary-jobs`, `plan-pillars`, `plan-objectives` read | deny | deny | allow | allow |
| create / update | deny | deny | allow (native forms, plain labels) | allow |
| delete | deny | deny | deny | allow |
| Starter actions, "next year" copy | 404 | 404 | allow | allow |

Budgets are club figures, not personal data, so editors may edit them.

### 7.4 UI

`/admin/office/diary`: (Add job is the mobile quick-add form from section 3.3; the native job form is the admin fallback.) Month-by-month list for the chosen season, chips Overdue, Blocked, Due soon, Mine (jobs on the signed-in user's seat), quick status buttons, owner and budget shown, "Add the standard jobs for {season}" when empty, "Copy repeating jobs to next season". `/admin/office/plan`: pillars as sections with objectives, progress as text ("3 of 5 jobs done, $1,200 of $3,000") plus a bar, linked jobs listed under each objective, "Add a job to this objective", one-click "Add a starter plan" when the plan is empty, printable view.

### 7.5 Dashboard callouts

`payload/admin/copy.ts` and the notification centre gain editor-visible lines: "N club jobs are overdue" (link to the diary filtered), "N jobs are blocked", "N jobs have no owner", and from WP-4 "N committee actions are overdue". Problems first, hidden when zero. Budget over-spend is a diary-page badge only.

### 7.6 Tests

Unit: overdue/due-soon/blocked derivation across timezones (club time zone from config, not the server's), month offset from `SEASON_START_MONTH` for both hemispheres and `SEASON_NAME_FORMAT`, starter idempotency, objective progress and budget roll-up, `blockedReason` validation. Int: starter run twice yields no duplicates; editing a starter job then re-running does not overwrite it; matrix rows. Guard: no club names, hex or regional terms in the starter files. Seat-handover test (needs WP-4): jobs stay with the seat.

### 7.7 Seed and acceptance

Standard jobs for the current season with a spread of states (two overdue, one blocked, a few done), the starter plan applied with progress on two objectives. Acceptance: Home shows the overdue and blocked lines; the diary filter shows them; marking one done clears the line.

## 8. Dashboard callouts and landing stats (shared)

One function per module in `lib/office/modules.ts` returns that module's stat line and callouts, each a pure projection over its own queries and role-checked (admin-only lines such as fees owing never reach an editor's page). `payload/admin/copy.ts` holds the wording; the notification centre renders them under the existing "Needs your attention" list, problems first, nothing shown at zero. **Honest numbers.** Every stat line and callout states what it excludes, in the wording itself or a tooltip, and a unit test pins the wording: "41 members have no email" is "41 active members have no email (archived members and people on the do-not-email list are not counted)"; "N members owe $X" says "open season only; appearances that could not be matched or that are in games not in the store are not counted"; a hours figure says voided rows and no-shows are not counted. Any aggregate that could identify one person follows the small-count rule (section 5.4). Lines: overdue, blocked and unowned club jobs (WP-5); overdue committee actions (WP-4); empty shifts for the next game day within three days (WP-3); members owing match fees (WP-2, admin); low stock and kit overdue back (WP-7); the Club office landing shows the same figures as stat lines. A unit test feeds each function fixtures for zero, one and many.

## 9. WP-6: bulk email, unsubscribes and Payload email (#29)

### 9.1 Env-gated provider seam

`lib/email/types.ts`:

```ts
type EmailMessage = { to: string; from: { name: string; address: string }; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey?: string }
type SendResult = { ok: true; providerId: string } | { ok: false; kind: 'rate' | 'transient' | 'permanent' | 'auth'; message: string }
interface EmailAdapter { id: string; live: boolean; send(m: EmailMessage): Promise<SendResult> }
```

Adapters in `lib/email/adapters/`: `mock` (tests and local dev; records messages, scriptable failures, console dump), `resend` (plain `fetch` to the Resend HTTP API with the `Idempotency-Key` header, no new dependency), and `EMAIL_PROVIDER=mock`, allowed outside production only (refused by `assertSafeEnv` when running on Vercel), which records messages in memory and dumps each rendered message to the server console; there is no dev outbox view and no separate `log` adapter. Selection: `EMAIL_PROVIDER` (`resend` or `mock`; empty means off), `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` (an address on a verified domain), optional `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_BATCH_SIZE` (default 50), `EMAIL_RATE_PER_SECOND` (default 2), `EMAIL_MAX_RECIPIENTS` (default 2000). `emailEnabled()` is true only when the provider, key and from address are all present. **When false the Email module is hidden everywhere** (no tile, view 404, routes 404, no cron work, forgot-password stays disabled) and nothing tries a network call.

Sender identity comes from config, never code: from name = `EMAIL_FROM_NAME` or the `club` global's name; reply-to = `EMAIL_REPLY_TO` or the club contact email; footer text and the compliance line from `office-settings` (default template "You are receiving this because you are connected with {clubName}. {contact}").

### 9.2 Data model (migration `d6_email`)

- `email-campaigns` (admin): `subject`, `body` (plain text with blank-line paragraphs and the merge tags below), `audience` (JSON snapshot of the filter spec: keys and enumerated values only, validated, never an address or a name), `status` `draft` | `sending` | `sent` | `cancelled`, `counts` group (`queued`, `sent`, `failed`, `skipped`), `createdBy`, `sentAt`, `recipientsPurgedAt`.
- `email-recipients` (nobody writes over REST): `campaign`, `member`, `email` (snapshot, lowercased), `emailHash`, `firstName` snapshot, `status` `queued` | `sending` | `sent` | `failed` | `skipped-suppressed` | `skipped-no-email`, `attempts`, `claimToken`, `claimedAt`, `providerId`, `error`, `nextAttemptAt`. Unique `(campaign, email)` so the same address gets one copy. **These rows hold personal data and are not kept forever:** a daily task (the same CRON_SECRET route family) blanks `email`, `firstName`, `providerId` and `error` text (keeping `emailHash`, status and counts) on every recipient of a campaign `office-settings.recipientRetentionDays` (default 30) days after it finishes, keeping only the status and the campaign `counts`, and stamps `recipientsPurgedAt`. Erasure scrubs a member's snapshots immediately (section 1). Neither touches `email-suppressions`.
- `email-suppressions` (admin read; nobody write over REST): `emailHash` (HMAC of the lowercased address with an HKDF label, unique, indexed; the key that every send-time check uses), `email` (lowercased, kept when known for the admin list, null when the suppression came from a purged recipient), `reason` `unsubscribed` | `manual` | `bounced` | `complaint`, `source`, `at`, `campaign`. Keyed by address hash, not member, so it survives member deletion and erasure.
- Secrets: new HKDF label `emailUnsub` in `lib/secrets.ts`.

### 9.3 Compose, audience, test, send

- **Compose once** in `/admin/office/email` (admin only, visible only when enabled): subject, body, live preview rendered with a sample first name. Merge tags `{firstName}`, `{firstName|there}` (fallback), `{clubName}`, `{volunteerLink}`; anything else fails validation with the tag named. The HTML is built from the theme tokens at send time (`getTheme()`), never hex in code, plus an automatic footer with sender identity and the unsubscribe link; plain-text part always included.
- **Audience** from the WP-1 filter spec (same builder, same chips) plus segments registered by other modules: "owes match fees" (WP-2), "volunteers" (WP-3). A preview before sending: "412 match; 380 will receive; 20 have no email; 12 unsubscribed; 4 juniors will go to a guardian". A junior without their own email uses guardians' emails; addresses deduplicate; `doNotEmail` and suppressions are removed. Hard cap `EMAIL_MAX_RECIPIENTS`.
- **Confirm before sending.** There is no test-send gate and no test rate limit (for clubs of this size they cost more than they prevent). The admin sees the full preview with a sample name and a single confirm step showing the counts (match, will receive, no email, unsubscribed, juniors via guardian) and the exact subject. An optional "Send me a copy first" button sends one message to the signed-in admin's own login email, prefixed "[TEST]", with no suppression side effects; it is a convenience, not a requirement.
- **Batching and rate limit.** Send snapshots recipients into `email-recipients`, then batches run through a claim/lease (`UPDATE ... WHERE status='queued' AND (nextAttemptAt IS NULL OR nextAttemptAt <= now()) ... FOR UPDATE SKIP LOCKED`, reused from `lib/social/queue-core.ts` only if Appendix B item 4 shows it is generic; otherwise this WP uses a plain sequential send loop with a per-recipient status update, which is enough at this scale) of `EMAIL_BATCH_SIZE`, spaced to `EMAIL_RATE_PER_SECOND`. The page loops `POST /api/admin/office/email/[id]/batch` with a progress bar and can be closed and resumed ("Continue sending"); the same work is done by the CRON_SECRET route `/api/cron/email-batch` (constant-time bearer compare, the Wave C pattern) so a closed tab still finishes. Transient and rate failures retry with backoff (3 attempts); permanent failures are final and visible. Idempotency key = recipient id. **Suppression is checked at three points:** audience build, claim time (re-read immediately before sending, so an unsubscribe mid-send is honoured) and inside `sendCampaignMessage`, the only function that may send non-transactional mail.

### 9.4 Unsubscribe and compliance wording

Every campaign message carries sender identification (name, contact), a visible unsubscribe link, and headers `List-Unsubscribe: <https://{host}/unsubscribe/{token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. `token = base64url(recipientId) + '.' + HMAC(emailUnsub, recipientId)`, no expiry (the link must keep working long after the send, including after the recipient snapshot is purged, because suppression is keyed by `emailHash`, an HMAC of the lowercased address that the purge keeps on the recipient row). Routes:

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /unsubscribe/[token]` | token | Shows a confirm page ("Stop emails to j***@example.com?") with a button. GET never changes data, so mail scanners that prefetch links cannot unsubscribe anyone. Generic "link not recognised" page for bad tokens. |
| `POST /unsubscribe/[token]` (form) and `POST /api/public/unsubscribe/[token]` (RFC 8058 one-click) | token | Writes the suppression row immediately, idempotent; shows a done page with an "Undo, I changed my mind" button. **A valid token is never rate-limited or locked out**: providers and corporate scanners POST from shared IPs, and the unsubscribe must work, so the HMAC (not a throttle) is the abuse control. |
| `POST` undo | token | Removes only that `unsubscribed` entry, never a `bounced`/`complaint`/`manual` one. Undo has a more lenient limit than opt-out would have (and opt-out has none). |

Constant-time compare, `noindex`, no cache, the address masked on screen. **Only invalid-token attempts are throttled**: an `ipHit` bucket (`unsub-bad`, generous, for example 30 per 10 minutes) counts failed verifications, never successes, and an exhausted bucket returns the same generic "link not recognised" page. Admins can also add or remove a suppression manually (audited). The legal and compliance wording (the footer line, the unsubscribe page copy and the statement of which rules apply) comes from `office-settings` (`unsubscribeText`, `complianceText`) with neutral defaults ("You can stop these emails at any time"). Names of national laws appear only in the docs and in the settings a club fills in, never in code strings or UI copy, because this template is reused in other countries (the Australian Spam Act is the case for this club's deployment). The docs state plainly: the app provides the mechanism; the club is responsible for having consent and for the content of its messages, and should check the rules that apply where it operates. Transactional mail (password reset, invites) is not subject to the suppression list and never carries a marketing footer.

### 9.5 Payload email wiring

`payload.config.ts` sets `email` from `emailAdapterForPayload()`, a function returning a Payload adapter built over the same `EmailAdapter` when `emailEnabled()`, otherwise `undefined` (today's behaviour). The `forgotPassword` block in `Users.beforeOperationGuard` becomes conditional: allowed only when `emailEnabled()`; otherwise the existing 403 with the existing wording. New throttle bucket `rest-forgot` (the `rest-login` model, per IP and per target address hash) on `forgotPassword`.

**No enumeration by response or by timing.** The response for a known and an unknown address is the same body, status and (as near as practical) the same latency: the request handler returns immediately and the send, which may await a provider call, happens in Next's `after()` (or the queue), never in the request path. A test compares both paths' response and asserts the adapter call is not awaited before the response.

**Reset link host.** The link is built from the configured `serverURL` only; the request `Host` and `X-Forwarded-Host` headers are never used, so a forged header cannot redirect a reset link. A test sends a forged `Host` and asserts the link host is unchanged. The message is built from the club name and theme; the sender is the same identity.

**Blocking acceptance test: selector accounts.** Selectors are users with the `selector` role and a password like any user (confirm exactly how Facebook sign-in creates them, Appendix B item 7). The test: a selector requests a reset, completes it, signs in, **still has the `selector` role and cannot open `/admin`** (staff guard), and the reset cannot be used to change the role or any field other than the password. WP-6 does not merge until this passes. Other notification emails (for example approvals) are deferred behind a `sendTransactional()` seam that exists but has no callers.

### 9.6 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `email-campaigns` | deny | deny | deny | create/read/update (not after sending), no delete once sent |
| `email-recipients` | deny | deny | deny | read; nobody writes |
| `email-suppressions` | deny | deny | deny | read; nobody writes (actions only) |
| Compose, batch, cron | 404 | 404 | 404 | allowed when `emailEnabled()` |
| Unsubscribe pages | token | token | token | token |

### 9.7 Tests

Unit: merge-tag parser (unknown tag, fallback, escaping so a first name like `<b>` cannot inject HTML), unsubscribe token sign/verify/tamper/wrong-label, header builder, audience resolver (dedupe, guardian fallback, doNotEmail, suppressed, cap), backoff, hash gating of Send. Mock-adapter int: full campaign through batches; an unsubscribe landing mid-send is skipped; a transient failure retries then succeeds; a permanent failure is final; two concurrent batch calls never double-send (claim); test send goes only to the admin's own address; editor and selector denied everywhere; env unset hides the module and every route 404s with no adapter call (assert zero calls); GET unsubscribe never writes; POST writes once and is never rate-limited for a valid token (100 valid POSTs from one IP all succeed); invalid tokens are throttled; undo does not clear a bounce and is more lenient than opt-out would be; the purge blanks recipient email and first name after the retention period and keeps counts; **after erasing a member, no email address for them appears in any table except `email-suppressions`** (scan every office table); erasure and archive and `doNotEmail` bump `volunteerLinkVersion` and the old link then fails; forgot-password sends through the mock only when enabled, is throttled, responds identically (and returns before the send) for an unknown address, builds the link from `serverURL` under a forged `Host`, and the selector acceptance test above passes. Dropped from the plan as over-engineering for this scale: property tests, a send-gated test hash and its rate limit. Guard: no code path other than `sendCampaignMessage` and the transactional wrapper calls `adapter.send`.

### 9.8 Seed and acceptance

`seed:demo` seeds one draft campaign and a few suppressions only; it never sends. Acceptance with `EMAIL_PROVIDER=mock` (in-memory with a console dump, no network): compose, confirm, send to the seeded audience, read the console dump, click an unsubscribe link, resend and see the skip. With `EMAIL_PROVIDER` unset: the tile is absent and `/admin/office/email` is 404.

### 9.9 Risks

Provider choice, DNS (SPF, DKIM, DMARC) and consent are outside the code (section 14). Bounce and complaint feedback needs a provider webhook with a signing secret; until then bounces are only the immediate permanent failures the API returns, and the docs say so. Vercel function duration bounds each batch; the resumable loop and cron are the answer, not a long single request.

## 10. WP-7: stock and merch tracking (#30)

### 10.1 Data model (migration `d7_stock`)

- `stock-items` (staff): `name`, `group` (for example a shirt type), `size`, `category` `kit` | `equipment` | `consumables` | `other`, `unit`, `reorderLevel`, `location`, `returnable` checkbox (default true for kit and equipment), `active`, `notes`. One row per size so the ledger stays simple.
- `stock-movements` (the ledger; nobody writes over REST): `item`, `kind` `received` | `issued` | `returned` | `lost` | `written-off` | `adjustment`, `qty` (integer, signed only for `adjustment`), `date`, `member` (issued/returned), `issue` (links a return to its issue), `note`, `recordedBy`, `voidedAt`, `voidedBy`, `voidReason`.
- `stock-issues`: `item`, `member`, `qty`, `issuedOn`, `dueBackOn`, `returnable` snapshot. Status is derived: Out, Part returned, Returned, Given (not returnable).
- On hand = received + returned + positive adjustments - issued - lost - written-off - negative adjustments, computed in SQL per item on read. Issuing locks the item row in a transaction (`SELECT ... FOR UPDATE`) and refuses to go below zero unless the user ticks "issue anyway", so two committee members cannot hand out the last shirt twice.

"What is still owed" is interpreted as **what people still owe the club back** (issued returnable items not yet returned). Items owed *to* a member (ordered, not yet delivered) are not modelled; this reading is confirmed in section 14.

### 10.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `stock-items` read / create / update | deny | deny | allow | allow |
| `stock-items` delete | deny | deny | deny | allow (only with no movements) |
| `stock-movements`, `stock-issues` read | deny | deny | allow | allow |
| `stock-movements`, `stock-issues` write | deny | deny | nobody (server actions after `isStaffUser`) | nobody (same) |
| Stock and owed CSV (contains names) | 404 | 404 | 404 | allowed, logged |

### 10.3 UI

`/admin/office/stock`: item list grouped by category with on-hand and a Low chip when at or below reorder level (text plus icon), search, "Add stock received". Item page: movements with void. **Issue to a person** (item, quantity, person from the `stock` name projection, due back, note), **Return** and **Lost** from the person page `/admin/office/stock/people/[memberId]` (what this person holds, one tap to return, partial returns). **Owed** tab: all open returnable issues, oldest first, overdue flagged, one-line summary per person. **Stocktake**: type counted quantities, the screen shows the differences and posts adjustment movements. Notification lines for editors: "N items are low" and "N kit items are overdue back".

### 10.4 Tests

Unit: on-hand maths, issue status derivation, partial returns, void restores on-hand, stocktake delta, negative-stock refusal. Int: concurrent issue of the last unit (one wins); editor can issue but not export; matrix rows; member erasure leaves issue rows labelled "Former member".

### 10.5 Seed and acceptance

Kit (shirts in sizes, caps), equipment (helmets, bats, a ball machine), consumables; several issues (some returned, two overdue), one low item. Acceptance: issue the last cap, see Low, return a helmet, see Owed shrink, run a stocktake, export the owed list as admin.

### 10.6 Risks

Only integer counts (no cost or sale tracking; merch sales and payments are deferred, there is no payment provider). Size variants as rows means long lists for big kit ranges; the group header keeps it readable.

## 11. Admin classification summary

| New thing | Where it lives | Role |
| --- | --- | --- |
| Club office landing | `everydayNav` (cap 16 to 17) | staff |
| Club office settings global | `advancedNav`, `hiddenFromEditors` | admin |
| Members, tiers, memberships, payments, waivers, email, suppressions, audit log | `officeCollections` (admin) | admin |
| Volunteers, meetings, seats, diary, plan, stock | `officeCollections` (staff) | staff (documents: office-bearer) |
| Office-bearer files and restricted meeting items | `officeCollections` | office-bearer |
| Quick-add forms (member, job, stock item) | inside module pages, no menu entry | per module |

`tests/admin-visibility.test.ts` gains: every office collection is classified, none is in a menu, `navFor('editor')` includes `office`, `navFor(null)` does not, the `everydayNav` cap is 17 and `jobTiles` stays 14, and every module in `lib/office/modules.ts` maps to a route and a feature doc. `payload/admin/helpContent.ts` gets one "Club office" section in plain English.

## 12. Cross-cutting tests and guards

- `tests/office-guards.test.ts` (unit, scans source): no `app/(frontend)` file or `lib/*-queries.ts` used by public pages imports an office collection or `lib/members-queries.ts`, except the allowlisted `volunteer/[token]` and `unsubscribe/[token]` routes; no `Boolean(user)` or `!req.user` as an access check in the new paths; every export route goes through `auditedExport` and `isAdminUser`; no `lib/office/csv.ts` exists (exports use `lib/stats/csv.ts`); no `adapter.send` outside the two allowed functions; nothing in the new code strings or UI copy names a national law.
- Extend `tests/no-brand-hex.test.ts` (hex and club names), `tests/staff-guard.test.ts` and the existing selection/selector guards to `lib/office/**`, `lib/email/**`, `lib/members-queries.ts`, `lib/*-office-queries.ts`, `payload/components/Office*`, `payload/endpoints/office*`, `app/api/admin/office/**`, `app/api/cron/email-batch/**`, `app/(frontend)/volunteer/**`, `app/(frontend)/unsubscribe/**`; the path lists are edited in the same task that adds the folders.
- **Club-neutral denylist.** The no-brand guard also scans the starter files, default settings values, migration default text and `lib/office/**` strings for regional terms (for example affiliation, canteen licence, suburb, state, postcode, Spam Act, AGM). Address labels, category labels, the annual-meeting name and compliance wording are configuration, with neutral defaults (locality, region, postal code, registration, permits). `CLUB_TIMEZONE` defaulting to the club's zone in `config/site.ts` is acceptable because it is config, and overdue logic reads it from there (section 7.6).
- `tests/int/office-matrix.int.test.ts` (section 3.4) is the single source of truth for who can do what; each WP appends its collections.
- Accessibility: status never by colour alone, 44 px targets, visible focus, forms with labels and error text, tables degrade to cards under 640 px, live regions for save results; a checklist in each WP's task, with an axe-style assertion where the repo already has one (Appendix B).
- The sensitive-field-name scan and the public-leak render test (section 3.4) re-run as part of Verify.

## 13. Files, order and verification

Work packages split into tasks of roughly: (1) pure logic and tests, (2) collections, access, migration, generate, (3) queries and server actions, (4) views, (5) seed, doc, nav and guard updates, (6) targeted review. Commit per task with explicit paths. Final Verify step (once): `pnpm tsc --noEmit`, `pnpm lint`, full `pnpm test`, `pnpm test:int`, `pnpm check:generated`, `pnpm check:migrations`, one `pnpm build`, then a pass over each module's acceptance list on port 42xx with `PLAYHQ_CLIENT_ID=` empty and email unset, then again with `EMAIL_PROVIDER=mock`.

## 14. Decisions and credentials needed from outside the code

Build to the seam; do not fake integrations. None of these blocks WP-0 to WP-5 or WP-7.

1. **Email provider and sending domain.** Resend, an account and API key in the Vercel env (Sensitive), a verified sender domain with SPF, DKIM and DMARC DNS records, and the from address. Until set, the module is hidden and password reset stays off.
2. **Consent and content.** The club decides its lawful basis for emailing members and what it sends; the app provides identification, a working unsubscribe and suppression only. Someone should read the email rules that apply where the club operates, and fill in the compliance wording in office settings.
3. **Bounce and complaint webhooks.** Needs the provider's webhook signing secret; deferred.
4. **Who may see what (decision, not a default).** Proposed: editors see scoped name projections only (volunteers and committee on the roster, relevant members on stock, juniors as first name and initial), never per-person paid status, never contact data; fees, members and email are admin-only. The alternative is no editor name access at all, with the roster built by an admin. If the treasurer or secretary must work without being a site admin, the clean answer is a new `treasurer`/`office` role, not widening `editor`; decide before WP-2 goes live.
5. **Private file storage.** Office-bearer documents are access-controlled by the app on download, but the blob object is an unguessable public URL, held server-side. Uploads for this collection must be server-side (no client upload, so a 4 MB cap) so the URL is not handed to the uploader's browser either. A private blob store or a different bucket is a platform decision and would remove both limits.
6. **Currency, locale and fee rules.** Set in office settings; whether fill-ins pay and whether juniors pay per match are club rules the defaults only guess. Whether the club closes each season in the app (recommended) or keeps the open-season figures live is a treasurer decision.
7. **Payments.** Recording only. A payment provider, receipts and refunds are separate decisions and need their own security review (card data out of scope here).
8. **Stock "owed".** Confirmed reading: items people owe back. Items owed to members (pre-orders) would be a new model.
9. **Public committee page from seats.** Today a human edits both; deriving the public page from seats is a later change.
10. **Data import.** Real member lists arrive by CSV or manual entry; an importer needs its own duplicate rules and issue.
11. **Retention periods.** Default 30 days for email recipient snapshots (`recipientRetentionDays`); the club may want longer or shorter.
12. **Auditing record reads.** Single-member reads are not logged; a club that wants that needs a read hook and a decision on log volume.

## Deferred or cut for scale (review round)

Cut from this wave: a `log` email adapter and dev outbox view (mock plus a console dump instead); the `seat-terms` collection (history from the audit log); mover and seconder on motions; quorum arithmetic; SMTP mention; a second fee CSV (one export, detail by tick); `testSentHash` and the test-to-self rate limit; property tests beyond four `allocate` invariants. Kept: the `EmailAdapter` seam, suppression at three points, claim/lease batching only if Appendix B item 4 shows `queue-core.ts` is reusable, and the token routes.

## Appendix A. Decisions worth challenging

1. New `members` collection beside `players` and `people` (link, not merge): avoids putting private fields on public collections.
2. Derived fee status for the open season, stored charge snapshots once closed: the open season never drifts from the data, the closed one never silently rewrites history, and the cost is one recompute per member (hundreds of rows, fine).
3. Personal volunteer links instead of the club-wide link plus PIN: stronger privacy, more links to distribute.
4. Plan actions are diary jobs with an objective: one overdue/blocked mechanism, one fewer collection.
5. Ledger writes only through server actions: slower to build than native forms, but invariants (no card data, append-only, audit) hold.
6. Send needs a single confirm showing the counts and the subject; a test-to-self copy is optional. (A test-hash gate was cut as over-engineering.)
7. Counts-only votes: enough for minutes, avoids storing how individuals voted.
8. Restricted flag on meetings and items from the first migration: cheap now, expensive to retrofit onto stored minutes.

## Appendix B. Verify list (settle during implementation, in order)

1. **Blocking spike before WP-1.** Whether `admin.hidden` blocks the native list/edit route in this Payload version; pick un-hidden-but-unlisted, or custom views, accordingly. Write the answer into section 3.3.
2. ~~`lib/stats/csv.ts` formula safety~~ **Settled:** it is formula-safe (guard on `= + - @ | tab CR`, full-width lookalikes, leading whitespace, `'` round-trip). Reuse `toCsv`; do not build `lib/office/csv.ts`.
3. Which source gives upcoming home-game dates for volunteer weeks (`selection-fixtures` fields).
4. Whether `lib/social/queue-core.ts` claim/lease is generic enough to reuse for email; if not, use the simple sequential loop.
5. Whether anything besides `sponsor-thanks` relied on the `logos` initial fallback.
6. The exact density helper and target used for `cutRows`, and how the toss absence is best exposed to the chooser.
7. How `rest-login` throttle is wired in `Users` hooks, to add `rest-forgot`, and how selector (Facebook) accounts are created and what password they hold. The outcome feeds the blocking selector acceptance test in section 9.5; it is not a research item to defer.
8. Blob plugin options: is `clientUploads` settable per collection, does a second `vercelBlobStorage` instance work for `office-files`, and local-storage behaviour in dev with `disablePayloadAccessControl: false`. Decides section 6.5's mechanism; the 4 MB cap holds either way.
9. Existing accessibility test tooling.
10. Where `isSocialEligible`/`isJunior` read junior signals, to reuse for member juniors and the "first name and initial" rule.
11. Whether a partial unique index survives `payload migrate:create` (it must be written as raw SQL in the migration and kept out of the collection config) and passes `check:migrations`.

## Appendix C. Risks (summary)

Personal data exposure (mitigated by admin-only collections, explicit field access, public-leak and matrix tests, logged exports); ledger correctness (pure functions with property tests, append-only rows); email abuse or accidents (env gate, test-first, suppression at three points, caps, rate limit); migration size (seven small ones, each replayed by `check:migrations`); menu growth (one entry); scope (this is seven modules: each ships alone and the build order lets the wave stop after any WP).

## Appendix D. Review round: how findings were handled

Accepted and applied: partial unique index on live `volunteer-hours` (5.1, 5.4, 5.5); closed-season charge snapshots, frozen tier rates and the open-season note (4.1, 4.2, 4.4); targeted payments and report labels (4.2); payer, splits and households (4.1, 4.2); handover clears `holderUser`, a precise `isOfficeBearer`, per-request cache and the ex-holder int test (6.2, 6.4, 6.6); `restricted` meetings and items (6.1, 6.2); server-side uploads for `office-files` and the 4 MB cap (6.5, 14); erasure scrub, recipient purge, hash-keyed suppression and the no-address-outside-suppressions test (1, 9.2, 9.7); unsubscribe throttle only for invalid tokens and settings-driven compliance wording (9.4); forgot-password latency, `serverURL` and the blocking selector test (9.5); CSV reuse, audited-export wrapper, DOB/emergency/notes opt-in, and the dropped "audited access" claim (1, 3); scoped name projections, no per-person paid hours for editors, raised as a decision (1, 5.2, 14); quick-add forms, the blocking `admin.hidden` spike, and the `/office` versus `/admin/office` reconciliation (3.3, B1); cuts and the minimum viable set (build order, 14); club-neutral wording, configurable address labels and the regional-term denylist (3.1, 7.2, 12); honest-numbers wording, the small-count rule and the unmatched/missing-game counts (4.4, 5.4, 8).

Modified rather than taken literally:
- **Per-season payment pools (finding 3).** Offered as an alternative to labelling; not made the default. Targeted payments plus oldest-first for untargeted money gives correct results without hand-carried arrears, and the columns are labelled "as at all payments to date".
- **Rate freeze (finding 2).** Both options are used (hook that refuses edits to in-use rates, plus a snapshot on `memberships`), because the hook alone can be bypassed by direct writes.
- **Cached `isOfficeBearer` (finding 5).** Memoised per request only, never across requests, so a handover cannot be masked by a stale cache.
- **Hiding paid hours (finding 12).** Editors lose the `kind` of an assignment and all per-person hour rows, and keep suppressed-for-small-counts totals; the existence of paid shift types in settings is not treated as per-person information.
- **`log` adapter (finding 14).** Replaced by `EMAIL_PROVIDER=mock` with a console dump, not removed outright, so local acceptance still works without a network.

No change needed: the single `everydayNav` entry and the `officeCollections` rule (finding 13, first part: accepted as already designed); `CLUB_TIMEZONE` defaulting in `config/site.ts` (finding 15, first part: acceptable because it is configuration). No finding was rejected as invalid; finding 11's claim about `lib/stats/csv.ts` was verified against the file (`needsGuard`, `unescapeCell`, `csvCell`, `toCsv`) before accepting it.
