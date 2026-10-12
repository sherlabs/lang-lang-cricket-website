# Wave D: socials leftovers and the club back office (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #21 (leftovers only), #24, #25, #26, #27, #28, #29, #30. Out of scope: any payment provider or card handling, payroll or wages, accounting export (Xero/MYOB), a member self-service portal or login, member-facing balances, public minutes, live calls to any external service (email is env-gated, section 9), two-factor, a `treasurer` role (flagged in section 14), bounce/complaint webhooks (flagged), PDF generation (print CSS only).

| WP | Issues | One line |
| --- | --- | --- |
| WP-0 | #21 | Toss graphic (from the match store), name-only sponsor thank-you, minimal-style leaders spacing fix. |
| WP-1 | #24 | One "Club office" menu entry and landing page; member directory with admin-only personal data, audited access, logged exports. |
| WP-2 | #25 | Membership tiers, manual payments, waivers, derived per-game status, oldest-first allocation, credit, treasurer report. |
| WP-3 | #26 | Volunteer roster by week, per-person availability links, confirm week into an hours ledger (paid vs volunteer), grant report. |
| WP-4 | #27 | Meetings from templates, attendance, motions and votes, actions, minutes; committee seats that hand over at the AGM; office-bearer-only documents. |
| WP-5 | #28 | Season diary (annual jobs) with overdue and blocked callouts; strategic plan (pillars, objectives, linked jobs); one-click generic starter content. |
| WP-6 | #29 | Bulk email behind an `EmailAdapter` seam (mock in tests, Resend when env is set), unsubscribes, suppression, Payload password-reset email. |
| WP-7 | #30 | Stock and merch: items, a movements ledger, issue to a person, returns, what is owed back. |

Build order: WP-0 (independent), WP-1 (foundation every other WP uses), WP-2, WP-3, WP-4, WP-5 (needs seats from WP-4), WP-6 (needs the member filters and the fee and volunteer segments), WP-7. Each ships alone behind its own migration and doc.

Product goal (applies everywhere): this repo is reused for other clubs. Everything club-specific (colours, crest, fonts, names, copy, hosts, cookie names, currency, shift types, sender identity) comes from the `theme`/`club`/`office-settings` globals or env (`config/site.ts`), never code. Tailwind `brand-*` tokens, no hex literals, no club-name strings outside `config/site.ts` and seed defaults. Starter content (diary jobs, plan, meeting templates, shift types) is generic and club-neutral. The guards in section 12 scan the new folders.

## 0. Findings that shape the design

Checked against this branch.

1. **Wave C is built.** `lib/social/` has nine graphic types (`TYPE_KEYS` in `lib/social/types.ts`), three styles (`kits.ts`), specs in `lib/social/specs/*`, loaders in `lib/social/sources/*`, a height budget in `fit.ts` that every test pushes every type, size and style through, and a queue with adapters. WP-0 extends these; it adds no new renderer.
2. **Toss data is already stored.** `matches` carries `tossWinnerTeamId`, `tossChoice` (`bat`|`bowl`) and `clubWonToss` (written from PlayHQ `coinToss` in `lib/playhq/match-rows.ts`), all nullable. No new sync work.
3. **Sponsor thank-you draws a grey tile today.** `lib/social/render.tsx` (`case 'logos'`) draws a `surfaceAlt` tile with the initial when `src` is null. The spec passes `name: ''` for a single sponsor, so a logo-less single sponsor would also show no name in the block (only in the headline).
4. **Minimal leaders blank space has a likely cause.** `stats-leaders` calls `cutRows(rows, size, 0)` with no style, so the row count and height are the same for every style, while `availableHeight()` in `fit.ts` is larger for `minimal` (corner crest at 0.7 scale, plain frame). The unused height shows as blank space. Reproduce first (section 3.3); this is a hypothesis.
5. **`people` is public.** `People` has `read: anyone` and feeds Contact, Home and People pages. Private fields must never be added to it. `players` is also public-read for visible rows. So member contact data cannot live on either; `members` is a new admin-only collection that links to them.
6. **`match-appearances` already supports fees.** It has `match`, `player`, `isClubSide`, `isFillIn`, `isRegisteredPlayer`, `nameKey`; `matches` has `seasonName` and a date. Appearances with `player` null cannot be charged and are reported as a data-quality count, not guessed.
7. **Forgot-password is hard-disabled in code** (`payload/collections/Users.ts`, `beforeOperationGuard`, `operation === 'forgotPassword'` throws 403) and `payload.config.ts` has no `email` adapter. WP-6 makes that conditional on a configured adapter and adds a throttle bucket (the `rest-login` bucket in `lib/throttle.ts` is the model).
8. **Files are public by default.** `payload.config.ts` sets `disablePayloadAccessControl: true` for every blob collection, so uploaded files are direct public URLs. Office-bearer-only documents need `disablePayloadAccessControl: false` so Payload serves them through its access-controlled file route; the underlying blob URL is unguessable but not a secret-grade store (section 6.5, section 14).
9. **GraphQL is disabled.** "REST and GraphQL" in each access table therefore means REST and the Local API (the Local API ignores access unless `overrideAccess: false`, so every `lib/*-queries.ts` states its own filter, as the repo rule says). A test pins `graphQL.disable`.
10. **Menu caps.** `everydayNav` is at its cap of 16, `jobTiles` at 14. This wave adds exactly one `everydayNav` entry (Club office, cap 16 to 17; justification: it replaces seven would-be entries, so the committee menu grows by one, not seven) and no `jobTiles`. Everything else is reached from the landing page or sits under Advanced.
11. **Existing reusable pieces:** `isStaffUser`/`isAdminUser`/`isAdmin`/`isAdminField` (`payload/access`), `hiddenFromEditors`, HKDF labels and `deriveKey` (`lib/secrets.ts`), `ipHit`/`hit` throttle (`lib/throttle.ts`), `isJunior`/`isSocialEligible` (`lib/social/eligibility.ts`), `lib/stats/csv.ts` (CSV; confirm formula safety, Appendix B), claim/lease queue (`lib/social/queue-core.ts`), notification centre (`payload/components/NotificationCentre.tsx`, `payload/admin/copy.ts`, `dashboardCards.ts`), the availability link and cookie pattern (`lib/availability-link.ts`), `lib/selection/season.ts` and `SEASON_START_MONTH`/`SEASON_NAME_FORMAT` in `config/site.ts`.

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit `git add` paths, never `git add -A`, never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`: `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); verify hosts are `127.0.0.1` before DB work; no Blob token; no remote DB; no Vercel CLI. Anything that could reach PlayHQ runs with `PLAYHQ_CLIENT_ID=` empty. Dev servers on ports 4200-4299 only (the repo `CLAUDE.md` says 3400-3499; this run's brief overrides it, and nothing committed depends on either). **This wave makes no external call.** Email, social networks and the AI gateway are mocked in tests and off when env is unset.

**Migrations.** One per WP from `pnpm payload migrate:create <name>`, schema-qualified (`"payload"."..."`), `.ts` and `.json` committed, club-neutral SQL (function defaults, as `Theme` does): `d1_members_office`, `d2_membership_fees`, `d3_volunteers`, `d4_meetings_seats`, `d5_diary_plan`, `d6_email`, `d7_stock`. WP-0 has no migration. After each: `pnpm generate`, `git add payload-types.ts "app/(payload)/admin/importMap.js"`, then `pnpm check:migrations` and `pnpm check:generated` pass. Dev DB reset: `DROP SCHEMA payload CASCADE` via node + pg, then `pnpm payload migrate`.

**Staff means staff.** Staff is admin or editor (`isStaffUser`). Selectors are a separate role and get nothing from this wave. New code never writes `Boolean(user)` or `!req.user` as an access check; `tests/staff-guard.test.ts` scope is extended (section 12). Server actions and route handlers are public POSTs: each re-derives the caller (`getPayload().auth({ headers })`), validates input with a pure function, and derives `createdBy`, status and totals on the server, never from form fields.

**Access vocabulary** used in every table below: public (anyone), token (holder of a signed link), selector, staff (admin or editor), admin, office-bearer (admin, or a staff user who currently holds a seat marked office-bearer, section 7.3), nobody (no REST write; only a server action or script writes, using `overrideAccess` after its own check).

**Personal and financial data rules (hard).**
- Personal data (contact details, date of birth, address, emergency contact, ledger rows with a person and an amount, email addresses) is admin-only in REST and the Local API with `overrideAccess: false`, and never reachable from a public query. Every field on a personal collection declares `access.read`, `access.update` (and `create`) explicitly (`isAdminField` or stricter); a test fails if one omits it.
- Editors never read member contact data. Editor-facing screens (roster, stock issue, action owners) get **name-only projections** from `lib/members-queries.ts` (`{ id, displayName }`), generated server-side after a staff check. Names are not treated as contact data; this is a decision flagged in section 14.
- No card data anywhere: no field, no provider, no card-shaped text accepted in free-text fields (a Luhn-based validator, `looksLikeCardNumber`, rejects 13-19 digit runs in reference and note fields).
- CSV exports are admin-only POSTs, formula-injection safe (`lib/office/csv.ts`: any cell starting `=`, `+`, `-`, `@`, tab or CR, after trimming leading whitespace, is prefixed with `'`; RFC 4180 quoting; no raw `\r\n` inside cells), `Cache-Control: no-store`, and write an `office-audit-log` row (user, module, filter summary, row count, time) before streaming. Same-origin check (`Origin`/`Sec-Fetch-Site`) on the POST.
- Erasure: a member can be archived (status past) or have personal details removed by an admin (blanks every contact field, keeps ledger rows against a "Former member" label, keeps any email suppression entry because honouring an unsubscribe is a legitimate retention). The action writes an audit row.
- Ledgers are append-only: payments, waivers, hours and stock movements are voided (with who, when, why), never edited or deleted, so reports are reproducible.
- Money is integer cents. Currency and locale come from `office-settings` (default from `config/site.ts`, `OFFICE_CURRENCY`, `OFFICE_LOCALE`); nothing assumes dollars in code.

**Shared building blocks (new, built once in WP-1).**

| Need | Where | Notes |
| --- | --- | --- |
| Module registry | `lib/office/modules.ts` | Key, label, plain hint, admin path, role (`admin`|`staff`), env gate. Drives the landing page, the notification lines, the help page and the tests, so a module cannot appear in one and not another. |
| Landing page | `payload/components/OfficeView.tsx`, route `/office` | Tiles per role, one stat line per tile, callouts. |
| Name projection | `lib/members-queries.ts` | Staff-checked, returns `{id, displayName}` only. |
| CSV | `lib/office/csv.ts` | Formula-safe cell escaper and row writer; used by every export. |
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
| `addressLine`, `suburb`, `state`, `postcode` | Optional. |
| `dateOfBirth` date | Optional; used only to flag juniors with `isJunior` (the same function as socials). |
| `guardians` rel members hasMany | For a junior without their own email; the guardian's email is used for mail (WP-6). |
| `emergencyContact` group (`name`, `phone`, `relationship`) | Admin only. |
| `doNotEmail` checkbox | Counts as suppressed in WP-6. |
| `notes` textarea | Hint: "Do not record medical details here." |
| `volunteerLinkVersion` int (server-owned) | For WP-3 availability links. `access.update` nobody; bumped by an action. |
| `importedFrom` select | `manual`, `players`, `csv` for the audit trail. |

Also `office-audit-log` (`user`, `action` select export|email-send|erase|bulk-change, `module`, `summary`, `rowCount`, `at`) and the `office-settings` global (WP-1 adds currency, locale, shift types for WP-3, diary lead days for WP-5, sender text for WP-6, with club-neutral function defaults).

### 3.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `members` REST + Local API (find, findByID, count, create, update, delete) | deny | deny | deny | allow (delete = archive action preferred; hard delete allowed) |
| `members` any field | no | no | no | allow (each field declares `isAdminField`) |
| `office-audit-log` | deny | deny | deny | read; nobody writes |
| `office-settings` | deny | deny | read of non-sensitive fields via `lib/office/settings.ts` server helper only | read/write |
| Name projection (`listMemberNames`) | n/a | n/a | allowed, `{id, displayName}` only | allowed |
| Export `POST /api/admin/office/export/members` | 404 | 404 | 404 | allowed, logged |
| Public site | no route reads `members` | | | |

GraphQL disabled; a test asserts it. A member of the public learns nothing: `players` and `people` do not gain fields, and a test compares their `find` output keys to a stored allowlist.

### 3.3 UI

- **Menu.** `everydayNav` gains `{ key: 'office', label: 'Club office', path: '/office', matches: ['/office'] }`; cap 16 to 17 in `tests/admin-visibility.test.ts` with the justification as a one-line comment. `advancedNav` gains `{ key: 'office-settings', label: 'Club office settings', path: '/globals/office-settings' }` (admin only, `admin.hidden: hiddenFromEditors`). No `jobTiles` change. New `officeCollections` list in `navigation.ts` (like `socialCollections`): every collection in sections 3 to 9, each classified `admin` or `staff`, absent from both menus; the test asserts each is reachable from `lib/office/modules.ts` or an explicit parent view, and unclassified collections fail. Open point for Appendix B: whether `admin.hidden` also blocks the native edit route; native list/edit pages are used for simple CRUD (members edit, tiers, items), so the collections are left un-hidden but off both menus, with `admin.hidden: hiddenFromEditors` where the module is admin-only.
- **Landing `/admin/office`.** One page, plain English, mobile first. A grid of module tiles (icon, name, one-line hint, one stat line such as "14 members have no email"), shown per role: editors see Volunteers, Meetings, Diary & plan, Stock; admins also see Members, Fees, Email (Email appears only when a provider is configured, section 9). Callouts above the tiles (overdue jobs, empty shifts this weekend, fees owing for admins). Footer links for admins: Office settings, "Exports and sends log".
- **Directory `/admin/office/members`** (admin). Search by name, filter chips: Status (Active/Past), Role (one per role), Season membership (from WP-2 once present), Age (Juniors), **Missing email, Missing phone, Missing both, Missing guardian (junior)**. Completeness strip at top ("312 members: 41 no email, 58 no phone"). Rows are cards on a phone and a table from 768 px; each links to the native edit page. Actions: Add member, "Add members for players who have none" (creates linked rows, role player, no contact data, idempotent via the unique `player` constraint), Export CSV (current filter), duplicate warning when two members share an email. 50 rows per page, server pagination.
- **Native edit page** for one member: all fields with plain labels and helper text; read-only "Fees", "Volunteering" and "Email" summary panels added by later WPs. A "Remove personal details" button (admin, confirm dialog, audited).

### 3.4 Tests

- Unit: filter builder (`lib/office/member-filters.ts`: parse query params to a safe `Where`, unknown keys dropped), `displayNameFor` (linked player wins over typed name), `looksLikeCardNumber`, csv cell escaper (rows for `=cmd`, `+1`, `-2`, `@x`, tab, leading spaces, quotes, newlines), `listMemberNames` shape.
- Int: **access matrix** `tests/int/office-matrix.int.test.ts` (new): every office collection x anonymous / selector / editor / admin x find, findByID, count, create, update, delete via the Local API with `overrideAccess: false`, against a declared expectation table that also drives the docs table; plus the REST path for members. **Field-level audit** `tests/office-field-access.test.ts` (unit, walks the sanitised config): every field of every personal collection has explicit access functions that are admin-or-stricter; a list of sensitive names (`email`, `phone`, `address*`, `dateOfBirth`, `emergency*`, `notes`, `postcode`) appears on no collection outside the office set. Int: editor gets 403 on a members export; admin export writes one audit row with the row count; the export body has formula cells neutralised; erasing details blanks every contact field and keeps ledger rows.
- Public leak test: render `/players`, `/people`, `/contact` and a player profile for a seeded member who is also a player and committee person; the page text contains none of their email, phone or address.

### 3.5 Seed and acceptance

`seed:demo`: about 40 members built from the demo players plus parents, a life member, a volunteer, a sponsor contact; deliberately 6 with no email, 9 with no phone, 3 with neither, 4 juniors with a guardian. Acceptance: migrate a clean `langlang_dev`, `pnpm seed:demo`, start on 42xx, sign in as admin (directory, filters, export, audit row) and as the seeded editor (landing shows no Members/Fees/Email tiles; `/admin/collections/members` 403/404; REST `GET /api/members` 403).

### 3.6 Risks

Editors seeing names via the projection is a policy choice (section 14). Native admin pages for a hidden collection depend on the Payload routing behaviour (Appendix B). Importing real members is out of scope; a CSV import is deferred with its own issue because it needs mapping UI and duplicate rules.

## 4. WP-2: membership tiers and match-fee ledger (#25)

### 4.1 Data model (migration `d2_membership_fees`)

- `membership-tiers` (admin): `season` (text, season name format), `name`, `kind` select `upfront` | `per-match` | `free`, `upfrontCents`, `perMatchCents`, `active`. One tier can be both (upfront membership plus a match rate) by setting both amounts.
- `memberships` (admin): `member`, `season`, `tier`, `joinedOn`, `note`. Unique `(member, season)`.
- `fee-payments` (nobody writes over REST; admin reads): `member`, `receivedOn`, `amountCents` (> 0), `method` select `cash` | `bank-transfer` | `other` (no card options), `reference`, `note` (both card-number validated), `recordedBy`, `voidedAt`, `voidedBy`, `voidReason`.
- `fee-waivers` (same): `member`, `scope` select `game` | `season` | `amount`, `match` (rel matches, game scope), `season`, `amountCents` (amount scope), `note` (required), `grantedBy`, `voidedAt`.
- **No stored charges and no stored allocation.** Charges are derived on read from `match-appearances` x `matches` x the member's tier. Status is a pure function of the inputs, so it can never drift from the data and a voided payment re-allocates itself.

### 4.2 Derivation (pure, `lib/office/fees.ts`)

Inputs per member: charges `[{ id, kind: 'season'|'game', date, season, amountCents, matchId? }]`, waivers, payments. Charges: for each membership, an upfront charge dated `joinedOn` (or season start) if `upfrontCents > 0`; for each club-side appearance in a final game of that season where `appearance.player = member.player` and the tier has `perMatchCents > 0`, one game charge dated the match date. Fill-ins are charged only if `isRegisteredPlayer` is set or the member is linked (settings flag `chargeFillIns`, default off). Free tier produces no charges.

`allocate(charges, waivers, payments)` returns per-charge `{ payableCents, waivedCents, paidCents, owedCents, status }` and `creditCents`:
1. Sort charges oldest first by `(date, id)`.
2. Apply game and season waivers (zero the charge); apply amount waivers oldest first.
3. Pool = sum of non-voided payments (across all seasons: one running ledger per member).
4. Walk charges oldest-first settling `min(owed, pool)`; leftover pool is `creditCents`, which is why credit rolls forward into next season's first charges with no extra code.
Status words (text plus icon, never colour only): Paid, Part paid, Owing, Waived, Not charged.

Property tests (fast-check or table driven): total paid + credit equals total payments; never over-pays a charge; deterministic; voiding a payment only moves allocation later charges; adding a waiver never increases owed; order of input rows does not matter; zero charges yields all credit.

### 4.3 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `membership-tiers`, `memberships` REST + Local | deny | deny | deny | create/read/update/delete |
| `fee-payments`, `fee-waivers` read | deny | deny | deny | read |
| `fee-payments`, `fee-waivers` create/update/delete | deny | deny | deny | nobody (only the Fees server actions, after an admin check, validation and audit; void instead of delete) |
| Fees report, member ledger, CSV | 404 | 404 | 404 | allowed; CSV logged |

### 4.4 UI (admin routes)

- `/admin/office/fees`: season picker (default current). Summary cards: Payable, Paid, Waived, Outstanding, Credit held. Table per member: name, tier, payable, paid, waived, owing, credit; sort by owing; "Owing only" toggle. A data-quality line: "N appearances could not be matched to a member" linking to the list (fix by linking the player). Export two CSVs (summary, game-by-game detail), admin only, logged.
- `/admin/office/fees/member/[id]`: per-game list with status chips, payments and waivers lists (void with a reason), forms: Record payment (amount, date, method, reference, note) with a live "This will settle: Rd 3 v X, Rd 4 v Y; $10 credit left" preview computed by the same pure function, Add waiver (game / whole season / amount, note required).
- Tiers: native admin list/edit (Advanced reachability via the Fees page "Set up fees" link). A "Copy last season's tiers" action.
- Notification line (admin only): "N members owe $X in match fees." Landing tile stat the same.

### 4.5 Tests

Unit: `allocate` properties above plus worked examples (three games, part payment, waiver then payment, credit roll across a season boundary, fill-in rule, free tier, voided payment); money parse/format; card validator. Int: server action rejects non-admin and bad amounts; record then void re-derives; report totals equal the sum of member rows; CSV neutralises a member named `=HYPERLINK(...)`; matrix rows. Security: no fee data in any public render; REST create of a payment denied even for admin.

### 4.6 Seed and acceptance

Two tiers (season upfront; pay-as-you-play with a per-match rate), memberships for the demo members, payments that part-settle some, one overpayment (credit), one waiver. Acceptance: open Fees on 42xx, see owing and credit, record a $20 payment and watch the oldest games flip to Paid, void it, export the CSV and check the audit row.

### 4.7 Risks

Appearances arrive from PlayHQ after games, so a charge appears when the sync lands; docs say so. Players renamed or unlinked in PlayHQ can leave appearances unlinked (the data-quality line). Junior games may not be in the store; juniors use an upfront tier. Refunds are not modelled (void and re-enter, documented). Data protection: this is financial plus personal data, hence admin-only.

## 5. WP-3: volunteer roster and hours ledger (#26)

### 5.1 Data model (migration `d3_volunteers`)

- `office-settings.shiftTypes` (array: `key` slug, `label`, `defaultHours`, `defaultSlots`, `kind` default `volunteer` | `paid`); generic defaults: Canteen, Bar, Gate. A club adds its own; keys never change once used (labels do).
- `volunteer-weeks`: `season`, `date` (game day), `label`, `status` `draft` | `open` | `confirmed`, `confirmedAt`, `confirmedBy`. "Create weeks for the season" builds one per home-game date from `selection-fixtures` (confirm the right source in Appendix B) plus manual add.
- `volunteer-shifts`: `week`, `shiftTypeKey`, `labelSnapshot`, `hours`, `slots`.
- `volunteer-assignments`: `shift`, `member`, `kind` `volunteer` | `paid`, `hours` (default from shift), `state` `rostered` | `confirmed` | `no-show` | `cancelled`. Separate rows (not an array) so assignments have stable ids, as Wave C finding 9 requires for anything written concurrently.
- `volunteer-availability`: `member`, `week`, `state` `yes` | `no` | `maybe`, `preferredShiftKeys`, `note`, unique `(member, week)`.
- `volunteer-hours` (the ledger): `member`, `date`, `hours`, `kind` `volunteer` | `paid`, `shiftTypeKey`, `week`, `assignment` (unique when set, making confirm idempotent), `source` `roster` | `manual`, `note`, `voidedAt`, `voidedBy`, `voidReason`. Hours only; no pay rates, no wages (payroll is out of scope).
- `members.volunteerLinkVersion` (WP-1) for per-person links.

### 5.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `volunteer-weeks`, `-shifts`, `-assignments`, `-hours` read | deny | deny | allow | allow |
| same, create/update/delete | deny | deny | nobody (roster server actions after `isStaffUser`) | nobody (same actions) |
| `volunteer-availability` read | deny | deny | allow | allow |
| `volunteer-availability` write | nobody (only the token route and staff actions) | | | |
| Token page `/volunteer/[token]` | token only | | | |
| Hours CSV | 404 | 404 | 404 | allowed, logged |

Editors may read hours and assignments (they hold names, hours and dates, no contact data). Contact details stay on `members`.

### 5.3 Availability links (reuse of the availability pattern, with a deliberate change)

`/volunteer/[token]` where `token` is an HMAC of `(memberId, volunteerLinkVersion)` with a new HKDF label `volLink` in `lib/secrets.ts`. Each volunteer has a **personal** link, unlike the club-wide player link with a name picker and PIN, because a name picker would expose the volunteer list to anyone holding a forwarded link. The page shows the volunteer's first name, the open weeks and Yes / No / Maybe buttons with a note, plus their confirmed shifts. Constant-time token compare, `ipHit` bucket `vol` (60 per 10 minutes), `Referrer-Policy: no-referrer`, `noindex`, `Cache-Control: private, no-store`. Rotating the link bumps the version and kills the old URL. Staff copy the link from the roster screen; WP-6 can mail it as a per-recipient merge tag. Mutations are server actions that re-verify the token on every call.

### 5.4 UI

`/admin/office/volunteers`: season weeks list with fill status ("2 of 6 slots empty", text plus icon). Week page: one section per shift type, slots as cards on a phone. Each open slot shows people who said Yes first, then Maybe, with their season hours so the load is visible; tap to assign. Warnings (not blocks): double booking, over capacity, assigned someone who said No. **Confirm week** posts hours: one `volunteer-hours` row per confirmed assignment (idempotent on `assignment`); status goes `confirmed`; **Reopen** voids that week's roster-sourced rows. No-show toggles remove hours. Manual hours entry for ad-hoc work (working bee). Report `/admin/office/volunteers/hours`: season or date range; totals split paid vs volunteer; by shift type; per person; a name-free aggregate view for grant applications; CSV for admins (aggregate and per-person), logged.

### 5.5 Tests

Unit: confirm builds exactly the expected ledger rows; idempotent twice; reopen voids; paid and volunteer never mix in totals; token sign/verify/rotate; availability state machine; week generation dedupes dates. Int: editor can roster but not call the CSV; token route rejects wrong, rotated and replayed-for-other-member tokens; throttle triggers; availability row is only writable through the route; matrix rows. Public leak: the token page shows no other person's name.

### 5.6 Seed and acceptance

Six weeks, shifts from the default types, availability for a dozen volunteers, two confirmed weeks with hours (some paid). Acceptance: open a week, assign, confirm, view the hours report and aggregate, open a seeded personal link in a private window, change a response, see it on the roster.

### 5.7 Risks

Forwarded links give one person's availability to whoever holds them (accepted, rotatable). Shift types are free text keys: renaming a type's label must not rewrite history (hours keep `labelSnapshot`). Needs fixtures to generate weeks; manual add is the fallback.

## 6. WP-4: committee meetings, seats and office-bearer documents (#27)

### 6.1 Data model (migration `d4_meetings_seats`)

- `committee-seats`: `title`, `sortOrder`, `holder` rel `people`, `holderUser` rel users (optional; makes that login the seat's holder for document access), `officeBearer` checkbox, `termStart`, `handoverNote`. `seat-terms` (history): `seat`, `person`, `from`, `to`.
- `meeting-templates`: `name`, `kind` `ordinary` | `agm` | `special`, `items` array (`title`, `kind`, `defaultNotes`), `quorum`. A "Add the standard templates" action seeds generic AGM and ordinary agendas (welcome and apologies, previous minutes, business arising, reports, financial statements, election of office bearers, general business, close).
- `meetings`: `kind`, `title`, `startsAt`, `venue`, `status` `planned` | `in-progress` | `closed` | `cancelled`, `chairSeat`, `minuteTakerSeat`, `quorum`, `minutesText`, `minutesStatus` `draft` | `approved`, `approvedAtMeeting` rel.
- `meeting-items`: `meeting`, `order`, `title`, `kind`, `notes`, `outcome`.
- `meeting-attendance`: `meeting`, `person` rel people or `guestName`, `state` `present` | `apology` | `absent`.
- `meeting-motions`: `meeting`, `item`, `text`, `movedBy`, `secondedBy` (attendance rows), `votesFor`, `votesAgainst`, `abstain`, `result` `carried` | `lost` | `tabled` | `withdrawn`. Counts only; per-person votes are deferred.
- `meeting-actions`: `meeting`, `item`, `text`, `ownerSeat` or `ownerPerson`, `due`, `status` `open` | `done` | `blocked` | `dropped`, `doneOn`, `carriedFrom`.
- `office-files` (upload collection, see 6.5) and `committee-documents`: `title`, `category`, `file` rel `office-files`, `meeting` (optional), `uploadedBy`.

### 6.2 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| seats, seat-terms, templates, meetings and children | deny | deny | read; write only via meeting/seat server actions or native edit for templates | all |
| `committee-documents`, `office-files` read and download | deny | deny | only if office-bearer | allow |
| same, create/update/delete | deny | deny | only if office-bearer (creates), nobody for delete | allow |
| Minutes print view | 404 | 404 | allowed | allowed |

`isOfficeBearer(user)` (async access function): admin, or an active staff user for whom a seat exists with `holderUser = user`, `officeBearer = true` and no ended term. Fails closed on any error. Selectors never qualify.

### 6.3 Meeting flow (`/admin/office/meetings`)

List with upcoming and past. **New meeting**: pick a template and date; the action copies items, adds attendance rows for current seat holders, and puts every open action from earlier meetings into a "Business arising" item. **Run view** `/admin/office/meetings/[id]`, mobile first: agenda as a list with the current item expanded; attendance chips (Present / Apology / Absent) with a text quorum indicator ("Quorum met: 6 of 5 needed"); quick add motion (text, mover, seconder, for/against/abstain, result); quick add action (text, owner seat, due); notes per item. **Close meeting** builds a draft minutes text from structured data with the pure `buildMinutes(meeting)` (editable `minutesText`), then status closed. At the next meeting the "Approve previous minutes" item sets `minutesStatus = approved`. Print view `/admin/office/meetings/[id]/minutes` with print CSS (browser print to PDF). Open actions list `/admin/office/meetings/actions` filterable by seat, overdue first; overdue and blocked counts feed the dashboard (section 7.5).

### 6.4 Seat handover at the AGM

On an AGM meeting, a **Hand over seats** step lists every seat with its current holder and a person picker for the new holder (or "vacant"). Confirming closes each changed term (`to` = meeting date), opens the new term, updates `holder`, and writes the audit row. Because jobs, actions and diary items are owned by the **seat**, they follow the seat automatically. The step ends with a checklist: "Update Committee & contacts page" linking to the affected `people` records (the public committee page is still edited by hand; deriving it from seats is deferred, section 14), and "Check who can open office-bearer documents" (the `holderUser` field). No automatic edit to public `people` data.

### 6.5 Office-bearer documents and storage

`office-files` is a separate upload collection (PDF, Word, Excel, images; 15 MB cap) with `disablePayloadAccessControl: false` in the blob plugin config so files are served through Payload's access-controlled route and the direct blob URL is never given to the browser. Locally files use local storage. Honest limit: the blob object behind it is an unguessable but public URL on the current store (section 14). Download route sets `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `noindex`.

### 6.6 Tests

Unit: `buildMinutes` golden outputs (attendance, motions, actions, apologies, quorum), template copy, handover planner (term closing, vacant seat, unchanged seat untouched, jobs still referencing the seat), `isOfficeBearer` decision table, actions carry-forward. Int: handover end-to-end; editor without a seat cannot read or upload a committee document (REST and download route); office-bearer editor can read and upload but not delete; selector and anonymous denied; direct `office-files` URL shape does not expose the blob URL (response headers); matrix rows.

### 6.7 Seed and acceptance

Seats for the usual offices (generic titles) with holders from demo people, two completed meetings, one planned AGM, a few actions (one overdue), two office-bearer documents. Acceptance: create an ordinary meeting from the template, mark attendance, add a motion, close and print the minutes; run the AGM handover and see a seat's owned jobs follow it.

### 6.8 Risks

Minutes are legal-ish records (retention, approval wording): the app records, the club decides. Per-person votes and in-camera items are deferred (#27 follow-up). The public Committee page and the seats can disagree until a human edits both; flagged in docs.

## 7. WP-5: season diary and strategic plan (#28)

### 7.1 Data model (migration `d5_diary_plan`)

- `diary-jobs`: `title`, `season`, `category` select (`affiliation`, `governance`, `insurance`, `licence`, `finance`, `ground`, `events`, `other`), `due`, `ownerSeat` rel `committee-seats` (optional `ownerPerson` rel people), `budgetCents`, `actualCents`, `status` `todo` | `in-progress` | `blocked` | `done`, `blockedReason` (required when blocked), `doneOn`, `objective` rel `plan-objectives` (this is how an objective has "linked actions": a plan action is a diary job with an objective), `repeatsYearly`, `sourceKey` (stable starter key), `notes`.
- `plan-pillars`: `title`, `summary`, `sortOrder`. `plan-objectives`: `pillar`, `title`, `ownerSeat`, `targetDate`, `budgetCents`, `status`, `progressNote`, `sortOrder`, `sourceKey`.
- Derived on read, never stored: overdue (`due < today` and not done), due soon (within `office-settings.diaryLeadDays`, default 14), blocked, objective progress (done jobs of linked jobs), spend versus budget with a warning when linked job budgets exceed the objective budget, unowned (seat with no holder).

### 7.2 Starter content (one click, generic)

`lib/office/starter-diary.ts` and `starter-plan.ts` hold generic content: a dozen annual jobs (affiliation and registration fees, AGM, insurance renewal, licence and permit renewals, tax and reporting returns, ground and pitch preparation, equipment check, canteen licence check, working bee, awards event, registration opening, season review) each with a month offset relative to `SEASON_START_MONTH`, a category and an unassigned seat; and five generic pillars (Participation and growth, Facilities and ground, Finance and sustainability, Community and culture, Governance and people) with two or three example objectives each, marked "example, edit me". Both actions are idempotent by `sourceKey` (+ season for jobs), only add what is missing, and never overwrite edits. A guard test fails if any starter string contains a club name or place name from the theme/club seed defaults or config.

### 7.3 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `diary-jobs`, `plan-pillars`, `plan-objectives` read | deny | deny | allow | allow |
| create / update | deny | deny | allow (native forms, plain labels) | allow |
| delete | deny | deny | deny | allow |
| Starter actions, "next year" copy | 404 | 404 | allow | allow |

Budgets are club figures, not personal data, so editors may edit them.

### 7.4 UI

`/admin/office/diary`: month-by-month list for the chosen season, chips Overdue, Blocked, Due soon, Mine (jobs on the signed-in user's seat), quick status buttons, owner and budget shown, "Add the standard jobs for {season}" when empty, "Copy repeating jobs to next season". `/admin/office/plan`: pillars as sections with objectives, progress as text ("3 of 5 jobs done, $1,200 of $3,000") plus a bar, linked jobs listed under each objective, "Add a job to this objective", one-click "Add a starter plan" when the plan is empty, printable view.

### 7.5 Dashboard callouts

`payload/admin/copy.ts` and the notification centre gain editor-visible lines: "N club jobs are overdue" (link to the diary filtered), "N jobs are blocked", "N jobs have no owner", and from WP-4 "N committee actions are overdue". Problems first, hidden when zero. Budget over-spend is a diary-page badge only.

### 7.6 Tests

Unit: overdue/due-soon/blocked derivation across timezones (club time zone from config, not the server's), month offset from `SEASON_START_MONTH` for both hemispheres and `SEASON_NAME_FORMAT`, starter idempotency, objective progress and budget roll-up, `blockedReason` validation. Int: starter run twice yields no duplicates; editing a starter job then re-running does not overwrite it; seat handover keeps jobs with the seat; matrix rows. Guard: no club names or hex in the starter files.

### 7.7 Seed and acceptance

Standard jobs for the current season with a spread of states (two overdue, one blocked, a few done), the starter plan applied with progress on two objectives. Acceptance: Home shows the overdue and blocked lines; the diary filter shows them; marking one done clears the line.

## 8. Dashboard callouts and landing stats (shared)

One function per module in `lib/office/modules.ts` returns that module's stat line and callouts, each a pure projection over its own queries and role-checked (admin-only lines such as fees owing never reach an editor's page). `payload/admin/copy.ts` holds the wording; the notification centre renders them under the existing "Needs your attention" list, problems first, nothing shown at zero. Lines: overdue, blocked and unowned club jobs (WP-5); overdue committee actions (WP-4); empty shifts for the next game day within three days (WP-3); members owing match fees (WP-2, admin); low stock and kit overdue back (WP-7); the Club office landing shows the same figures as stat lines. A unit test feeds each function fixtures for zero, one and many.

## 9. WP-6: bulk email, unsubscribes and Payload email (#29)

### 9.1 Env-gated provider seam

`lib/email/types.ts`:

```ts
type EmailMessage = { to: string; from: { name: string; address: string }; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey?: string }
type SendResult = { ok: true; providerId: string } | { ok: false; kind: 'rate' | 'transient' | 'permanent' | 'auth'; message: string }
interface EmailAdapter { id: string; live: boolean; send(m: EmailMessage): Promise<SendResult> }
```

Adapters in `lib/email/adapters/`: `mock` (tests only, records messages, scriptable failures), `resend` (plain `fetch` to the Resend HTTP API with the `Idempotency-Key` header, no new dependency), and `log` (local dev only: writes the rendered message to a dev outbox view, never sends; refused in production by `assertSafeEnv`). Selection: `EMAIL_PROVIDER` (`resend`; empty means off), `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` (an address on a verified domain), optional `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_BATCH_SIZE` (default 50), `EMAIL_RATE_PER_SECOND` (default 2), `EMAIL_MAX_RECIPIENTS` (default 2000). `emailEnabled()` is true only when the provider, key and from address are all present. **When false the Email module is hidden everywhere** (no tile, view 404, routes 404, no cron work, forgot-password stays disabled) and nothing tries a network call. An SMTP adapter is a documented later alternative behind the same interface (section 14); nothing else changes.

Sender identity comes from config, never code: from name = `EMAIL_FROM_NAME` or the `club` global's name; reply-to = `EMAIL_REPLY_TO` or the club contact email; footer text from `office-settings` (default template "You are receiving this because you are connected with {clubName}. {contact}").

### 9.2 Data model (migration `d6_email`)

- `email-campaigns` (admin): `subject`, `body` (plain text with blank-line paragraphs and the merge tags below), `audience` (JSON snapshot of the filter spec), `status` `draft` | `sending` | `sent` | `cancelled`, `testSentHash` (hash of subject plus body at last test), `counts` group (`queued`, `sent`, `failed`, `skipped`), `createdBy`, `sentAt`.
- `email-recipients` (nobody writes over REST): `campaign`, `member`, `email` (snapshot, lowercased), `firstName` snapshot, `status` `queued` | `sending` | `sent` | `failed` | `skipped-suppressed` | `skipped-no-email`, `attempts`, `claimToken`, `claimedAt`, `providerId`, `error`, `nextAttemptAt`. Unique `(campaign, email)` so the same address gets one copy.
- `email-suppressions` (admin read; nobody write over REST): `email` (lowercased, unique, indexed), `reason` `unsubscribed` | `manual` | `bounced` | `complaint`, `source`, `at`, `campaign`. Keyed by address, not member, so it survives member deletion and erasure.
- Secrets: new HKDF label `emailUnsub` in `lib/secrets.ts`.

### 9.3 Compose, audience, test, send

- **Compose once** in `/admin/office/email` (admin only, visible only when enabled): subject, body, live preview rendered with a sample first name. Merge tags `{firstName}`, `{firstName|there}` (fallback), `{clubName}`, `{volunteerLink}`; anything else fails validation with the tag named. The HTML is built from the theme tokens at send time (`getTheme()`), never hex in code, plus an automatic footer with sender identity and the unsubscribe link; plain-text part always included.
- **Audience** from the WP-1 filter spec (same builder, same chips) plus segments registered by other modules: "owes match fees" (WP-2), "volunteers" (WP-3). A preview before sending: "412 match; 380 will receive; 20 have no email; 12 unsubscribed; 4 juniors will go to a guardian". A junior without their own email uses guardians' emails; addresses deduplicate; `doNotEmail` and suppressions are removed. Hard cap `EMAIL_MAX_RECIPIENTS`.
- **Test send to self**: sends one message to the signed-in admin's own login email (not a free-typed address), sample name, subject prefixed "[TEST]", no suppression or unsubscribe side effects, rate limited (10 an hour) and recorded as the `testSentHash`. **Send is enabled only when the hash of the current subject and body equals `testSentHash`**, so an edit after the test needs a new test. A confirm step shows the counts.
- **Batching and rate limit.** Send snapshots recipients into `email-recipients`, then batches run through a claim/lease (`UPDATE ... WHERE status='queued' AND (nextAttemptAt IS NULL OR nextAttemptAt <= now()) ... FOR UPDATE SKIP LOCKED`, same shape as `lib/social/queue-core.ts`, confirm reuse in Appendix B) of `EMAIL_BATCH_SIZE`, spaced to `EMAIL_RATE_PER_SECOND`. The page loops `POST /api/admin/office/email/[id]/batch` with a progress bar and can be closed and resumed ("Continue sending"); the same work is done by the CRON_SECRET route `/api/cron/email-batch` (constant-time bearer compare, the Wave C pattern) so a closed tab still finishes. Transient and rate failures retry with backoff (3 attempts); permanent failures are final and visible. Idempotency key = recipient id. **Suppression is checked at three points:** audience build, claim time (re-read immediately before sending, so an unsubscribe mid-send is honoured) and inside `sendCampaignMessage`, the only function that may send non-transactional mail.

### 9.4 Unsubscribe and the Spam Act

Every campaign message carries sender identification (name, contact), a visible unsubscribe link, and headers `List-Unsubscribe: <https://{host}/unsubscribe/{token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. `token = base64url(recipientId) + '.' + HMAC(emailUnsub, recipientId)`, no expiry (the link must keep working long after the send). Routes:

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /unsubscribe/[token]` | token | Shows a confirm page ("Stop emails to j***@example.com?") with a button. GET never changes data, so mail scanners that prefetch links cannot unsubscribe anyone. Generic "link not recognised" page for bad tokens. |
| `POST /unsubscribe/[token]` (form) and `POST /api/public/unsubscribe/[token]` (RFC 8058 one-click) | token | Writes the suppression row immediately (honoured at once, comfortably inside the Spam Act's five working days), idempotent; shows a done page with an "Undo, I changed my mind" button. |
| `POST` undo | token | Removes only that `unsubscribed` entry, never a `bounced`/`complaint`/`manual` one. |

Constant-time compare, an `ipHit` bucket (`unsub`), `noindex`, no cache, the address masked on screen. Admins can also add or remove a suppression manually (audited). The docs state plainly: the app provides the mechanism; the club is responsible for having consent and for the content of its messages, and should check current Spam Act guidance. Transactional mail (password reset, invites) is not subject to the suppression list and never carries a marketing footer.

### 9.5 Payload email wiring

`payload.config.ts` sets `email` from `emailAdapterForPayload()`, a function returning a Payload adapter built over the same `EmailAdapter` when `emailEnabled()`, otherwise `undefined` (today's behaviour). The `forgotPassword` block in `Users.beforeOperationGuard` becomes conditional: allowed only when `emailEnabled()`; otherwise the existing 403 with the existing wording. The reset link host comes from the configured server URL; the message is built from the club name and theme; the sender is the same identity. New throttle bucket `rest-forgot` (the `rest-login` model, per IP and per target address hash) on `forgotPassword`, with identical responses for known and unknown addresses. Selector accounts are covered by the same rule as staff (any active user with a password); confirm in Appendix B how selector sign-in (Facebook) interacts. Other notification emails (for example approvals) are deferred behind a `sendTransactional()` seam that exists but has no callers.

### 9.6 Access per operation

| Resource | Anonymous | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| `email-campaigns` | deny | deny | deny | create/read/update (not after sending), no delete once sent |
| `email-recipients` | deny | deny | deny | read; nobody writes |
| `email-suppressions` | deny | deny | deny | read; nobody writes (actions only) |
| Compose, batch, cron | 404 | 404 | 404 | allowed when `emailEnabled()` |
| Unsubscribe pages | token | token | token | token |

### 9.7 Tests

Unit: merge-tag parser (unknown tag, fallback, escaping so a first name like `<b>` cannot inject HTML), unsubscribe token sign/verify/tamper/wrong-label, header builder, audience resolver (dedupe, guardian fallback, doNotEmail, suppressed, cap), backoff, hash gating of Send. Mock-adapter int: full campaign through batches; an unsubscribe landing mid-send is skipped; a transient failure retries then succeeds; a permanent failure is final; two concurrent batch calls never double-send (claim); test send goes only to the admin's own address; editor and selector denied everywhere; env unset hides the module and every route 404s with no adapter call (assert zero calls); GET unsubscribe never writes; POST writes once; undo does not clear a bounce; forgot-password sends through the mock only when enabled, is throttled, and responds identically for an unknown address. Guard: no code path other than `sendCampaignMessage` and the transactional wrapper calls `adapter.send`.

### 9.8 Seed and acceptance

`seed:demo` seeds one draft campaign and a few suppressions only; it never sends. Acceptance with `EMAIL_PROVIDER=log` (local dev outbox, no network): compose, test, send to the seeded audience, inspect the outbox, click an unsubscribe link, resend and see the skip. With `EMAIL_PROVIDER` unset: the tile is absent and `/admin/office/email` is 404.

### 9.9 Risks

Provider choice, DNS (SPF, DKIM, DMARC) and consent are outside the code (section 14). Bounce and complaint feedback needs a provider webhook with a signing secret; until then bounces are only the immediate permanent failures the API returns, and the docs say so. Vercel function duration bounds each batch; the resumable loop and cron are the answer, not a long single request.

## 10. WP-7: stock and merch tracking (#30)

### 10.1 Data model (migration `d7_stock`)

- `stock-items` (staff): `name`, `group` (for example a shirt type), `size`, `category` `kit` | `equipment` | `canteen` | `other`, `unit`, `reorderLevel`, `location`, `returnable` checkbox (default true for kit and equipment), `active`, `notes`. One row per size so the ledger stays simple.
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

`/admin/office/stock`: item list grouped by category with on-hand and a Low chip when at or below reorder level (text plus icon), search, "Add stock received". Item page: movements with void. **Issue to a person** (item, quantity, person from the name projection, due back, note), **Return** and **Lost** from the person page `/admin/office/stock/people/[memberId]` (what this person holds, one tap to return, partial returns). **Owed** tab: all open returnable issues, oldest first, overdue flagged, one-line summary per person. **Stocktake**: type counted quantities, the screen shows the differences and posts adjustment movements. Notification lines for editors: "N items are low" and "N kit items are overdue back".

### 10.4 Tests

Unit: on-hand maths, issue status derivation, partial returns, void restores on-hand, stocktake delta, negative-stock refusal. Int: concurrent issue of the last unit (one wins); editor can issue but not export; matrix rows; member erasure leaves issue rows labelled "Former member".

### 10.5 Seed and acceptance

Kit (shirts in sizes, caps), equipment (helmets, bats, a ball machine), canteen items; several issues (some returned, two overdue), one low item. Acceptance: issue the last cap, see Low, return a helmet, see Owed shrink, run a stocktake, export the owed list as admin.

### 10.6 Risks

Only integer counts (no cost or sale tracking; merch sales and payments are deferred, there is no payment provider). Size variants as rows means long lists for big kit ranges; the group header keeps it readable.

## 11. Admin classification summary

| New thing | Where it lives | Role |
| --- | --- | --- |
| Club office landing | `everydayNav` (cap 16 to 17) | staff |
| Club office settings global | `advancedNav`, `hiddenFromEditors` | admin |
| Members, tiers, memberships, payments, waivers, email, suppressions, audit log | `officeCollections` (admin) | admin |
| Volunteers, meetings, seats, diary, plan, stock | `officeCollections` (staff) | staff (documents: office-bearer) |
| Office-bearer files | `officeCollections` | office-bearer |

`tests/admin-visibility.test.ts` gains: every office collection is classified, none is in a menu, `navFor('editor')` includes `office`, `navFor(null)` does not, the `everydayNav` cap is 17 and `jobTiles` stays 14, and every module in `lib/office/modules.ts` maps to a route and a feature doc. `payload/admin/helpContent.ts` gets one "Club office" section in plain English.

## 12. Cross-cutting tests and guards

- `tests/office-guards.test.ts` (unit, scans source): no `app/(frontend)` file or `lib/*-queries.ts` used by public pages imports an office collection or `lib/members-queries.ts`, except the allowlisted `volunteer/[token]` and `unsubscribe/[token]` routes; no `Boolean(user)` or `!req.user` as an access check in the new paths; every export route calls the audit writer and `isAdminUser`.
- Extend `tests/no-brand-hex.test.ts` (hex and club names), `tests/staff-guard.test.ts` and the existing selection/selector guards to `lib/office/**`, `lib/email/**`, `lib/members-queries.ts`, `lib/*-office-queries.ts`, `payload/components/Office*`, `payload/endpoints/office*`, `app/api/admin/office/**`, `app/api/cron/email-batch/**`, `app/(frontend)/volunteer/**`, `app/(frontend)/unsubscribe/**`; the path lists are edited in the same task that adds the folders.
- `tests/int/office-matrix.int.test.ts` (section 3.4) is the single source of truth for who can do what; each WP appends its collections.
- Accessibility: status never by colour alone, 44 px targets, visible focus, forms with labels and error text, tables degrade to cards under 640 px, live regions for save results; a checklist in each WP's task, with an axe-style assertion where the repo already has one (Appendix B).
- The sensitive-field-name scan and the public-leak render test (section 3.4) re-run as part of Verify.

## 13. Files, order and verification

Work packages split into tasks of roughly: (1) pure logic and tests, (2) collections, access, migration, generate, (3) queries and server actions, (4) views, (5) seed, doc, nav and guard updates, (6) targeted review. Commit per task with explicit paths. Final Verify step (once): `pnpm tsc --noEmit`, `pnpm lint`, full `pnpm test`, `pnpm test:int`, `pnpm check:generated`, `pnpm check:migrations`, one `pnpm build`, then a pass over each module's acceptance list on port 42xx with `PLAYHQ_CLIENT_ID=` empty and email unset, then again with `EMAIL_PROVIDER=log`.

## 14. Decisions and credentials needed from outside the code

Build to the seam; do not fake integrations. None of these blocks WP-0 to WP-5 or WP-7.

1. **Email provider and sending domain.** Resend (or SMTP), an account and API key in the Vercel env (Sensitive), a verified sender domain with SPF, DKIM and DMARC DNS records, and the from address. Until set, the module is hidden and password reset stays off.
2. **Consent and content.** The club decides its lawful basis for emailing members (express or inferred consent) and what it sends; the app provides identification, a working unsubscribe and suppression only. Someone should read current Spam Act guidance.
3. **Bounce and complaint webhooks.** Needs the provider's webhook signing secret; deferred.
4. **Who may see what.** Defaults: editors see names (not contact data) in the roster, stock and action owners; fees, members and email are admin-only. If the treasurer or secretary must work without being a site admin, the clean answer is a new `treasurer`/`office` role, not widening `editor`; decide before WP-2 goes live.
5. **Private file storage.** Office-bearer documents are access-controlled by the app, but the blob object is an unguessable public URL. A private blob store or a different bucket is a platform decision.
6. **Currency, locale and fee rules.** Set in office settings; whether fill-ins pay and whether juniors pay per match are club rules the defaults only guess.
7. **Payments.** Recording only. A payment provider, receipts and refunds are separate decisions and need their own security review (card data out of scope here).
8. **Stock "owed".** Confirmed reading: items people owe back. Items owed to members (pre-orders) would be a new model.
9. **Public committee page from seats.** Today a human edits both; deriving the public page from seats is a later change.
10. **Data import.** Real member lists arrive by CSV or manual entry; an importer needs its own duplicate rules and issue.

## Appendix A. Decisions worth challenging

1. New `members` collection beside `players` and `people` (link, not merge): avoids putting private fields on public collections.
2. Derived fee status instead of stored allocation: never drifts, costs a recompute per member (hundreds of rows, fine).
3. Personal volunteer links instead of the club-wide link plus PIN: stronger privacy, more links to distribute.
4. Plan actions are diary jobs with an objective: one overdue/blocked mechanism, one fewer collection.
5. Ledger writes only through server actions: slower to build than native forms, but invariants (no card data, append-only, audit) hold.
6. Send is gated on a test of the exact current content: one extra click that prevents most bad sends.
7. Counts-only votes: enough for minutes, avoids storing how individuals voted.

## Appendix B. Verify list (settle during implementation, in order)

1. Whether `admin.hidden` blocks the native list/edit route in this Payload version; pick un-hidden-but-unlisted, or custom views, accordingly.
2. `lib/stats/csv.ts`: is it formula-safe? If not, build `lib/office/csv.ts` and migrate it to share.
3. Which source gives upcoming home-game dates for volunteer weeks (`selection-fixtures` fields).
4. Whether `lib/social/queue-core.ts` claim/lease is generic enough to reuse for email, or copy its shape.
5. Whether anything besides `sponsor-thanks` relied on the `logos` initial fallback.
6. The exact density helper and target used for `cutRows`, and how the toss absence is best exposed to the chooser.
7. How `rest-login` throttle is wired in `Users` hooks, to add `rest-forgot`, and how selector (Facebook) accounts behave under forgot-password.
8. Blob plugin options for a collection with `disablePayloadAccessControl: false`, and local-storage behaviour in dev.
9. Existing accessibility test tooling.
10. Where `isSocialEligible`/`isJunior` read junior signals, to reuse for member juniors.

## Appendix C. Risks (summary)

Personal data exposure (mitigated by admin-only collections, explicit field access, public-leak and matrix tests, logged exports); ledger correctness (pure functions with property tests, append-only rows); email abuse or accidents (env gate, test-first, suppression at three points, caps, rate limit); migration size (seven small ones, each replayed by `check:migrations`); menu growth (one entry); scope (this is seven modules: each ships alone and the build order lets the wave stop after any WP).
