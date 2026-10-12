# Wave C: social graphics and the scheduled posting queue (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #21 (post designer, everything except the lineup graphic that announce-teams already shipped) and #23 (scheduled posting). Out of scope: live calls to any social network (adapters are stubs behind env, section 4.5), AI-written captions or match summaries (a later use of the existing AI gateway seam), auto-posting without a human approval, video or carousel posts, comment or analytics reading, any change to the selector area or to the public lineup route.

| WP | Issues | One line |
| --- | --- | --- |
| WP-1 Graphics | #21 | Twelve graphic types in three sizes and three named layout styles, all drawn from the club theme, previewed together in one admin page, downloadable. |
| WP-2 Queue | #23 | The same page gains Schedule: caption, hashtags, networks, time; a `social-posts` queue; a CRON_SECRET route that publishes due posts through pluggable adapters (mock in tests, stubs for Facebook, Instagram and X); status, retries, failure reasons and a download-and-copy fallback. |

Build order WP-1, WP-2. WP-1 ships alone (a committee member can already make and download a graphic). WP-2 adds one collection and fields on the same global.

Product goal (applies everywhere): this repository is reused for other clubs. Colours, crest, fonts, sponsor logos, names, copy, hosts and cookie names come from the `theme`/`club`/`social-settings` globals, the sponsors collection or env (`config/site.ts`), never from code. Tailwind `brand-*` tokens in UI, theme tokens in satori, no hex literals, no club name strings outside `config/site.ts` and seed defaults. A second club gets its own look by saving its theme and picking a style; no code change.

## 0. Findings that shape the design

Checked against this branch.

1. **#21 shipped one graphic.** The only social images are the lineup (`lib/selection/lineup-image.tsx`, 1200x630, routes `/teams/[gameId]/lineup-image` public and `/selector/teams/[gameId]/preview-image` selector-only) and the player stat card (`app/api/public/players/[slug]/card/route.tsx`, `og` and `square`). Both use `themedImageResponse()` from `lib/theme/og.tsx`, which resolves the theme, loads the bundled fonts (`lib/theme/fonts-server.ts`) and the crest (`loadCrest`, PNG/JPEG only, cached on the theme `version`). There is one layout, no story size, no admin composer, no sponsor strip, no result, fixtures, milestone, POTM, sponsor, event, leaders or season graphic. Both routes list `./assets/fonts/**` in `outputFileTracingIncludes`; every new route must too.
2. **No social posting code exists.** `club.socials` is a list of links shown on the site. `FACEBOOK_APP_ID/SECRET` serve selector sign-in only; they are not page-posting credentials and must not be reused for posting. There is no queue, no adapter and no cron except the daily `players-sync`.
3. **Cron today is one daily job** (`vercel.json`, `0 17 * * *`), guarded by `Authorization: Bearer $CRON_SECRET` compared with `!==`. A queue that posts "at 6:30 pm" needs a finer schedule; that is a Vercel plan decision (section 6).
4. **Per-game winners are private by design (Wave B).** Best-player ballots are never readable by code that renders public output, and per-game points are never public. So the player-of-the-match graphic cannot read the vote. A staff member picks the player (and optionally the stat line) by hand. The graphic reads only the visible-player stat data.
5. **Instagram and Facebook need a public image URL**, not an upload, at publish time. A queued post therefore needs a stable, unguessable, expiring image URL the network can fetch (section 4.4), and the image must be what was approved, so it renders from a stored snapshot, not from live data.
6. **The committee menu is full.** `everydayNav` is at its cap of 16 and `jobTiles` at 13 (`tests/admin-visibility.test.ts`). Section 3.6 adds one `advancedNav` entry visible to editors (the Selectors precedent) and swaps one Home tile; no cap changes.
7. **Satori limits.** Only PNG/JPEG images draw (`isDrawableImageType`), flex layout only, fonts must be bundled, text does not wrap predictably. Sponsor logos uploaded as WebP or SVG will not draw; they are skipped, never an error (section 3.4).
8. **GraphQL is disabled** (`graphQL: { disable: true }`). "REST + GraphQL" below means REST and the Local API. Public pages read through `lib/*-queries.ts`, which state their own visibility filter because the Local API ignores access rules.

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit `git add` paths, never `git add -A`, never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`: `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); verify hosts are `127.0.0.1` before any DB work; no Blob token; no remote DB; no Vercel CLI. Anything that could reach PlayHQ runs with `PLAYHQ_CLIENT_ID=` empty. **This wave makes no external call.** Facebook, Instagram, X, the AI gateway and email are mocked in tests and gated by env; with the env unset the feature shows "not connected" and never tries. Dev server ports 4100-4199.

**Migrations.** `wp_1_social_settings` (WP-1) and `wp_2_social_posts` (WP-2), each from `pnpm payload migrate:create <name>`, schema-qualified (`"payload"."..."`), `.ts` and `.json` committed. After each: `pnpm generate`, `git add payload-types.ts "app/(payload)/admin/importMap.js"`, then `pnpm check:migrations` and `pnpm check:generated` pass. Dev DB reset: `DROP SCHEMA payload CASCADE` via node + pg, then `pnpm payload migrate`. Function defaults for club-specific values (hashtags, captions) so the migration SQL stays club-neutral, as `Theme` does.

**Staff means staff.** `isStaff` is admin or editor; selectors are a separate role and get nothing here. New code never writes `Boolean(user)` or `!req.user` as an access check; `tests/staff-guard.test.ts` scope is extended to the new paths.

**Guards extended to new paths.** `tests/no-brand-hex.test.ts` (hex and club name), `tests/staff-guard.test.ts` and the selection/selector guards scan `lib/social/**`, `lib/social-queries.ts`, `components/social/**`, `app/api/social/**`, `app/api/admin/social/**`, `app/api/cron/social-posts/**`, `payload/components/Social*`, `payload/endpoints/social*`. The path lists are edited in the same task that adds the folders.

**Personal data.** Graphics show only what the public site already shows: visible players (hidden players are excluded by the visible-only stat data), public events, public sponsors. Queue rows are staff-readable only. Field-level access is explicit on every server-owned field. No CSV export is added in this wave (the queue is small; if added later it is admin-only and shares `needsGuard` from `lib/stats/csv.ts`).

**Server actions and endpoints are public POSTs.** Each one re-derives the caller (`getPayload().auth({ headers })`, then `isStaffUser`), validates input with a pure function, and derives `createdBy`, `approvedBy` and every status from the session and the server, never from form fields.

**Mobile first and accessible.** The composer is used on a phone after a game: 360 px first, 44 px tap targets, previews stack in one column, no hover-only controls, status never colour-only (text label plus icon), visible focus, `prefers-reduced-motion` respected, every preview `<img>` has alt text naming the graphic and size, copy-to-clipboard announces success through a polite live region.

**Docs.** New: `docs/features/social-graphics.mdx` (WP-1), `docs/features/social-posting-queue.mdx` (WP-2). Updated: `docs/features/index.mdx`, `theme-editor.mdx` (styles use the theme), `team-selection-and-announce.mdx` (the lineup is also a composer type), `admin-notifications.mdx` (new Home lines), `committee-admin.mdx` (new entry), `.env.example`. Link deferred items to #21/#23 and tracking #38. When both WPs land, tick #21 in the #38 body is left to the human (issues are read-only for this run).

**Efficiency.** Iterate with `tsc --noEmit`, `pnpm generate`, single vitest files, eslint on changed files. Full vitest once and one `next build` in the final verify step; never two vitest runs at once.

## 2. Shared building blocks (reused, not rebuilt)

| Need | Reuse | New |
| --- | --- | --- |
| Colours, font, crest | `getTheme()`, `resolveTheme`, `themedImageResponse()` (`lib/theme/og.tsx`), `loadThemeFonts`, `loadCrest` | `loadImageDataUri(url, version)` generalising the crest loader for sponsor logos (same PNG/JPEG rule, 2 s timeout, per-process cache) |
| Contrast maths | `contrastRatio`, `relativeLuminance` (`lib/theme/contrast.ts`) | `readableOn(bg, theme)` picks the best of white, black constant, `theme.colors.black`, `theme.colors.charcoal` (section 3.2) |
| Match data | `lib/match-store/queries.ts` (`getMatchByGameId`, `StoredMatch`), `lib/matches-queries.ts` (`loadGamesForSeasonName`), PlayHQ `Game`/`Scorecard` types | thin `lib/social/sources/*.ts` loaders that return plain serialisable data |
| Leaders and milestones | `lib/stats/leaderboard.ts` (`buildLeaderboard`, `filterRows`), `lib/stats/milestone-board.ts` (`milestoneBoard`), `lib/stats/milestones.ts` (`describeAchieved`) | none |
| Season wrap | `lib/yearbooks-queries.ts` (published yearbooks), `lib/stats/match/yearbook.ts` | none |
| Events, sponsors | `lib/events-queries.ts`, `lib/sponsors.ts` (`TIER_ORDER`), the `sponsors` collection logo | none |
| Lineup | `getPublishedTeam` (`lib/teams-queries.ts`), `lineup-text.ts` formatters | lineup joins the composer for square and story; the existing 1200x630 `renderLineup` and its two routes stay untouched |
| Dates | `lib/selection/club-date.ts`, `formatMatchDay`, `CLUB_TIMEZONE`, `CLUB_LOCALE` | `zonedToUtc` for the schedule picker (pure, tested across a DST change) |
| Staff auth, throttle | `isStaffUser`, `lib/throttle.ts` (`hit`) | a staff rate limit on preview renders (section 3.7) |
| Secrets | `deriveKey`, `HKDF_LABELS` (`lib/secrets.ts`) | new label `socialImage` |
| Notification centre | `notificationLines` (`lib/admin/notifications.ts`) | `social` input and two lines (section 4.8) |
| Admin custom view | `payload.config.ts` `admin.components.views` (`approvals`, `selectors`) | one view `social` at `/social` |

## 3. WP-1: graphics in three sizes and three layout styles (#21)

### 3.1 Types, sizes, styles

Graphic types (key, label, source):

| Key | Label | Source and chooser |
| --- | --- | --- |
| `result` | Final score | one stored match (`getMatchByGameId`); chooser lists recent finished games, newest first |
| `round-results` | Weekend results | all finished games on one round and date (`loadGamesForSeasonName`); chooser by round |
| `fixtures` | Weekend preview | upcoming games for a round or date range (`upcomingFixtures`, `selection-fixtures`) |
| `lineup` | Team announcement | a published team (`getPublishedTeam`) |
| `toss` | Toss | `Scorecard.toss` text plus teams and venue; shown only when the scorecard has a toss |
| `scorecard` | Top performers | top batters and bowlers of a stored match (visible players only) |
| `potm` | Player of the match | staff picks a visible player and a game; headline stat line auto-filled from that player's batting/bowling in that game, editable text |
| `milestone` | Milestone | a player and a milestone from `milestoneBoard().achievedNow`, or an "approaching" one |
| `stats-leaders` | Season leaders | top 3 or 5 for one metric, season and grade category (`buildLeaderboard`) |
| `event-promo` | Event promo | one published event (`listUpcomingItems`): title, date, time, place, cover |
| `sponsor-thanks` | Sponsor thank-you | one or more public sponsors; logo, name, tier, thank-you line from the caption template |
| `season-wrap` | Season wrap | a published yearbook: record, top run scorer, top wicket taker, champion if any |

Sizes (`SIZES`): `square` 1080x1080, `story` 1080x1920 (portrait 9:16, for Instagram/Facebook stories and reels covers), `landscape` 1200x630 (link preview, X, Facebook post). A fourth feed size 1080x1350 is not added; Instagram accepts square.

Styles (`STYLES`): `bold`, `classic`, `minimal`.

- **bold**: primary-colour surface (`black` token), white text, accent bar, display type at maximum size; reads at thumbnail size.
- **classic**: surface-colour card (`cream` token) with a primary band carrying the crest, thin accent rules, centred type; the closest to a printed scoreboard.
- **minimal**: plain white surface, small crest top-left, lots of space, accent underline, body type heavier than display.

Structure: a graphic is `Spec<D>` = `{ type, label, parse(params) -> Params, load(params) -> D, layout(D, style, size) -> Block[] }`. The renderer lays the blocks out with shared primitives (`Frame`, `Masthead` with crest and club name, `Headline`, `Kicker`, `BigNumber`, `StatRow`, `PlayerList`, `FooterStrip` with sponsor logos and site host). Each style is a `StyleKit` of token choices plus three structural switches (frame, masthead placement, headline casing). Type x style x size is therefore composed from primitives, not 12 x 3 x 3 hand-written layouts. The density rules live in the primitives: story gets larger type and more rows, landscape gets fewer rows and a single-column list, and any list longer than the size fits is cut at a measured row count with "+ N more", never clipped mid-row.

### 3.2 Theme-driven, contrast-checked colours

- `styleTokens(theme, style)` (pure, `lib/social/style.ts`) returns `{ surface, surfaceAlt, text, textMuted, accent, accentText, onAccent, rule }`, each a value from `theme.colors` or the neutral constants `WHITE`/`WHITE_75` in `lib/theme/og.tsx` (a neutral `BLACK` constant is added there; the brand-hex guard already allows that file).
- **Text colour is never picked by hand.** `readableOn(bg, theme)` returns the candidate (white, black constant, `colors.black`, `colors.charcoal`) with the highest contrast against `bg`. The best of white and black is at least 4.58:1 against any colour, so body text always reaches 4.5:1 whatever palette a club saves. `accentText(bg, theme)` tries `gold-light`, `gold`, `gold-deep`, `gold-dark` for 4.5:1 and falls back to `readableOn`. Large display text (24 px and above) uses the same function; the 3:1 allowance is not relied on.
- Decorative accent shapes (bars, rules) are not text and are not contrast-gated, but the accent bar is never the only carrier of meaning.
- Tests (unit, no DB): for the seed theme and ten generated palettes (dark, light, mid-grey, all-same, near-white, saturated), every `styleTokens` text/background pair in every style is at least 4.5:1; changing the palette changes the tokens (a different club looks different); no function in `lib/social/**` contains a `#` colour literal (the guard).
- The `theme` global is unchanged; its existing save-time contrast checks keep protecting the site. Social contrast is guaranteed independently at render time, so a theme that is fine for the website cannot produce an unreadable graphic.

### 3.3 Settings: `social-settings` global (migration `wp_1_social_settings`)

New global, admin only (`access: { read: isAdmin, update: isAdmin }`, `hiddenFromEditors`), plain labels:

- `defaultStyle`: select bold/classic/minimal (default `bold`; a seed default may differ per club).
- `typeStyles`: group with one select per graphic type: `default` (use the club style) or a style. This is the "per-graphic override" at club level; the composer adds the per-post override (section 3.5). Resolution order: post, then type, then club default (`resolveStyle`, pure, tested).
- `sponsorStrip`: `{ show: checkbox default true, tiers: select-many of TIER_ORDER default Platinum and Gold, max: number 3-8 default 5 }`.
- `showSiteHost`: checkbox, shows the site host in the footer.
- `attribution`: optional short text line under the footer (empty by default).

A public read would be harmless but is not needed, so it stays admin-only. No REST read for editors: the composer reads it server-side through `lib/social-queries.ts` (`getSocialSettings`, Local API with an explicit select). The editors still choose style per post.

Admin classification: `advancedNav` entry `{ key: 'social-settings', label: 'Social graphics settings', path: '/globals/social-settings' }`, `admin.group: false`, `admin.hidden: hiddenFromEditors`.

### 3.4 Sponsor strip

`sponsorsForStrip(settings)` reads `sponsors` (public read already; the query states its own filter: tiers in settings, has a logo, order by `TIER_ORDER` then `sortOrder`), takes up to `max`, and loads each logo with `loadImageDataUri`. A logo that is not PNG/JPEG, times out or fails is skipped and logged as a one-line warning; if none draw, the strip is omitted and the composer shows a hint ("Sponsor logos need to be PNG or JPG to appear on pictures"). The `sponsor-thanks` type draws the chosen sponsor large and reuses the same loader. Cache key includes the sponsor `updatedAt`.

### 3.5 Admin composer: one entry, three steps

A custom admin view `social` (`/admin/social`, `payload/components/SocialView`), reached from one `advancedNav` entry with `forEditors: true` (label "Social posts", the Selectors precedent) and one Home tile (section 3.6). Three steps on one page, stacked on a phone:

1. **Pick a graphic.** A grid of plain-English tiles (the labels in 3.1). Choosing one shows a short source chooser built from the loader (for example the last ten finished games: "B Grade v Opponent, Sat 11 Oct, won by 24 runs"). Types with nothing to show say so ("No finished games yet").
2. **Preview all sizes.** Three images (square, story, landscape) from the preview route, a style switcher (Bold, Classic, Minimal, with the club default marked), and the editable text fields the type needs (POTM stat line, sponsor thank-you line, custom headline where offered). Changing anything re-requests the three previews with a short debounce and shows a skeleton, not a blank.
3. **Use it.** Download buttons per size (PNG) in WP-1; in WP-2 this step adds Schedule and Save as draft. The caption is shown in WP-1 too (template filled from the data, editable, "Copy caption") so the "download + copy" path works before the queue exists.

State lives in the URL (`?type=&source=&style=`) so a refresh or a shared link keeps the choice. The view is server-rendered for step 1 and a small client component handles steps 2 and 3. It is reused for editing a draft in WP-2.

### 3.6 Menu and admin classification

- `advancedNav`: `{ key: 'social', label: 'Social posts', path: '/social', forEditors: true }` and `{ key: 'social-settings', label: 'Social graphics settings', path: '/globals/social-settings' }` (admin only).
- `jobTiles`: add `{ key: 'social', title: 'Make a social post', hint: 'Results, line-ups, milestones and more', path: '/social' }` and **remove the `apparel` tile** (a rarely repeated job, still reachable in the menu). The tile cap stays 13, `everydayNav` stays 16.
- `tests/admin-visibility.test.ts`: add `social-settings` to the classified globals; the new view key is asserted in `navFor('editor')` and absent for `navFor(null)`.
- `help` content (`payload/admin/helpContent.ts`) gets one section "Make a social post", written in the same plain style.

### 3.7 Routes and access

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /api/admin/social/graphic?type&size&style&source&...` | staff only | Renders the PNG from live visible data. Signed-out, selector and unknown input all return the same plain 404 with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex` (the selector preview route is the model). `download=1` adds `Content-Disposition` with a filename `<EXPORT_FILENAME_PREFIX>-<type>-<size>-<date>.png` (slugged; no user text). Per-staff rate limit through `lib/throttle.ts` (60 renders per 10 minutes, a high cap that only stops a runaway loop). |
| `GET /api/admin/social/sources?type=` | staff only | JSON for the chooser (ids and labels only, no stats). |
| `/admin/social` | staff (Payload admin login) | the composer. |
| `/teams/[gameId]/lineup-image`, `/selector/.../preview-image` | unchanged | still 1200x630 only; the composer's lineup square and story use the new renderer. |

Input is parsed by a pure `parseParams(type, searchParams)` per spec: unknown type/size/style fall back to a 404 (not a default), ids must match `^[0-9a-z-]{1,64}$` or be numeric, free text is trimmed to 80 chars and has control characters removed. Nothing user-entered is inserted as markup (satori takes text nodes only).

There are no public graphic routes in WP-1. Sharing a graphic publicly happens by downloading it, or (WP-2) through the signed URL a network fetches.

### 3.8 Tests

Unit (no DB):

- `social-style.test.ts`: tokens and contrast across palettes (3.2), `resolveStyle` precedence.
- `social-specs.test.ts`: for each type, `parseParams` rejects bad input, `layout` returns blocks for fixture data in all three sizes and styles (36 combinations without rendering), list cut-off adds "+ N more", empty data produces the type's empty message rather than throwing.
- `social-render.test.ts`: with fixture data, `ImageResponse` renders every type x size x style (108 renders) to a PNG with the right dimensions (read the IHDR bytes), under a time budget. Run as one file; skipped combinations are listed, not silently dropped.
- `social-caption.test.ts`: placeholders (section 4.3).
- `no-brand-hex.test.ts` / club-name guard: new paths added; a test asserts `lib/social/**` imports colours only from the theme or the neutral constants.

Integration (local Postgres, `tests/int/social-graphics.int.test.ts`):

- Seed fixtures: one finished match with batting/bowling rows, a published team, an event, three sponsors (one with a WebP logo), a yearbook. For each type, the staff route returns a PNG; a hidden player never appears (assert the text nodes through `layout` data, not pixels); a draft or unpublished event 404s.
- Access: anonymous, selector, and a disabled admin get the same 404 body and headers as an unknown id; an editor gets 200; the sources route leaks no stat values.
- `social-settings` REST: anonymous 403, editor 403, admin 200; a bad style value is rejected by the select.

### 3.9 Seed (`seed:demo`)

Extend `payload/scripts/seed-demo.ts`: default `social-settings` (club style set explicitly for the demo), 4 sponsors with PNG logos generated from a tiny in-code PNG (no network) across tiers, one event with a cover, and enough finished matches for results, leaders and milestones (the demo already seeds matches; add one with a toss and a POTM-worthy performance). Idempotent (find-or-create).

### 3.10 Acceptance (local, no external calls)

1. `pnpm payload migrate` on a fresh `langlang_dev`; `pnpm seed:demo`; start the dev server on a 41xx port.
2. Sign in as an editor, open Social posts, make each of the 12 types from seeded data; all three sizes render; switching style changes the look; Download gives a PNG at the stated size.
3. Change the theme palette and crest in the admin (as admin), regenerate the preview: colours and crest follow; text stays readable (the unit contrast test is the formal gate).
4. Sign out: the graphic route and the admin view are 404/login; sign in as a selector: 404.
5. Disable the sponsor logos: the strip disappears without an error.

### 3.11 Risks

- **Render time and memory.** 3 previews per change on a serverless function. Mitigation: previews are requested lazily (visible ones first), no-store but each render is fast (no network except sponsor logos, cached); `maxDuration` 30 on the route.
- **Satori text overflow** for long names. Mitigation: truncation by character budget per block (the lineup uses `LINEUP_NAME_MAX`), `+ N more`, and the render test with deliberately long names.
- **108 render tests could be slow.** One file, run once in the final verify; the per-commit loop renders a subset (each type once).
- **Fonts.** Only the theme's bundled display font and the body font are available; a club picking a font that is missing from `assets/fonts` already falls back (W1). No new font files in this wave.

## 4. WP-2: composer scheduling and the posting queue (#23)

### 4.1 Overview

Step 3 of the composer gains: caption (template filled, editable), hashtags (from settings, removable), networks (only those that are configured), size per network (sensible default), "post at" (club time zone), and two buttons: **Save as draft** and **Schedule**. Scheduling is the human approval: only a staff member can move a post to `scheduled`, and the row records who and when. There is no automatic scheduling in this wave ("suggested posts" below are a list, never a write). A queue list sits below the composer: Needs attention, Scheduled, Published.

### 4.2 Settings added to `social-settings` (migration `wp_2_social_posts`)

- `hashtags`: array of text (`{ tag }`, stored without `#`, validated `^[A-Za-z0-9_]{1,40}$`), default from the club defaults seed (a club writes its own). Max 30.
- `hashtagsPerNetwork`: group with `facebook`, `instagram`, `x` number fields: how many of the hashtags to append (defaults 3, 15, 2) because an X post wants two, Instagram many.
- `captionTemplates`: group with one textarea per graphic type (generic English defaults in code, club voice in the seed defaults), max 600 characters each.
- `signOff`: optional line appended to every caption.
- `networks`: array rows `{ network, enabled }` for facebook/instagram/x. Enabled has no effect unless the network's env is configured (4.5); the composer shows only networks that are both enabled and configured.
- `publishWindow`: `{ earliest: 'HH:MM', latest: 'HH:MM' }` quiet hours in club time (default 07:00-21:00). A schedule outside the window is allowed only with an explicit "Post outside quiet hours" tick.

### 4.3 Captions

`lib/social/caption.ts` (pure): `fillTemplate(template, vars)` replaces `{name}` placeholders from a per-type whitelist, for example `result`: `{club} {opponent} {grade} {round} {score} {margin} {venue} {date} {link}`. Unknown placeholders are left in place and returned in `unknown[]` so the UI can warn; missing values drop their whole line rather than leaving "v undefined". Values are inserted as plain text (no template execution, no markdown). `{club}` is `club.shortName || club.name`; `{link}` is `club.siteUrl` plus the public path (match, event, yearbook), nothing else.

`composeCaption({ body, signOff, hashtags, network })` appends the sign-off and the first N hashtags (the network's count), and `validateCaption(network, text)` returns errors/warnings from the adapter limits: X 280 characters with each URL counted as 23, Instagram 2,200 characters and 30 hashtags, Facebook 63,206. An error blocks Schedule for that network; a warning does not. Hashtag text is whitelisted so it cannot carry mentions or links.

### 4.4 Data model: collection `social-posts`

One row per post. `timestamps: true`.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | text | derived at save (type + subject), for lists |
| `status` | select | `draft`, `scheduled`, `publishing`, `published`, `failed` |
| `spec` | json | `{ type, style, params, snapshot, playerIds[], sponsorIds[], eventId?, gameId? }`: the data the graphic is drawn from, frozen at save |
| `caption` | textarea | the base caption (sign-off and hashtags are added per network at publish) |
| `hashtags` | array of text | the post's chosen tags |
| `scheduledFor` | date | UTC; null for drafts |
| `nextRunAt` | date | when the claim may pick the post: `scheduledFor`, then the earliest pending target `nextAttemptAt` after a retryable failure; indexed |
| `approvedBy` | relationship users | set by the schedule action |
| `approvedAt` | date | |
| `createdBy` | relationship users | |
| `targets` | array | one row per network: `network` select, `size` select, `status` select (`pending`, `publishing`, `published`, `failed`, `unknown`), `attempts` number, `nextAttemptAt` date, `lastError` text (max 300), `remoteId` text, `remoteUrl` text, `publishedAt` date, `manual` checkbox |
| `claimToken` | text | lease owner |
| `claimedAt` | date | lease start |
| `revision` | number | increments on every edit; part of the signed image URL |

Indexes: `(status, nextRunAt)` for the claim, `(createdBy)`. `publishedIds per network` is `targets[].remoteId`.

Why a frozen `snapshot`: the post publishes exactly the approved picture, and a match edited after scheduling cannot change it silently. The signed image route (4.7) renders from `spec`, never from live data.

**Access** (collection-level `access`, REST and Local API; GraphQL disabled):

| Operation | public | selector | editor | admin |
| --- | --- | --- | --- | --- |
| read | no | no | yes (REST and admin) | yes |
| create / update / delete over REST | no | no | no | no |
| create / edit / schedule / cancel / retry / mark posted | no | no | server action, `isStaffUser` | same |

Field-level: `claimToken` and `claimedAt` have `read: nobodyField`, `update: nobodyField`; `status`, `targets`, `nextRunAt`, `revision`, `approvedBy`, `approvedAt` have `update: nobodyField` (written only by code with `overrideAccess`). All writes go through `lib/social-queries.ts` actions that re-check staff. `admin.hidden: true`, direct admin URLs are blocked by `create/update: nobody`, and read stays staff so the committee never sees a raw row because there is no menu entry.

Admin classification: a new list `socialCollections: ['social-posts']` in `payload/admin/navigation.ts` (hidden for every role, absent from both menus, enforced both ways by `tests/admin-visibility.test.ts`; the committee reaches it only through the Social posts view).

**Status rules (pure, `lib/social/status.ts`, unit-tested exhaustively):**

- `draft -> scheduled` (needs at least one target, valid captions, `scheduledFor` in the future, all targets configured).
- `scheduled -> draft` (cancel: staff "Unschedule"; allowed only while `scheduled`).
- `scheduled -> publishing` (claim, only by the cron or "Publish now").
- `publishing -> published` when every target is `published`; `-> failed` when no target is left that can still be retried and at least one failed or is `unknown`; `-> scheduled` (with `nextAttemptAt`) when some target failed retryably and attempts remain.
- `failed -> scheduled` ("Retry now": resets attempts for failed targets, never for `published` ones; `unknown` targets must be confirmed by hand first).
- `published` is terminal. Editing a post in `publishing`, `published` is refused; editing a `scheduled` post moves it back to `draft` and bumps `revision` (so an old signed URL stops working).

### 4.5 Network adapters

```ts
// lib/social/adapters/types.ts
type PublishInput = { postId: number; network: Network; caption: string; imageUrl: string; idempotencyKey: string }
type PublishResult =
  | { ok: true; remoteId: string; remoteUrl?: string }
  | { ok: false; retryable: boolean; reason: string; code?: string }
interface NetworkAdapter {
  id: Network                         // 'facebook' | 'instagram' | 'x'
  label: string
  sizes: readonly SizeKey[]           // sizes it accepts, default first
  limits: { maxChars: number; maxHashtags: number }
  isConfigured(env: NodeJS.ProcessEnv): boolean
  publish(input: PublishInput, signal: AbortSignal): Promise<PublishResult>
}
```

- `lib/social/adapters/index.ts`: `getAdapter(network, env)` returns an adapter only when `isConfigured(env)`; `configuredNetworks(env)` is what the composer lists.
- **Facebook Page, Instagram, X adapters are stubs in this wave.** Each declares its env contract and limits and its `isConfigured`, and `publish` returns `{ ok: false, retryable: false, reason: 'Live publishing for this network is not switched on in this build', code: 'not_implemented' }`. They make no HTTP call and import no network SDK. They are real placeholders, not simulated successes, so a configured production environment cannot report a post as published that was never posted. The live HTTP calls are a follow-up that needs the credentials and the decisions in section 6; the interface is the seam.
- **Mock adapter** (`lib/social/adapters/mock.ts`): configurable outcome (success, retryable failure, permanent failure, slow, throws, success-but-unknown) and records calls in memory; used by every test and, for demos, enabled only when `SOCIAL_MOCK_NETWORK=yes` and not `VERCEL_ENV=production` (it shows in the composer as "Test network" and never reaches a real service). `instrumentation.ts` refuses to start with the mock enabled in production.
- Env (documented in `.env.example`, all empty by default, none read in the browser): `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`; `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN`; `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`; `SOCIAL_MOCK_NETWORK`; `SOCIAL_MAX_ATTEMPTS` (empty = 3); `SOCIAL_BACKOFF_MINUTES` (empty = `5,15,45`); `SOCIAL_LEASE_MINUTES` (empty = 10). The page-posting Facebook credentials are deliberately separate from the selector sign-in app. Secrets are never stored in the database, never shown in the admin, and never logged; error strings returned by an adapter are scrubbed of any configured secret value before they are stored (`scrubSecrets`, unit-tested).
- Capability is shown honestly: the composer lists a network only if configured, otherwise a line "Facebook is not connected. Download the picture and post it by hand." with a link to the docs.

### 4.6 Publisher: claim, publish, backoff

`lib/social/publisher.ts`, called by the cron route and by "Publish now".

1. **Claim (idempotent, safe under concurrent runs).** One atomic statement through the drizzle client (the `throttle.ts` precedent), never read-then-write:

   ```sql
   UPDATE "payload"."social_posts" SET status='publishing', claim_token=$token, claimed_at=now()
   WHERE id IN (
     SELECT id FROM "payload"."social_posts"
     WHERE (status='scheduled' AND next_run_at <= now())
        OR (status='publishing' AND claimed_at < now() - $lease)   -- lease recovery, see the rule below
     ORDER BY next_run_at LIMIT $batch FOR UPDATE SKIP LOCKED)
   RETURNING id
   ```

   Two overlapping cron runs cannot claim the same row. `$batch` is 5 so one run fits its time limit. A `publishing` row whose `claimed_at` is older than the lease (10 minutes) is recovered by the same statement's second branch, with the rule below.
2. **Per target, at most once.** Before a network call the publisher writes that target `publishing` and `attempts + 1` and commits. Only then does it call the adapter. If a run dies in between, the recovered post has a target still `publishing`: the outcome is unknown, so the target becomes `unknown` with the reason "The run stopped while posting; check the page before retrying", is never auto-retried, and the post is `failed` until a person resolves it (Mark posted or Retry). This trades a stuck post for never posting twice to the page.
3. **Re-validate before sending.** Before calling an adapter: the post is still `publishing` with our token; every `spec.playerIds` player is still visible, every event still published, every sponsor still public; the signed image URL for that size renders (HEAD against our own route is skipped, the renderer is called in-process once to fail early). A failed check marks the target `failed`, non-retryable, with the plain reason.
4. **Outcome.** `ok` stores `remoteId`, `remoteUrl`, `publishedAt`. `retryable` failure: next attempt at `now + backoff[attempts-1]` (5, 15, 45 minutes, deterministic, capped, no jitter so tests are exact); after `SOCIAL_MAX_ATTEMPTS` it becomes `failed`. Permanent failure: `failed` immediately. `lastError` is scrubbed and cut at 300 characters; the full text is only in the server log, also scrubbed.
5. **Finish.** The post status is derived from its targets by the pure function in 4.4, and the claim fields are cleared in the same update that sets the final status (`WHERE claim_token = $token`, so a stale worker cannot overwrite a newer one).
6. **Time budget.** The loop stops starting new posts at 240 seconds of the route's 300 second `maxDuration`; leftover due posts wait for the next run. Each adapter call has a 20 second `AbortSignal` timeout.

### 4.7 Cron route and signed image URL

- `GET /api/cron/social-posts` (`dynamic = 'force-dynamic'`, `maxDuration = 300`): requires `Authorization: Bearer $CRON_SECRET`, compared with `timingSafeEqual`; an unset `CRON_SECRET` is a 401, never "open" (same as `players-sync`). It does nothing and returns `{ configured: [], claimed: 0 }` when no network is configured and the mock is off, so a fresh club pays nothing. `vercel.json` gets a second cron entry; its schedule depends on the plan (section 6). The response lists post ids and statuses only, no captions or errors.
- `GET /api/social/image/[postId]/[size]?exp=&sig=`: public but unguessable. `sig = HMAC-SHA256(deriveKey(socialImage), "${postId}.${size}.${revision}.${exp}")`, `exp` at most 24 hours ahead, compared with `timingSafeEqual`. It serves the PNG only while the post is `scheduled` or `publishing`, from `spec`, with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. Bad signature, expired, wrong status, unknown id, bad size all return the same plain 404. The publisher mints the URL (`lib/social/image-url.ts`), the base is `club.siteUrl` (never a request header).
- "Publish now" (queue row action) calls the same `publishDue({ onlyId })` with the staff session; it does not go through the cron route.

### 4.8 Failure handling and the fallback

- Queue rows show a status chip (icon plus word), per-network lines ("Facebook: posted", "X: failed, will retry at 6:45 pm (attempt 2 of 3)", "Instagram: failed: the picture could not be fetched"), `lastError` in plain English from a reason map (`not_implemented`, `rate_limited`, `auth`, `media_rejected`, `network`, `unknown_outcome`, `content_changed`), and the next action.
- **Retry** (failed targets only), **Unschedule** (back to draft), **Edit**, **Delete** (drafts and published rows; scheduled rows must be unscheduled first), **Mark as posted** (per target; sets `manual: true`, `remoteId: 'manual'`, optional pasted link), and **Download + copy caption**: per size download buttons and a "Copy caption" button that copies the exact text the adapter would send (network caption plus hashtags). This fallback is always shown for a failed or unconfigured target, so a missing connection never blocks the club.
- Notification centre: `notificationLines` gets `social: { failed: number; dueSoon: number }` (counts only, from one grouped query) and two lines: "N social posts need your attention" (warn, links to `/social?tab=attention`) and "N posts are scheduled for today" (info). They respect the existing admin Home pattern and are staff-only. No new Home strip.
- Suggested posts (computed, never stored): the composer lists "Results without a post": finished games in the last 3 days with no `social-posts` row whose `spec.gameId` matches. One click opens the composer with that game selected.

### 4.9 UI routes summary

| Route | Audience | Notes |
| --- | --- | --- |
| `/admin/social` | staff | composer plus queue (tabs: Needs attention, Scheduled, Published, Drafts) |
| `/admin/social?post=<id>` | staff | edit a draft or scheduled post |
| `POST` server actions in `lib/social-actions.ts`: `saveDraft`, `schedule`, `unschedule`, `retry`, `markPosted`, `deletePost`, `publishNow` | staff | each re-derives the caller, validates with a pure function, never trusts form fields for status or user |
| `/api/cron/social-posts` | CRON_SECRET | publisher |
| `/api/social/image/[postId]/[size]` | signed URL | network fetch |
| nothing in `/selector` or the public site | n/a | selectors do not post |

### 4.10 Tests

Unit:

- `social-status.test.ts`: every transition in 4.4, derived post status from every target combination, illegal transitions rejected.
- `social-caption.test.ts`: placeholders, missing values, unknown placeholders, per-network hashtag counts, X 280 counting URLs as 23, Instagram 30 tags, whitelist rejects `@`, `#`-prefixed and link text.
- `social-backoff.test.ts`: 5/15/45, cap, max attempts, env override parsing with bad values falling back.
- `social-image-url.test.ts`: signature round trip, tampered postId/size/revision/exp, expiry, `timingSafeEqual` used, same 404 for all failures.
- `social-adapters.test.ts`: the three stubs report `isConfigured` only with their full env, `publish` never calls `fetch` (spy on `globalThis.fetch`), `getAdapter` returns undefined when unset, the mock honours each scripted outcome, `scrubSecrets` removes every configured secret value including URL-encoded forms.
- `schedule-time.test.ts`: club-time to UTC across the DST change, quiet-hours window, past times rejected.
- `no-brand-hex` / staff-guard extensions as in section 1.

Integration (`tests/int/social-posts.int.test.ts`, `social-publisher.int.test.ts`, `social-cron-route.int.test.ts`):

- **Concurrency:** 5 due posts and 4 concurrent `publishDue` calls (Promise.all) with the mock adapter: each post is published exactly once (mock call count per post = 1), no `publishing` rows left, claims never overlap.
- **Lease recovery:** a row `publishing` with an old `claimed_at` and a target `publishing` becomes `unknown`/`failed` and the mock is not called; a row with all targets `pending` is re-claimed and published.
- **Backoff and retries:** mock fails retryably twice then succeeds, with a controllable clock: `nextAttemptAt` follows 5, 15; a third failure with max 3 gives `failed` with the scrubbed reason; "Retry" resets attempts for failed targets only and never re-sends a published target.
- **Per-network independence:** Facebook succeeds, X fails: the post stays retryable for X only, Facebook is not called again.
- **Re-validation:** hiding a player or unpublishing an event after scheduling makes the target fail with `content_changed`, no adapter call.
- **Approval:** an anonymous caller, a selector and a disabled admin cannot call any action (each returns the staff-only error and writes nothing); an editor can; `createdBy`/`approvedBy` come from the session even if the form sends other ids.
- **Access matrix:** REST `find`, `findByID`, `create`, `update`, `delete` on `social-posts` for anonymous, selector, editor, admin per the table in 4.4; `claimToken`, `claimedAt` never returned to anyone; REST `where` on `claimToken` returns no match (field access).
- **Cron route:** no secret, wrong secret, unset `CRON_SECRET` all 401 with no work done; correct secret with nothing due returns 200 and claims 0; with no configured network and no mock returns `configured: []` and does not touch rows.
- **Signed image route:** valid signature serves a PNG for a `scheduled` post, 404 once `published`, 404 after an edit bumps `revision`, 404 for a tampered or expired link.
- **No outbound calls:** a global `fetch` spy fails the test on any call to a non-local host throughout the int suite for these files.

### 4.11 Seed (`seed:demo`)

Add `social-posts`: one draft, two scheduled (one due in the past so a local `GET /api/cron/social-posts` with the bearer header publishes it through the mock), one published with manual remote ids, and one failed with a plain-English reason and a retryable target. Idempotent by a hidden `title` key. The seed enables the mock only in the demo `.env.local` documentation, not in code.

### 4.12 Acceptance (local, no external calls)

1. Migrate and `seed:demo`; set `SOCIAL_MOCK_NETWORK=yes` and `CRON_SECRET=local-test` in the shell (not in a committed file).
2. Open Social posts as an editor: the queue shows the seeded rows and the Test network is the only network offered (the real three show "not connected").
3. Compose a result, schedule it for 2 minutes ahead, run `curl -H "Authorization: Bearer local-test" localhost:41xx/api/cron/social-posts` after it is due: the row moves to Published with a mock remote id. Run the curl twice in parallel: still one mock post.
4. Make the mock fail (the seeded failing post): the row shows the reason and the next attempt time; Retry; Mark as posted; Download and Copy caption works with no network configured.
5. Unset the mock: the composer says "not connected" and the fallback is the only path; scheduling is disabled with a clear reason.

### 4.13 Risks

- **Double posting.** The biggest risk. Mitigations: `FOR UPDATE SKIP LOCKED` claim, per-target at-most-once with `unknown` state instead of blind retry, claim token on finish, concurrency int test.
- **Token leakage.** Adapter errors can echo request bodies or headers. Mitigation: `scrubSecrets`, 300-character cap, no secret in any DB field, no secret in the admin, `.env.local` stays local.
- **Signed URL as a public image.** It exposes one approved graphic for at most 24 hours to anyone holding the link, the same as posting it. It is revoked on edit and once published. The URL contains no personal data beyond the graphic.
- **Stub adapters are not a working product.** Documented in the feature doc under "Not included": until the live calls are built, the queue publishes to the Test network or to nothing, and the fallback covers real use. The cron route does nothing when nothing is configured.
- **Cron frequency.** A daily schedule would make "post at 6:30 pm" post up to 24 hours late. The UI states "posts go out within about 10 minutes of the time" only when a frequent schedule is present (`SOCIAL_CRON_MINUTES` env, documented); otherwise it says "posts go out on the next daily run" and the Schedule button warns. Decision in section 6.
- **Caption copy.** Default templates are generic; clubs edit them in settings. No club name is hard-coded.

## 5. Cross-cutting

### 5.1 Player merge and hidden players

`duplicate-players-and-undo` merges players. `social-posts.spec.playerIds` holds player ids: the merge plan (`lib/players/merge-core.ts`, `merge-*.ts`) must remap them for `scheduled` and `draft` posts, or the re-validation in 4.6 will fail the post with `content_changed` (acceptable and safe). Decision: remap in `merge-core` for non-terminal posts, test in `merge-undo.int.test.ts` style (one new case); published rows are history and are not rewritten.

### 5.2 Files and verification

New code lives in `lib/social/**`, `lib/social-queries.ts`, `lib/social-actions.ts`, `components/social/**`, `payload/globals/SocialSettings.ts`, `payload/collections/SocialPosts.ts`, `payload/components/SocialView.tsx`, `payload/endpoints/social.ts` (if an endpoint is needed instead of a server action), `app/api/admin/social/**`, `app/api/social/image/**`, `app/api/cron/social-posts/route.ts`. Also edited: `payload.config.ts` (global, collection, view), `payload/admin/navigation.ts`, `next.config.ts` (`outputFileTracingIncludes` for the two image routes), `vercel.json`, `.env.example`, `config/site.ts` (generic constants: sizes, queue defaults), `lib/theme/og.tsx` (`BLACK`, `loadImageDataUri`), `lib/admin/notifications.ts`, `payload/admin/copy.ts`, `payload/admin/helpContent.ts`, docs and tests.

Final verify (once, at the end of WP-2): `pnpm tsc --noEmit`, `pnpm lint`, full `pnpm test`, `pnpm test:int`, `pnpm check:generated`, `pnpm check:migrations`, one `pnpm build`, and a manual run of the acceptance lists.

## 6. Decisions and credentials needed from outside the code

Build to the seam; do not fake. None of these blocks WP-1 or the queue and fallback in WP-2.

1. **Cron frequency.** The queue needs a run at least every 10 minutes. Vercel Hobby allows only daily crons; Pro allows frequent ones. Alternatives: an external pinger hitting the route with the bearer secret. Decision for the club: upgrade, ping externally, or accept daily and rely on the download-and-copy fallback.
2. **Facebook Page.** A Meta app with a Page access token that can post photos (page publishing permissions need Meta app review for production use), the Page id. Separate from the selector sign-in app. The `FACEBOOK_PAGE_*` env contract is defined; the live call is not written.
3. **Instagram.** A professional (business or creator) account linked to the Page, and the Instagram content publishing permission; image must be a public URL (the signed URL). Story publishing needs the stories endpoint and is not assumed.
4. **X.** An X developer project; writing posts and uploading media need a paid API tier at the time of writing. The club decides whether to pay.
5. **Human approval.** Default is "scheduling is the approval". If the club wants a second person to approve, add an `awaiting approval` status and a `social_approver` setting later (section 4.4 does not preclude it).
6. **Where credentials live.** Vercel project env (Sensitive) only; never `.env.local`, never the database. Token expiry (Meta page tokens, X tokens) is the club's renewal job; the queue shows "auth" failures with that hint.
7. **Sponsor logo formats.** PNG/JPEG only draw. Whether to convert WebP uploads at upload time (media pipeline change) or just tell the committee is left to the club; this spec only warns.

## Appendix A. Decisions worth challenging

1. **One new global rather than extending `theme` or `club`.** The theme is public-read and "site look"; captions, hashtags and per-type overrides are not styling and should not be public. The cost is one more Advanced (admin-only) entry.
2. **Three styles composed from primitives rather than 36 layouts.** Gains consistency and theme safety; loses bespoke type-specific art. A fourth style is one `StyleKit`.
3. **POTM is staff-picked.** Reading the vote winner would break Wave B's privacy rule; the cost is one extra click.
4. **Snapshot at schedule time.** Safe and exact, but a post about a game that gets corrected later stays as approved until edited. The hidden-player and unpublished-event checks cover the harmful cases.
5. **Stubs, not simulated adapters.** A mock that reports "published" in production would be worse than nothing, so the real three refuse until the live calls exist.
6. **`unknown` instead of auto-retry after a crash.** Occasional manual work in exchange for never double posting.
7. **Composer in the admin, not the selector area.** Selectors pick teams; posting to the club's public voice is committee work and needs staff-only access.

## Appendix B. Verify list (settle during implementation, in order)

1. What a stored match gives for margin and result text (`StoredMatch.match`, `Game.club.outcome`, scores) and whether a ready-made "won by N runs" string exists or must be derived (pure function with tests).
2. Whether `ImageResponse` in this Next version supports the 1080x1920 size within the function memory limit when sponsor logos are loaded; measure on the render test.
3. How `payload.config.ts` registers a custom view and global together with `importMap` (the `approvals` view is the model) and that `pnpm generate` captures it.
4. Whether Payload's drizzle adapter exposes the table name `social_posts` and array table `social_posts_targets` as expected for the raw claim SQL (check the generated migration `.json`), and that `FOR UPDATE SKIP LOCKED` works on the local Postgres version.
5. Whether `merge-core` already has a hook for remapping player ids in JSON `spec` (it remaps relationships; JSON needs an explicit step).
6. The exact `jobTiles` and `everydayNav` counts in `tests/admin-visibility.test.ts` after the tile swap.
7. Whether `instrumentation.ts` is the right place for the mock-in-production refusal (it already refuses missing env).

## Appendix C. Risks (summary)

Double posting (4.13), leaked tokens, render cost and satori overflow (3.11), cron frequency (section 6.1), stub adapters being mistaken for a finished integration (documented), sponsor logo formats, and the menu cap (solved by the Advanced entry plus tile swap).
