# Wave C: social graphics and the scheduled posting queue (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #21 (post designer, everything except the lineup graphic that announce-teams already shipped) and #23 (scheduled posting). Out of scope: live calls to any social network (adapters are stubs behind env, section 4.5), AI-written captions or match summaries (a later use of the existing AI gateway seam), auto-posting without a human approval, video or carousel posts, comment or analytics reading, any change to the selector area or to the public lineup routes.

| WP | Issues | One line |
| --- | --- | --- |
| WP-1 Graphics | #21 | Nine graphic types in three sizes and three named layout styles, all drawn from the club theme, one preview at a time in an admin page, downloadable or shareable. |
| WP-2 Queue | #23 | The same page gains Schedule: caption, hashtags, networks, time; a `social-posts` queue; a CRON_SECRET route that publishes due posts through pluggable adapters (mock in tests, stubs for Facebook, Instagram and X that cannot be scheduled yet); status, retries, failure reasons and a download-and-copy fallback. |

Build order WP-1, WP-2. WP-1 ships alone (a committee member can already make and download a graphic). WP-2 adds two hidden collections and fields on the same global.

Product goal (applies everywhere): this repository is reused for other clubs. Colours, crest, fonts, sponsor logos, names, copy, hosts and cookie names come from the `theme`/`club`/`social-settings` globals, the sponsors collection or env (`config/site.ts`), never from code. Tailwind `brand-*` tokens in UI, theme tokens in satori, no hex literals, no club name strings outside `config/site.ts` and seed defaults. A second club gets its own look by saving its theme and picking a style; no code change.

## 0. Findings that shape the design

Checked against this branch.

1. **#21 shipped one graphic.** The only social images are the lineup (`lib/selection/lineup-image.tsx`, 1200x630, routes `/teams/[gameId]/lineup-image` public and `/selector/teams/[gameId]/preview-image` selector-only) and the player stat card (`app/api/public/players/[slug]/card/route.tsx`, `og` and `square`). Both use `themedImageResponse()` from `lib/theme/og.tsx`, which resolves the theme, loads the bundled fonts (`lib/theme/fonts-server.ts`) and the crest (`loadCrest`, PNG/JPEG only, cached on the theme `version`). There is one layout, no story size, no admin composer, no sponsor strip, no result, fixtures, milestone, POTM, sponsor, event, leaders or season graphic. Both routes list `./assets/fonts/**` in `outputFileTracingIncludes`; every new route must too.
2. **No social posting code exists.** `club.socials` is a list of links shown on the site. `FACEBOOK_APP_ID/SECRET` serve selector sign-in only; they are not page-posting credentials and must not be reused for posting. There is no queue, no adapter and no cron except the daily `players-sync`.
3. **Cron today is one daily job** (`vercel.json`, `0 17 * * *`), guarded by `Authorization: Bearer $CRON_SECRET` compared with `!==`. A queue that posts "at 6:30 pm" needs a finer schedule; that is a plan decision (section 6). `vercel.json` is per-club config and must never carry a schedule that a Hobby plan rejects.
4. **Per-game winners are private by design (Wave B).** Best-player ballots are never readable by code that renders public output, and per-game points are never public. So the player-of-the-match graphic cannot read the vote. A staff member picks the player (and optionally the stat line) by hand, from the players who appeared in that game (3.1). The graphic reads only the visible-player stat data.
5. **Instagram and Facebook need a public image URL**, not an upload, at publish time. A queued post therefore needs a stable, unguessable, expiring image URL the network can fetch (section 4.7), and the image must be what was approved, so it renders from a stored snapshot, not from live data.
6. **The committee menu is full.** `everydayNav` is at its cap of 16 and `jobTiles` at 13 (`tests/admin-visibility.test.ts`). Section 3.6 adds one `advancedNav` entry visible to editors (the Selectors precedent) and raises the `jobTiles` cap to 14 for the one new tile; no existing shortcut is removed.
7. **Satori limits.** Only PNG/JPEG images draw (`isDrawableImageType`), flex layout only, fonts must be bundled, text does not wrap predictably. Sponsor logos uploaded as WebP or SVG will not draw; they are skipped, never an error (section 3.4).
8. **GraphQL is disabled** (`graphQL: { disable: true }`). "REST + GraphQL" below means REST and the Local API. Public pages read through `lib/*-queries.ts`, which state their own visibility filter because the Local API ignores access rules.
9. **Payload array fields cannot carry the publisher's write path.** Updating an array through the Local API deletes and re-inserts every row (new row ids) and has no `WHERE claim_token` predicate. So per-network targets are their own hidden collection and every publisher write is explicit SQL (section 4.4, 4.6).

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit `git add` paths, never `git add -A`, never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`: `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); verify hosts are `127.0.0.1` before any DB work; no Blob token; no remote DB; no Vercel CLI. Anything that could reach PlayHQ runs with `PLAYHQ_CLIENT_ID=` empty. **This wave makes no external call.** Facebook, Instagram, X, the AI gateway and email are mocked in tests and gated by env; with the env unset the feature shows "not available" and never tries.

**Dev server ports.** The repo `CLAUDE.md` says 3400-3499; this wave's run brief overrides that to 4100-4199 for the sandboxed worktree so a dev server never collides with the main checkout. Both ranges are local-only conventions; nothing in code or committed config depends on either. The acceptance text below uses `41xx`. If the repo `CLAUDE.md` is next edited for another reason, reconcile it to one range.

**Migrations.** `wp_1_social_settings` (WP-1, also the junior-consent player fields of section 1 "Personal data") and `wp_2_social_posts` (WP-2), each from `pnpm payload migrate:create <name>`, schema-qualified (`"payload"."..."`), `.ts` and `.json` committed. After each: `pnpm generate`, `git add payload-types.ts "app/(payload)/admin/importMap.js"`, then `pnpm check:migrations` and `pnpm check:generated` pass. Dev DB reset: `DROP SCHEMA payload CASCADE` via node + pg, then `pnpm payload migrate`. Function defaults for club-specific values (hashtags, captions) so the migration SQL stays club-neutral, as `Theme` does.

**Staff means staff.** `isStaff` is admin or editor; selectors are a separate role and get nothing here. New code never writes `Boolean(user)` or `!req.user` as an access check; `tests/staff-guard.test.ts` scope is extended to the new paths.

**Guards extended to new paths.** `tests/no-brand-hex.test.ts` (hex and club name), `tests/staff-guard.test.ts` and the selection/selector guards scan `lib/social/**`, `lib/social-queries.ts`, `components/social/**`, `app/api/social/**`, `app/api/admin/social/**`, `app/api/cron/social-posts/**`, `payload/components/Social*`, `payload/endpoints/social*`. The path lists are edited in the same task that adds the folders.

**Personal data and juniors.** Graphics show only what the public site already shows: visible players (hidden players are excluded by the visible-only stat data), public events, public sponsors. Queue rows are staff-readable only. Field-level access is explicit on every server-owned field. No CSV export is added in this wave.

**Rule: public on the website is not consent to be pushed to social networks.** Name-bearing graphics (`potm`, `milestone`, `stats-leaders`, `result` in scorecard mode, and the `lineup` when drawn by the composer) may name, show stats for or show a photo of a player only if `isSocialEligible(player)` is true: the player is not a junior, or the junior has `socialOptIn` set by staff (a staff-only checkbox on the player, default off, with a plain hint "Tick only with a parent or guardian's OK to post this child's name and stats on Facebook, Instagram and X"). `isJunior(player, onDate)` is a pure function: true when a date of birth exists and the age on that date is under 18, or when the player is flagged `isJunior` (a staff-only checkbox for clubs that do not store dates of birth), or when the player belongs to a grade category the club marks as junior. The exact existing signals are confirmed in Appendix B item 6; the function takes whatever exists and fails closed (a junior flag with no opt-in excludes). Enforcement points, all using the one function: source choosers and the POTM picker omit ineligible players; `layout` data excludes them (rows dropped, a headline that would name one is not offered); the POTM and milestone loaders 404 when the chosen player is ineligible; the schedule action rejects specs naming one; publish-time re-validation fails the target with `content_changed` if a player became ineligible. Test (unit and int): a junior without opt-in never appears in the layout data of `potm`, `milestone`, `stats-leaders`, scorecard-mode `result` or the composer `lineup`, nor in a chooser, picker, scheduled spec or publish; with opt-in they do; an adult is unaffected. The public website is untouched by this rule.

**Server actions and endpoints are public POSTs.** Each one re-derives the caller (`getPayload().auth({ headers })`, then `isStaffUser`), validates input with a pure function, and derives `createdBy`, `approvedBy` and every status from the session and the server, never from form fields.

**Mobile first and accessible.** The composer is used on a phone after a game: 360 px first, 44 px tap targets, one preview at a time, no hover-only controls, status never colour-only (text label plus icon), visible focus, `prefers-reduced-motion` respected, every preview `<img>` has alt text naming the graphic and size, copy-to-clipboard announces success through a polite live region. Plain English throughout (3.5).

**Docs.** New: `docs/features/social-graphics.mdx` (WP-1), `docs/features/social-posting-queue.mdx` (WP-2). Updated: `docs/features/index.mdx`, `theme-editor.mdx` (styles use the theme), `team-selection-and-announce.mdx` (the lineup is also a composer type), `admin-notifications.mdx` (new Home lines), `committee-admin.mdx` (new entry), `.env.example`. Link deferred items to #21/#23 and tracking #38. Ticking #21 in the #38 body is left to the human (issues are read-only for this run).

**Efficiency.** Iterate with `tsc --noEmit`, `pnpm generate`, single vitest files, eslint on changed files. Full vitest once and one `next build` in the final verify step; never two vitest runs at once.

**Constants, not env knobs.** Queue tuning lives in `config/site.ts` as generic constants: `SOCIAL_MAX_ATTEMPTS = 3`, `SOCIAL_BACKOFF_MINUTES = [5, 15, 45]`, `SOCIAL_LEASE_MINUTES = 10`, `SOCIAL_CLAIM_BATCH = 5`, `SOCIAL_IMAGE_GRACE_MINUTES = 15`. There are no env variables for them.

## 2. Shared building blocks (reused, not rebuilt)

| Need | Reuse | New |
| --- | --- | --- |
| Colours, font, crest | `getTheme()`, `resolveTheme`, `themedImageResponse()` (`lib/theme/og.tsx`), `loadThemeFonts`, `loadCrest` | `loadImageDataUri(url, updatedAt)` generalising the crest loader for sponsor logos (same PNG/JPEG rule, short timeout, cache key url + updatedAt; 3.4) |
| Contrast maths | `contrastRatio`, `relativeLuminance` (`lib/theme/contrast.ts`) | `readableOn(bg, theme)` and `scrimFor(photoMeanLuma, theme)` (section 3.2) |
| Match data | `lib/match-store/queries.ts` (`getMatchByGameId`, `StoredMatch`), `lib/matches-queries.ts` (`loadGamesForSeasonName`), PlayHQ `Game`/`Scorecard` types | thin `lib/social/sources/*.ts` loaders that return plain serialisable data |
| Leaders and milestones | `lib/stats/leaderboard.ts` (`buildLeaderboard`, `filterRows`), `lib/stats/milestone-board.ts` (`milestoneBoard`), `lib/stats/milestones.ts` (`describeAchieved`) | none |
| Season wrap | `lib/yearbooks-queries.ts` (published yearbooks), `lib/stats/match/yearbook.ts` | none |
| Events, sponsors | `lib/events-queries.ts`, `lib/sponsors.ts` (`TIER_ORDER`), the `sponsors` collection logo | none |
| Lineup | `getPublishedTeam` (`lib/teams-queries.ts`), `lineup-text.ts` formatters | the composer draws lineup in all three sizes with the new renderer (3.7); the existing 1200x630 `renderLineup` and its two public/selector routes stay untouched |
| Dates | `lib/selection/club-date.ts`, `formatMatchDay`, `CLUB_TIMEZONE`, `CLUB_LOCALE` | `zonedToUtc` for the schedule picker (pure, tested across a DST change) |
| Staff auth, throttle | `isStaffUser`, `lib/throttle.ts` (`hit`) | staff rate limits (3.7, 4.7) |
| Secrets | `deriveKey`, `HKDF_LABELS` (`lib/secrets.ts`) | new label `socialImage` |
| Notification centre | `notificationLines` (`lib/admin/notifications.ts`) | `social` input and two lines (section 4.8) |
| Admin custom view | `payload.config.ts` `admin.components.views` (`approvals`, `selectors`) | one view `social` at `/social` |

## 3. WP-1: graphics in three sizes and three layout styles (#21)

### 3.1 Types, sizes, styles

Graphic types (key, label, source). The list follows #21 (results, fixtures, milestones, POTM, sponsor thank-you, event promo, leaders, season wrap) plus the lineup that already exists. There is no `toss` type; the scorecard and the round results are modes of `result`.

| Key | Label | Source and chooser |
| --- | --- | --- |
| `result` | Results | mode `single` (default): one stored match (`getMatchByGameId`), final score and margin; mode `scorecard`: the same match with top batters and bowlers (eligible players only, 3.0 rule in section 1); mode `round`: all finished games on one round and date (`loadGamesForSeasonName`). The chooser lists recent finished games, newest first, and a "whole round" choice |
| `fixtures` | Weekend preview | upcoming games for a round or date range (`upcomingFixtures`, `selection-fixtures`) |
| `lineup` | Team announcement | a published team (`getPublishedTeam`) |
| `potm` | Player of the match | staff pick a game, then a player from **that stored match's players only** (the picker is built from the match, not from all players); eligible players only; headline stat line auto-filled from that player's batting/bowling in that game, editable text |
| `milestone` | Milestone | an eligible player and a milestone from `milestoneBoard().achievedNow`, or an "approaching" one |
| `stats-leaders` | Season leaders | top 3 or 5 for one metric, season and grade category (`buildLeaderboard`), eligible players only |
| `event-promo` | Event promo | one published event (`listUpcomingItems`): title, date, time, place, cover |
| `sponsor-thanks` | Sponsor thank-you | one or more public sponsors; logo, name, tier, thank-you line from the caption template |
| `season-wrap` | Season wrap | a published yearbook: record, top run scorer, top wicket taker, champion if any (eligible players only) |

**POTM validation.** `parseParams` checks shape (ids, text). The loader then verifies on the server that the chosen player appears in the chosen stored match (batting, bowling or squad rows) and is eligible; otherwise it throws the same not-found as an unknown id (404 from the route, a plain error from the schedule action). The picker is constrained to the same list, but the server never trusts the picker. The free-text stat line follows the 80-character rule of 3.7 (trimmed, control characters removed, cut at 80) at parse time, in the schedule action and in `finalText`; a test posts 200 characters and a control character and expects 80 clean ones.

Sizes (`SIZES`): `square` 1080x1080, `story` 1080x1920 (portrait 9:16, for Instagram/Facebook stories and reels covers), `landscape` 1200x630 (link preview, X, Facebook post). A fourth feed size 1080x1350 is not added; Instagram accepts square.

Styles (`STYLES`): `bold`, `classic`, `minimal`.

- **bold**: primary-colour surface (`black` token), text from `readableOn`, accent bar, display type at maximum size; reads at thumbnail size.
- **classic**: surface-colour card (`cream` token) with a primary band carrying the crest, thin accent rules, centred type; the closest to a printed scoreboard.
- **minimal**: plain light surface, small crest top-left, lots of space, accent underline, body type heavier than display.

Structure: a graphic is `Spec<D>` = `{ type, label, parse(params) -> Params, load(params) -> D, layout(D, style, size) -> Block[] }`. The renderer lays the blocks out with shared primitives (`Frame`, `Masthead` with crest and club name, `Headline`, `Kicker`, `BigNumber`, `StatRow`, `PlayerList`, `FooterStrip` with sponsor logos and site host). Each style is a `StyleKit` of token choices plus three structural switches (frame, masthead placement, headline casing). Type x style x size is therefore composed from primitives, not 9 x 3 x 3 hand-written layouts. The density rules live in the primitives: story gets larger type and more rows, landscape gets fewer rows and a single-column list, and any list longer than the size fits is cut at a measured row count with "+ N more", never clipped mid-row.

### 3.2 Theme-driven, contrast-checked colours

- `styleTokens(theme, style)` (pure, `lib/social/style.ts`) returns `{ surface, surfaceAlt, text, textMuted, accent, accentText, onAccent, rule, scrim }`, each a value from `theme.colors`, the neutral constants `WHITE`/`BLACK` in `lib/theme/og.tsx` (a neutral `BLACK` constant is added there; the brand-hex guard already allows that file), or a computed colour (below).
- **Text colour is never picked by hand.** `readableOn(bg, theme)` returns the candidate (white, black constant, `colors.black`, `colors.charcoal`) with the highest contrast against `bg`. **Scope of the guarantee:** for a *solid* background, the better of solid white and solid black is at least 4.58:1 (the mathematical minimum, reached near mid-grey), so body text reaches 4.5:1 whatever palette a club saves. It says nothing about translucent text, gradients or photos, which is why those cases are handled separately below.
- **`textMuted` is derived, not a constant.** It is a mix of `text` toward `bg` by a fixed fraction (for example 25%), then verified: `mutedOn(bg, theme)` returns that mix when it is at least 4.5:1 against `bg`, and otherwise falls back to `text` itself. A fixed `WHITE_75` is removed; on mid-grey it fails 4.5:1. The test asserts `textMuted` against `surface` and `surfaceAlt` for every palette.
- `accentText(bg, theme)` tries `gold-light`, `gold`, `gold-deep`, `gold-dark` for 4.5:1 and falls back to `readableOn`. Large display text (24 px and above) uses the same function; the 3:1 allowance is not relied on.
- **Text over photos** (`event-promo` cover, `season-wrap` cover, a lineup photo if one is added): text never sits directly on a photo. The primitive draws a **scrim**, a solid or gradient block behind the text zone, whose colour comes from the tokens (`scrim` = `colors.black` or `colors.charcoal`, or `colors.cream` for classic) at an alpha chosen so the *effective* colour over the worst case holds. The worst case is computed, not assumed: the effective scrim colour is composited over both pure white and pure black (the extreme photo values) and `readableOn` text must reach 4.5:1 against **both**. If a token and alpha cannot reach that, alpha is raised to 1 (a solid band). The text colour for that zone is `readableOn(effectiveScrimOverWorstCase)`. Layouts that have no scrim never place text over a photo.
- Decorative accent shapes (bars, rules) are not text and are not contrast-gated, but the accent bar is never the only carrier of meaning.
- Tests (unit, no DB): for the seed theme and ten generated palettes (dark, light, mid-grey, all-same, near-white, saturated), every `styleTokens` text/background pair in every style is at least 4.5:1 (including `textMuted` and `accentText`); **the scrim test** checks the text colour against the effective scrim composited over white and over black, not against the `surface` token, for every style and palette; changing the palette changes the tokens (a different club looks different); no function in `lib/social/**` contains a `#` colour literal (the guard).
- The `theme` global is unchanged; its existing save-time contrast checks keep protecting the site. Social contrast is guaranteed independently at render time, so a theme that is fine for the website cannot produce an unreadable graphic.

### 3.3 Settings: `social-settings` global (migration `wp_1_social_settings`)

New global. Access: `read: isStaff`, `update: isStaff` at global level, with **field-level access that restricts the styling fields to admins** (field access can only narrow global access, so the global itself must admit editors for the caption fields to be writable). Plain labels:

Admin-only fields (`update: isAdminField`):

- `defaultStyle`: select bold/classic/minimal (default `bold`; a seed default may differ per club). The post's own style choice (3.5) overrides it; there is no per-type setting.
- `sponsorStrip`: `{ show: checkbox default true, tiers: select-many of TIER_ORDER default Platinum and Gold, max: number 3-8 default 5 }`.
- `showSiteHost`: checkbox, shows the site host in the footer.
- `attribution`: optional short text line under the footer (empty by default).

Editor-writable fields (`update: isStaffField`, so editors and admins; never selectors or anonymous), the things the people who post actually change:

- `hashtags`: array of text (`{ tag }`, stored without `#`, validated `^[A-Za-z0-9_]{1,40}$`), max 30, default from the club defaults seed.
- `captionTemplates`: group with one textarea per graphic type (generic English defaults in code, club voice in the seed defaults), max 600 characters each.
- `signOff`: optional line appended to every caption.

Server-owned (WP-2): `lastCronRunAt`, `observedCronIntervalMinutes` (4.7); `read: isStaffField`, `update: nobodyField`, written by code with explicit SQL.

Placement: because editors cannot see the global in the menu, the composer carries a small "Captions and hashtags" panel (a staff server action `saveCaptionSettings` validating with the same pure validators and writing only these three fields). The global's own page stays an admin entry for styling, and an admin sees all fields there. The composer reads settings server-side through `lib/social-queries.ts` (`getSocialSettings`, Local API with an explicit select). There is no per-network hashtag count setting; the number of tags a network takes is a constant on its adapter (`limits.maxHashtags`).

Test (REST): anonymous and selector cannot read or write the global; an editor can update `hashtags`, `captionTemplates` and `signOff` and gets a rejected (field-stripped, value unchanged) result when trying to change `defaultStyle`, `sponsorStrip`, `showSiteHost` or `attribution`; an editor cannot write `lastCronRunAt`; an admin can write all styling fields; a bad style value is rejected by the select.

Admin classification: `advancedNav` entry `{ key: 'social-settings', label: 'Social graphics settings', path: '/globals/social-settings' }` (admin only), `admin.group: false`, `admin.hidden: hiddenFromEditors`.

### 3.4 Sponsor strip

`sponsorsForStrip(settings)` reads `sponsors` (public read already; the query states its own filter: tiers in settings, has a logo, order by `TIER_ORDER` then `sortOrder`), takes up to `max`, and loads each logo with `loadImageDataUri(url, updatedAt)`.

Logo fetch, the only outbound fetch in this wave:

- A **short timeout** (2 s, `AbortSignal.timeout`). A logo that is not PNG/JPEG, times out or fails is skipped and logged as a one-line warning; if none draw, the strip is omitted and the composer shows a hint ("Sponsor logos need to be PNG or JPG to appear on pictures").
- **Cache key is `url + updatedAt`**, so an edited logo refetches and an unchanged one never does. A per-process map is the first level; because serverless instances start cold, the fetch also goes through the Next data cache (`fetch(url, { next: { revalidate: 86400, tags: ['sponsor-logos'] } })`) so a cold instance reuses the stored bytes instead of calling Blob again. The `sponsors` afterChange hook revalidates the tag.
- Only the configured media host is fetched (the origin of the media URL setting, or the local `127.0.0.1` file path in dev); any other host is skipped without a request.
- The int suite's "no outbound calls" spy (4.10) allows exactly that configured local or Blob media host, listed explicitly in the test, and fails on everything else.

The `sponsor-thanks` type draws the chosen sponsor large and reuses the same loader.

### 3.5 Admin composer: one entry, three steps

A custom admin view `social` (`/admin/social`, `payload/components/SocialView`), reached from one `advancedNav` entry with `forEditors: true` (label "Social posts", the Selectors precedent) and one Home tile (section 3.6). Three steps on one page, stacked on a phone:

1. **Pick a graphic.** A grid of plain-English tiles (the labels in 3.1). Choosing one shows a short source chooser built from the loader (for example the last ten finished games: "B Grade v Opponent, Sat 11 Oct, won by 24 runs"). Types with nothing to show say so ("No finished games yet").
2. **Preview.** **One preview at a time.** Size tabs (Square, Story, Wide) show only the selected size, and only that size is requested; switching tab fetches that size on demand and keeps already-loaded ones for the session, so a tap never re-downloads a 1080x1920 PNG the person has already seen. A style switcher (Bold, Classic, Minimal, with the club default marked) and the editable text fields the type needs (POTM stat line, sponsor thank-you line, custom headline where offered). Changing anything re-requests only the visible size after a short debounce and shows a skeleton, not a blank. Previews are requested as ordinary `<img>` loads; the heavier file is used only on download.
3. **Use it.** Per size:
   - **Share / Save to Photos**: calls `navigator.share({ files: [pngFile] })` when `navigator.canShare({ files })` is true (iOS Safari and Android Chrome then offer "Save Image" to Photos or hand it straight to the Facebook/Instagram/X apps), and falls back to a normal download everywhere else. A `Content-Disposition` download alone sends the file to Files on iOS, which is the wrong place for a photo.
   - **Download** (PNG), always available.
   - The caption (template filled from the data, editable) with "Copy caption". In WP-2 this step adds Schedule and Save as draft.

   Downloads and shares happen on tap; the PNG for the file is fetched at that moment (or reused from the loaded preview blob).

State lives in the URL (`?type=&source=&style=&size=`) so a refresh or a shared link keeps the choice. The view is server-rendered for step 1 and a small client component handles steps 2 and 3. It is reused for editing a draft in WP-2.

**Plain English in the UI** (no jargon; the internal state names stay in code):

| Internal | Shown as |
| --- | --- |
| Unschedule | "Pause (back to draft)" |
| Publish now | "Post now" |
| `unknown` target state | "Not sure it went out. Check the page." |
| `failed` | "Did not post" with the reason |
| `scheduled` / `publishing` / `published` | "Scheduled" / "Posting now" / "Posted" |

### 3.6 Menu and admin classification

- `advancedNav`: `{ key: 'social', label: 'Social posts', path: '/social', forEditors: true }` and `{ key: 'social-settings', label: 'Social graphics settings', path: '/globals/social-settings' }` (admin only).
- `jobTiles`: add `{ key: 'social', title: 'Make a social post', hint: 'Results, line-ups, milestones and more', path: '/social' }`. The `apparel` tile **stays**. The `jobTiles` cap rises from 13 to 14 in `tests/admin-visibility.test.ts`, justified in a one-line comment: posting a result is a weekly job for editors and deserves a Home shortcut, and the cap exists to keep Home scannable, which one more tile does not change. `everydayNav` stays 16.
- `tests/admin-visibility.test.ts`: add `social-settings` to the classified globals; the new view key is asserted in `navFor('editor')` and absent for `navFor(null)`; the tile-cap assertion is updated to 14.
- `help` content (`payload/admin/helpContent.ts`) gets one section "Make a social post", written in the same plain style, in plain English per 3.5.

### 3.7 Routes and access

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /api/admin/social/graphic?type&size&style&source&...` | staff only | Renders the PNG from live visible data. Signed-out, selector and unknown input all return the same plain 404 with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex` (the selector preview route is the model). `download=1` adds `Content-Disposition` with a filename `<EXPORT_FILENAME_PREFIX>-<type>-<size>-<date>.png` (slugged; no user text). Rate limit per staff user id through `lib/throttle.ts`: **300 renders per 10 minutes with a short `lockMs` (60 s)**, sized for real use (a tap per style per size, repeated edits, a lap through several graphics) and stopping only a runaway loop; hitting it shows "Slow down for a minute", never a long lock. The client renders only the selected size, so typical use is a handful per change. |
| `GET /api/admin/social/sources?type=` | staff only | JSON for the chooser (ids and labels only, no stats; ineligible players omitted). |
| `/admin/social` | staff (Payload admin login) | the composer. |
| `/teams/[gameId]/lineup-image`, `/selector/.../preview-image` | unchanged | still the existing 1200x630 `renderLineup` only. |

**Lineup in the composer uses one renderer.** In the composer, `lineup` is a normal spec rendered by the new renderer in **all three sizes**, landscape included, so the matrix is uniform (9 types x 3 sizes x 3 styles), the style switcher works for every cell, and the look does not drift between renderers. The two public/selector routes keep the old renderer and are not modified; the composer never links to them for landscape.

Input is parsed by a pure `parseParams(type, searchParams)` per spec: unknown type/size/style fall back to a 404 (not a default), ids must match `^[0-9a-z-]{1,64}$` or be numeric, free text is trimmed to 80 chars and has control characters removed. Nothing user-entered is inserted as markup (satori takes text nodes only). Spec-level checks that need data (POTM membership, eligibility) happen in `load`, which returns the same not-found (3.1).

There are no public graphic routes in WP-1. Sharing a graphic publicly happens by downloading or sharing it, or (WP-2) through the signed URL a network fetches.

### 3.8 Tests

Unit (no DB):

- `social-style.test.ts`: tokens and contrast across palettes including `textMuted` and the scrim (3.2); `defaultStyle` is used when the post has no choice.
- `social-eligibility.test.ts`: `isJunior`/`isSocialEligible` (age boundary at 18 on the game date, flag, junior category, opt-in, fail closed).
- `social-specs.test.ts`: for each of the 9 types, `parseParams` rejects bad input, `layout` returns blocks for fixture data in all three sizes and three styles (**9 combinations per type, 81 across the 9 types**, without rendering; lineup landscape included), list cut-off adds "+ N more", empty data produces the type's empty message rather than throwing, an ineligible junior never appears in layout data, the POTM loader rejects a player who was not in the match and an over-long or control-character stat line is cleaned to 80.
- `social-render.test.ts`: with fixture data, `ImageResponse` renders every type x size x style (**81 renders**, 9 types x 3 x 3) to a PNG with the right dimensions (read the IHDR bytes), under a time budget. Run as one file; skipped combinations are listed, not silently dropped. (If the type list changes, the number is `types x 9`; the 12-type figure of the first draft, 108, is superseded by the cuts in Appendix D.)
- `social-caption.test.ts`: placeholders (section 4.3).
- `no-brand-hex.test.ts` / club-name guard: new paths added; a test asserts `lib/social/**` imports colours only from the theme or the neutral constants.

Integration (local Postgres, `tests/int/social-graphics.int.test.ts`):

- Seed fixtures: one finished match with batting/bowling rows, a published team, an event, three sponsors (one with a WebP logo), a yearbook, a junior without opt-in and one with. For each type, the staff route returns a PNG; a hidden player never appears and an ineligible junior never appears (assert the text nodes through `layout` data, not pixels); a draft or unpublished event 404s; the POTM route 404s for a player not in the match.
- Access: anonymous, selector, and a disabled admin get the same 404 body and headers as an unknown id; an editor gets 200; the sources route leaks no stat values.
- `social-settings` REST: the matrix in 3.3.
- Rate limit: 301st render in a window is refused, then allowed again after `lockMs`, and one staff user does not lock out another.

### 3.9 Seed (`seed:demo`)

Extend `payload/scripts/seed-demo.ts`: default `social-settings` (club style set explicitly for the demo), 4 sponsors with PNG logos generated from a tiny in-code PNG (no network) across tiers, one event with a cover, a junior player without opt-in and one with, and enough finished matches for results, leaders and milestones (the demo already seeds matches; add one with a POTM-worthy performance). Idempotent (find-or-create).

### 3.10 Acceptance (local, no external calls)

1. `pnpm payload migrate` on a fresh `langlang_dev`; `pnpm seed:demo`; start the dev server on a 41xx port.
2. Sign in as an editor, open Social posts, make each of the 9 types from seeded data; all three sizes render one tab at a time; switching style changes the look (lineup landscape included); Download gives a PNG at the stated size; Share falls back to download on desktop.
3. Change the theme palette and crest in the admin (as admin), regenerate the preview: colours and crest follow; text stays readable (the unit contrast test is the formal gate).
4. Sign out: the graphic route and the admin view are 404/login; sign in as a selector: 404.
5. Disable the sponsor logos: the strip disappears without an error.
6. The seeded junior without opt-in is absent from the POTM picker, leaders and milestone choices.

### 3.11 Risks

- **Render time and memory.** One render per change on a serverless function. Mitigation: only the visible size is requested, no-store but each render is fast (no network except sponsor logos, cached); `maxDuration` 30 on the route.
- **Satori text overflow** for long names. Mitigation: truncation by character budget per block (the lineup uses `LINEUP_NAME_MAX`), `+ N more`, and the render test with deliberately long names.
- **81 render tests could be slow.** One file, run once in the final verify; the per-commit loop renders a subset (each type once).
- **Fonts.** Only the theme's bundled display font and the body font are available; a club picking a font that is missing from `assets/fonts` already falls back (W1). No new font files in this wave.

## 4. WP-2: composer scheduling and the posting queue (#23)

### 4.1 Overview

Step 3 of the composer gains: caption (template filled, editable), hashtags (from settings, removable), networks (only those that are available, below), size per network (sensible default), "post at" (club time zone), and two buttons: **Save as draft** and **Schedule**. Scheduling is the human approval: only a staff member can move a post to `scheduled`, and the row records who and when. There is no automatic scheduling in this wave. A queue list sits below the composer: Needs attention, Scheduled, Posted, Drafts.

**Which networks can be scheduled.** Each adapter has `live: boolean`. The three real adapters are stubs with `live: false`, so even a club with real credentials in env cannot schedule to them. `configuredNetworks(env)` returns a network only if `adapter.live && adapter.isConfigured(env)` (the mock counts as live when enabled, 4.5). A network that is not offered shows "Facebook is not available yet. Download the picture and post it by hand." with the Share/Download/Copy buttons beside it, and Schedule is blocked at compose time when no network is selectable. This also keeps "N posts need your attention" from filling with posts guaranteed to fail with `not_implemented`.

**Other compose-time blocks** (Schedule disabled with a plain reason): no network selectable; a caption error for a selected network; `scheduledFor` not in the future; the quiet-hours tick missing when outside the window; **`club.siteUrl` is not a public `https` URL** (for example `http://`, `localhost`, a loopback or private IP), because networks could never fetch the image URL: "The site address is not a public https address, so networks cannot fetch the picture"; a spec naming an ineligible player (section 1); an unknown or hidden POTM player.

### 4.2 Settings added to `social-settings` (migration `wp_2_social_posts`)

Added to the global of 3.3 (hashtags, `captionTemplates`, `signOff` already exist from WP-1 and are editor-writable):

- `publishWindow`: `{ earliest: 'HH:MM', latest: 'HH:MM' }` quiet hours in club time (default 07:00-21:00). A schedule outside the window is allowed only with an explicit tick. The tick text states why it is asked: "This is outside the club's usual posting hours (7:00 am to 9:00 pm), when most followers are asleep or may be annoyed by notifications. Post anyway." `publishWindow` is admin-only like the other styling and policy fields.
- Server-owned heartbeat fields `lastCronRunAt` and `observedCronIntervalMinutes` (4.7).

Removed from the first draft: `hashtagsPerNetwork` (per-network tag counts are adapter constants), the `networks[].enabled` array (env plus `live` is enough) and all queue env knobs (constants in `config/site.ts`, section 1).

### 4.3 Captions

`lib/social/caption.ts` (pure): `fillTemplate(template, vars)` replaces `{name}` placeholders from a per-type whitelist, for example `result`: `{club} {opponent} {grade} {round} {score} {margin} {venue} {date} {link}`. Unknown placeholders are left in place and returned in `unknown[]` so the UI can warn; missing values drop their whole line rather than leaving "v undefined". Values are inserted as plain text (no template execution, no markdown). `{club}` is `club.shortName || club.name`; `{link}` is `club.siteUrl` plus the public path (match, event, yearbook), nothing else.

`composeFinalText({ body, signOff, hashtags, adapter })` appends the sign-off and the first `adapter.limits.maxHashtags` hashtags, and `validateCaption(network, text)` returns errors/warnings from the adapter limits: X 280 characters with each URL counted as 23, Instagram 2,200 characters and 30 hashtags, Facebook 63,206. An error blocks Schedule for that network; a warning does not. Hashtag text is whitelisted so it cannot carry mentions or links.

**The approved text is frozen at Schedule.** `composeFinalText` runs once, inside the schedule action, with the settings as they are at that moment, and the result is stored on each target as `finalText`. The publisher sends `finalText` verbatim and never recomposes it from settings; "Copy caption" copies the same `finalText`. A later change to the sign-off, hashtags or templates therefore cannot alter an approved post. Editing a scheduled post moves it back to draft (4.4); scheduling again re-composes `finalText` from the then-current settings and the edited caption, and that is what the person sees and approves.

### 4.4 Data model: collections `social-posts` and `social-post-targets`

**Why two collections.** Payload array fields are rewritten wholesale (delete and re-insert, new row ids) on every update and cannot express `WHERE claim_token = $token`. The publisher needs per-target transitions that never disturb other targets, and a final write guarded by the claim. So targets are a hidden collection with a plain table (`social_post_targets`) and **the publisher, its claim, per-target transitions and finish are explicit SQL** through the drizzle client (the `throttle.ts` precedent), never the Local API (4.6). The Local API is used only for compose-time writes (draft save, schedule, edit, pause), each of which also flips status with a guarded statement (`UPDATE ... WHERE id=$id AND status IN (...)`) so it cannot race a claim.

`social-posts` (one row per post, `timestamps: true`):

| Field | Type | Notes |
| --- | --- | --- |
| `title` | text | derived at save (type + subject), for lists |
| `status` | select | `draft`, `scheduled`, `publishing`, `published`, `failed` |
| `spec` | json | `{ type, style, params, snapshot, playerIds[], sponsorIds[], eventId?, gameId? }`: the data the graphic is drawn from, frozen at save. `snapshot.players` holds `{ id, name, version }` per player (`version` = the player's `updatedAt` at save), used by 4.6 step 3 |
| `caption` | textarea | the base caption (per-network `finalText` is on the targets) |
| `hashtags` | array of text | the post's chosen tags |
| `scheduledFor` | date | UTC; null for drafts |
| `nextRunAt` | date | when the claim may pick the post: `scheduledFor`, then the earliest pending target `nextAttemptAt` after a retryable failure; indexed |
| `approvedBy` | relationship users | set by the schedule action; **cleared with `approvedAt` whenever the post goes back to draft** (edit or pause) |
| `approvedAt` | date | |
| `createdBy` | relationship users | |
| `claimToken` | text | lease owner |
| `claimedAt` | date | lease start |
| `finishedAt` | date | when the post last reached `published` or `failed`; drives the image-URL grace period (4.7) |
| `revision` | number | increments on every edit; part of the signed image URL |

`social-post-targets` (hidden, one row per network per post):

| Field | Type | Notes |
| --- | --- | --- |
| `post` | relationship social-posts | indexed; deleting a post deletes its targets |
| `network` | select | facebook, instagram, x, mock |
| `size` | select | one of `SIZES` |
| `finalText` | textarea | the frozen network text from 4.3 |
| `status` | select | `pending`, `publishing`, `published`, `failed`, `unknown` |
| `attempts` | number | |
| `nextAttemptAt` | date | |
| `lastError` | text (max 300) | scrubbed plain reason |
| `remoteId`, `remoteUrl` | text | |
| `publishedAt` | date | |
| `manual` | checkbox | marked posted by a person |

Indexes: `(status, nextRunAt)` on posts for the claim, `(createdBy)`, `(post)` on targets. Table names are confirmed from the generated migration `.json` (Appendix B item 3).

Why a frozen `snapshot`: the post publishes exactly the approved picture, and a match edited after scheduling cannot change it silently. The signed image route (4.7) renders from `spec`, never from live data.

**Access** (collection-level `access`, REST and Local API; GraphQL disabled), the same for both collections:

| Operation | public | selector | editor | admin |
| --- | --- | --- | --- | --- |
| read | no | no | yes (REST and admin) | yes |
| create / update / delete over REST | no | no | no | no |
| create / edit / schedule / pause / retry / mark posted | no | no | server action, `isStaffUser` | same |

Field-level: `claimToken` and `claimedAt` have `read: nobodyField`, `update: nobodyField`; `status`, `nextRunAt`, `revision`, `approvedBy`, `approvedAt`, `finishedAt` and every target field have `update: nobodyField` (written only by code, with explicit SQL or `overrideAccess`). All writes go through `lib/social-queries.ts` actions that re-check staff. `admin.hidden: true`, direct admin URLs are blocked by `create/update: nobody`, and read stays staff so the committee never sees a raw row because there is no menu entry.

Admin classification: a new list `socialCollections: ['social-posts', 'social-post-targets']` in `payload/admin/navigation.ts` (hidden for every role, absent from both menus, enforced both ways by `tests/admin-visibility.test.ts`; the committee reaches them only through the Social posts view).

**Status rules (pure, `lib/social/status.ts`, unit-tested exhaustively):**

- `draft -> scheduled` (needs at least one live target, valid captions with `finalText` computed, `scheduledFor` in the future, a public https `club.siteUrl`). The schedule action sets `approvedBy`/`approvedAt` from the session.
- `scheduled -> draft` ("Pause (back to draft)"; allowed only while `scheduled`). **Clears `approvedBy` and `approvedAt`** and bumps `revision`.
- `scheduled -> publishing` (claim, only by the cron or "Post now").
- `publishing -> published` when every target is `published`; `-> failed` when no target is left that can still be retried and at least one failed or is `unknown`; `-> scheduled` (with `nextAttemptAt`) when some target failed retryably and attempts remain.
- `failed -> scheduled` ("Retry now": resets attempts for `failed` targets, never for `published` ones; `unknown` targets must be confirmed by hand first, "I checked, it did not go out" or "Mark as posted"). Retry re-checks that the original approver is still active staff (4.6 step 3) or requires the retrying staff member to re-approve, which sets a new `approvedBy`.
- `published` is terminal. Editing a post in `publishing` or `published` is refused. **Editing a `scheduled` post moves it back to `draft`, bumps `revision` (so an old signed URL stops working), clears `approvedBy` and `approvedAt` and discards the targets' `finalText`;** Schedule then recomputes everything.

### 4.5 Network adapters

```ts
// lib/social/adapters/types.ts
type PublishInput = { postId: number; network: Network; text: string; imageUrl: string }
type PublishResult =
  | { ok: true; remoteId: string; remoteUrl?: string }
  // The network provably did not accept the request (nothing was posted).
  | { ok: false; outcome: 'rejected'; retryable: boolean; reason: string; code?: string }
  // The request may have reached the network: outcome cannot be known.
  | { ok: false; outcome: 'unknown'; reason: string; code?: string }
interface NetworkAdapter {
  id: Network                         // 'facebook' | 'instagram' | 'x' | 'mock'
  label: string
  live: boolean                       // false for the stubs: cannot be scheduled
  sizes: readonly SizeKey[]           // sizes it accepts, default first
  limits: { maxChars: number; maxHashtags: number }
  isConfigured(env: NodeJS.ProcessEnv): boolean
  publish(input: PublishInput, signal: AbortSignal): Promise<PublishResult>
}
```

There is no `idempotencyKey`: none of the three networks honours one, so carrying it would imply a protection that does not exist. Double-post protection is the claim, the per-target at-most-once step and the `unknown` state (4.6), nothing else.

**Mapping rules (contract for every adapter, tested with the mock).**

- **`unknown`**: a timeout or abort (the 20 s signal), a dropped connection or reset *after the request was sent*, any 5xx response on the posting call, or a response that cannot be parsed. The target moves to the `unknown` state, is never auto-retried, and the person is asked to check the page (3.5 wording).
- **`rejected`**: errors that prove nothing was posted: validation errors, auth errors (expired token), 4xx responses, rate limiting (429), and connection failures *before* any bytes were sent (DNS failure, connection refused). `retryable: true` only for transient ones (429 with its wait, connection refused/DNS); auth, validation and other 4xx are `retryable: false` (they need a person to fix the cause, then "Retry now"). A rejected, non-retryable target is `failed`; a retryable one follows the backoff.
- A media-container fetch failure reported by the network (Instagram could not fetch the image) is `rejected`.

**The three real adapters are stubs in this wave.** Each declares its env contract and limits, `live: false`, and its `isConfigured`; `publish` returns `{ ok: false, outcome: 'rejected', retryable: false, reason: 'Live publishing for this network is not switched on in this build', code: 'not_implemented' }`. They make no HTTP call and import no network SDK. They are real placeholders, not simulated successes, so a configured production environment cannot report a post as published that was never posted, and because `live` is false they are never offered by `configuredNetworks`, so a post cannot be scheduled to one. The live HTTP calls are a follow-up that flips `live` and needs the credentials and decisions in section 6.

- `lib/social/adapters/index.ts`: `getAdapter(network, env)` returns an adapter only when `isConfigured(env)`; `configuredNetworks(env)` returns `live && isConfigured` adapters and is what the composer lists and what the schedule action re-checks server-side.
- **Mock adapter** (`lib/social/adapters/mock.ts`): `live: true`; configurable outcome (success, rejected retryable, rejected permanent, slow, throws, unknown) and records calls in memory; used by every test and, for demos, enabled only when `SOCIAL_MOCK_NETWORK=yes`. It shows in the composer as "Test network" and never reaches a real service. **Production guard:** the mock is refused when `NODE_ENV === 'production'` unless a second explicit flag `SOCIAL_MOCK_ALLOW_PROD_DEMO=yes` is also set (this does not depend on `VERCEL_ENV`, which is absent on self-hosted or other production runs). Both `isConfigured` for the mock and `instrumentation.ts` apply the same pure function `mockAllowed(env)`, and `instrumentation.ts` refuses to start if the mock is requested without being allowed. Unit test: `mockAllowed` is false for `NODE_ENV=production` with only `SOCIAL_MOCK_NETWORK=yes`, true with both flags, true in development and test with the first flag only, false with neither.
- Env (documented in `.env.example`, all empty by default, none read in the browser): `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`; `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN`; `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`; `SOCIAL_MOCK_NETWORK`; `SOCIAL_MOCK_ALLOW_PROD_DEMO`. The page-posting Facebook credentials are deliberately separate from the selector sign-in app. Secrets are never stored in the database, never shown in the admin, and never logged; error strings returned by an adapter are scrubbed of any configured secret value before they are stored (`scrubSecrets`, unit-tested).
- Capability is shown honestly: the composer lists a network only if it is `live` and configured, otherwise the "not available yet" line of 4.1 with the fallback.

### 4.6 Publisher: claim, publish, backoff

`lib/social/publisher.ts`, called by the cron route and by "Post now". **Every write in this section is explicit SQL through the drizzle client against `"payload"."social_posts"` and `"payload"."social_post_targets"`; none goes through the Payload Local API**, because the Local API cannot express the claim-token predicate or per-target updates without rewriting siblings.

1. **Claim (idempotent, safe under concurrent runs).** One atomic statement, never read-then-write:

   ```sql
   UPDATE "payload"."social_posts" SET status='publishing', claim_token=$token, claimed_at=now()
   WHERE id IN (
     SELECT id FROM "payload"."social_posts"
     WHERE (status='scheduled' AND next_run_at <= now())
        OR (status='publishing' AND claimed_at < now() - ($lease * interval '1 minute'))
     ORDER BY next_run_at LIMIT $batch FOR UPDATE SKIP LOCKED)
   RETURNING id
   ```

   `$lease` is the integer minutes constant (10), cast explicitly as shown; `$batch` is `SOCIAL_CLAIM_BATCH` (5). Two overlapping cron runs cannot claim the same row. **"Post now" has its own predicate**: `publishDue({ onlyId })` uses the same statement shape but `WHERE id = $id AND status = 'scheduled'` (no `next_run_at` condition, and no lease branch), so a post scheduled for tomorrow can be posted now and a post in any other state cannot.
2. **Per target, at most once.** Before a network call the publisher runs `UPDATE social_post_targets SET status='publishing', attempts = attempts + 1 WHERE id=$target AND status='pending' AND post_id=$post` and commits. Only if one row changed does it call the adapter. If a run dies in between, the recovered post has a target still `publishing`: the outcome is unknown, so the target becomes `unknown` with the reason "The run stopped while posting; check the page before retrying", is never auto-retried, and the post is `failed` until a person resolves it. This trades a stuck post for never posting twice to the page.
3. **Re-validate before sending.** Before calling an adapter, in order:
   - the post is still `publishing` with our token (`SELECT ... WHERE id=$id AND claim_token=$token`);
   - **approval still holds:** `approvedBy` is set and `isStaffUser(approvedBy)` is true for the user as they are now (loaded fresh: exists, not disabled, role admin or editor). A demoted, disabled or deleted approver fails the target, non-retryable, with the plain reason "The person who approved this post is no longer on the committee. Review it and schedule it again." (code `approver_inactive`);
   - **content still valid:** every `spec.playerIds` player is still visible and eligible (section 1); every event still published; every sponsor still public; and **the snapshot still matches**: each `snapshot.players[i]` name equals the player's current display name and its `version` equals the player's current `updatedAt`, or at minimum the name matches (a hidden or renamed player fails). A mismatch fails the target with `content_changed` and the reason "A player's details changed since this was scheduled. Open it, check the picture and schedule it again." This also covers a merged-away player (5.1);
   - the signed image URL for the target's size renders (the renderer is called in-process once to fail early; no HTTP).

   A failed check marks the target `failed`, non-retryable, with the plain reason.
4. **Outcome.** `ok` stores `remoteId`, `remoteUrl`, `publishedAt`. `rejected` with `retryable: true`: next attempt at `now + SOCIAL_BACKOFF_MINUTES[attempts-1]` (5, 15, 45 minutes, deterministic, capped, no jitter so tests are exact); after `SOCIAL_MAX_ATTEMPTS` (3) it becomes `failed`. `rejected` non-retryable: `failed` immediately. **`unknown`: the target becomes `unknown`, never retried automatically.** `lastError` is scrubbed and cut at 300 characters; the full text is only in the server log, also scrubbed. Each of these is one `UPDATE social_post_targets ... WHERE id=$target AND status='publishing'`.
5. **Finish.** The post status is derived from its targets by the pure function in 4.4, and the claim fields are cleared in the same statement that sets the final status:

   ```sql
   UPDATE "payload"."social_posts" SET status=$derived, next_run_at=$next, finished_at=$finishedAt,
          claim_token=NULL, claimed_at=NULL
   WHERE id=$id AND claim_token=$token
   ```

   so a stale worker (one whose lease was recovered) changes zero rows and does nothing. The int test for this guard is in 4.10.
6. **Time budget.** The loop stops starting new posts at 240 seconds of the route's 300 second `maxDuration`; leftover due posts wait for the next run. Each adapter call has a 20 second `AbortSignal` timeout, which maps to `unknown` (4.5).

### 4.7 Cron route, heartbeat and signed image URL

- `GET /api/cron/social-posts` (`dynamic = 'force-dynamic'`, `maxDuration = 300`): requires `Authorization: Bearer $CRON_SECRET`. **Comparison cannot throw:** an unset or empty `CRON_SECRET` returns 401 immediately (so `Bearer undefined` can never match); otherwise both the presented token and the secret are hashed (SHA-256) and the digests, always equal length, are compared with `timingSafeEqual`; a missing or malformed header is 401. The route never returns 500 for a bad credential. It does nothing and returns `{ configured: [], claimed: 0 }` when no network is available, so a fresh club pays nothing. The response lists post ids and statuses only, no captions or errors.
- **Heartbeat.** After authorisation, on every run (even with nothing configured or due), the route writes `lastCronRunAt = now()` and updates `observedCronIntervalMinutes` (the gap since the previous run, smoothed, floor 1 minute; first run sets none) with one explicit `UPDATE` on the `social-settings` global row (server-owned fields, `update: nobodyField`). The UI never claims a frequency from configuration. It shows "Last checked N minutes ago" (or "Not checked yet" when there is no heartbeat) on the queue and next to the time picker, and a **warning** when a `scheduled` post is overdue (`nextRunAt` more than `2 x observedCronIntervalMinutes` in the past, with a 30 minute floor when no interval is observed yet) or when the last check is older than twice the observed interval: "Scheduled posts are not going out. The scheduler last checked N hours ago. Download and post by hand, or ask whoever manages the website." A schedule time earlier than the next expected check (`lastCronRunAt + observed interval`) shows "Posts go out when the scheduler next checks, about every N minutes". There is no `SOCIAL_CRON_MINUTES` env; the app only reports what it has seen.
- `vercel.json` ships a **daily** second cron entry for `/api/cron/social-posts` (`0 18 * * *`, valid on Hobby) or none; it **never ships a sub-daily schedule**, because Vercel rejects sub-daily crons on Hobby and the file is per-club config. A club on Pro, or one using an external pinger that calls the route with the bearer secret every few minutes, changes its own `vercel.json` or pinger; the docs describe both. Until a faster trigger exists the heartbeat shows daily, and the UI says posts go out on the next daily run.
- `GET /api/social/image/[postId]/[size]?exp=&sig=`: public but unguessable. `sig = HMAC-SHA256(deriveKey(socialImage), "${postId}.${size}.${revision}.${exp}")`, `exp` at most 24 hours ahead. **The signature is verified first, before any database lookup**: the HMAC is recomputed from the URL's `postId`, `size`, `revision` and `exp` (the revision is read from the URL, not the database) and compared with `timingSafeEqual` over equal-length digests; a malformed or wrong-length `sig`, a bad `size` or an `exp` in the past returns the 404 with no query, so there is no timing oracle on post ids. Only after the signature checks out does it load the post and require `post.revision` equal to the URL's revision (an edit bumps it, so old links die) and the post to be servable: status `scheduled` or `publishing`, **or** `published`/`failed` with `finishedAt` within the grace period (`SOCIAL_IMAGE_GRACE_MINUTES`, 15) so Instagram's container fetch cannot lose a race with the flip to `published` or `failed`. Otherwise the URL stays valid until `exp`. The PNG renders from `spec`, with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. Every failure returns the same plain 404. The publisher mints the URL (`lib/social/image-url.ts`); the base is `club.siteUrl` (never a request header) and Schedule is refused when it is not a public `https` URL (4.1).
- **"Post now"** (queue row action, labelled "Post now") calls `publishDue({ onlyId })` (the id predicate of 4.6 step 1) with the staff session; it does not go through the cron route. It has a **staff rate limit** (`lib/throttle.ts`, 10 per 10 minutes per user, short lock) because each call can take up to 20 s per target. The server action runs on the admin page route, so that route segment exports `maxDuration = 120` (3 targets x 20 s plus margin and render time); if Payload's admin catch-all does not honour a segment `maxDuration`, "Post now" moves to `POST /api/admin/social/post-now` with the same export (Appendix B item 4). The action re-derives the caller and applies the same approval and content re-validation as the cron.

### 4.8 Failure handling and the fallback

- Queue rows show a status chip (icon plus word), per-network lines ("Facebook: posted", "X: did not post, will retry at 6:45 pm (attempt 2 of 3)", "Instagram: did not post: the picture could not be fetched", "X: Not sure it went out. Check the page."), `lastError` in plain English from a reason map (`not_implemented`, `rate_limited`, `auth`, `media_rejected`, `network`, `unknown_outcome`, `content_changed`, `approver_inactive`), and the next action.
- **Retry** (failed targets only), **Pause (back to draft)**, **Edit**, **Delete** (drafts and posted rows; scheduled rows must be paused first), **Mark as posted** (per target; sets `manual: true`, `remoteId: 'manual'`; no pasted-link field in this wave), and **Download + copy caption**: per size Share/Download buttons and a "Copy caption" button that copies the exact stored `finalText` of the target (4.3). This fallback is always shown for a failed, unknown or unavailable target, so a missing connection never blocks the club.
- Notification centre: `notificationLines` gets `social: { failed: number; dueSoon: number; overdue: number }` (counts only, from one grouped query) and lines: "N social posts need your attention" (warn, links to `/social?tab=attention`), "N posts are scheduled for today" (info) and the overdue warning of 4.7. They respect the existing admin Home pattern and are staff-only. No new Home strip.
- Deferred (tracked in #23, not built here): "Suggested posts" (results without a post), and "Mark as posted with a pasted link".

### 4.9 UI routes summary

| Route | Audience | Notes |
| --- | --- | --- |
| `/admin/social` | staff | composer plus queue (tabs: Needs attention, Scheduled, Posted, Drafts); page route exports `maxDuration` for Post now |
| `/admin/social?post=<id>` | staff | edit a draft or scheduled post |
| `POST` server actions in `lib/social-actions.ts`: `saveDraft`, `schedule`, `pause`, `retry`, `markPosted`, `deletePost`, `postNow`, `saveCaptionSettings` | staff | each re-derives the caller, validates with a pure function, never trusts form fields for status or user |
| `/api/cron/social-posts` | CRON_SECRET | publisher and heartbeat |
| `/api/social/image/[postId]/[size]` | signed URL | network fetch |
| nothing in `/selector` or the public site | n/a | selectors do not post |

### 4.10 Tests

Unit:

- `social-status.test.ts`: every transition in 4.4 (including that pause and edit clear `approvedBy`/`approvedAt`), derived post status from every target combination including `unknown`, illegal transitions rejected.
- `social-caption.test.ts`: placeholders, missing values, unknown placeholders, per-adapter hashtag counts, X 280 counting URLs as 23, Instagram 30 tags, whitelist rejects `@`, `#`-prefixed and link text; `composeFinalText` is a pure function of its inputs (changing settings after it ran changes nothing already stored).
- `social-backoff.test.ts`: 5/15/45, cap at 3 attempts, constants come from `config/site.ts`.
- `social-image-url.test.ts`: signature round trip, tampered postId/size/revision/exp, expiry, equal-length compare used, wrong-length and non-hex `sig` do not throw, the verify function performs no DB access (called with a throwing DB stub), same 404 for all failures, grace-period logic (pure).
- `social-adapters.test.ts`: the three stubs report `isConfigured` only with their full env **and `live` is false so `configuredNetworks` never lists them even with full env**; `publish` never calls `fetch` (spy on `globalThis.fetch`); `getAdapter` returns undefined when unset; the mock honours each scripted outcome including `unknown`; `mockAllowed` matrix (4.5); `scrubSecrets` removes every configured secret value including URL-encoded forms.
- `social-cron-auth.test.ts`: unset or empty `CRON_SECRET` with `Bearer undefined`, `Bearer ` and no header all 401; a token of different length from the secret 401, no throw; correct token passes.
- `social-eligibility.test.ts`, `schedule-time.test.ts` (club-time to UTC across the DST change, quiet-hours window, past times rejected), `social-siteurl.test.ts` (https public accepted; http, localhost, loopback, private IP rejected).
- `no-brand-hex` / staff-guard extensions as in section 1.

Integration (`tests/int/social-posts.int.test.ts`, `social-publisher.int.test.ts`, `social-cron-route.int.test.ts`):

- **Concurrency:** 5 due posts and 4 concurrent `publishDue` calls (Promise.all) with the mock adapter: each post is published exactly once (mock call count per post = 1), no `publishing` rows left, claims never overlap.
- **`claim_token` guards the final write:** a worker claims a post, its lease is recovered by a second worker (claim older than the lease), the first worker then calls finish with its stale token: zero rows change and the second worker's status and token are intact. A finish with the right token changes exactly one row and clears the claim fields.
- **Per-target SQL does not disturb siblings:** transitioning one target leaves the other targets' row ids and fields unchanged (the property the array design lacked).
- **Lease recovery:** a row `publishing` with an old `claimed_at` and a target `publishing` becomes `unknown`/`failed` and the mock is not called; a row with all targets `pending` is re-claimed and published.
- **Backoff and retries:** mock fails with rejected-retryable twice then succeeds, with a controllable clock: `nextAttemptAt` follows 5, 15; a third failure gives `failed` with the scrubbed reason; "Retry" resets attempts for failed targets only and never re-sends a published target.
- **Unknown outcome:** mock returns `unknown` (and a timeout via a slow mock with a short signal): the target is `unknown`, the mock is called once, never again by later cron runs, and the post is `failed` until a person resolves it.
- **Per-network independence:** Facebook-like mock succeeds, X-like mock fails: the post stays retryable for X only, the first is not called again.
- **Re-validation:** hiding a player, renaming a player, a junior losing `socialOptIn`, or unpublishing an event after scheduling makes the target fail with `content_changed`, no adapter call; a player merged away the same.
- **Approver still active:** demote the approving editor to a selector (or disable them) after scheduling: the due post's targets fail with `approver_inactive`, no adapter call; an admin or editor approver still publishes; an edit and pause clear `approvedBy`/`approvedAt`.
- **Frozen text:** change `signOff`, hashtags and templates after Schedule: the adapter receives the original `finalText`; editing and rescheduling recomposes.
- **Post now:** works for a post scheduled in the future, refuses a draft or already posted row, and is rate limited.
- **Approval:** an anonymous caller, a selector and a disabled admin cannot call any action (each returns the staff-only error and writes nothing); an editor can; `createdBy`/`approvedBy` come from the session even if the form sends other ids. Schedule is refused for a stub network, for no live network, for a non-https `siteUrl`, and for an ineligible junior.
- **Access matrix:** REST `find`, `findByID`, `create`, `update`, `delete` on `social-posts` and `social-post-targets` for anonymous, selector, editor, admin per the table in 4.4; `claimToken`, `claimedAt` never returned to anyone; REST `where` on `claimToken` returns no match (field access); the heartbeat fields are not writable over REST.
- **Cron route:** no secret, wrong secret, unset `CRON_SECRET` all 401 with no work done and no heartbeat; correct secret with nothing due returns 200, claims 0 and writes the heartbeat; with no available network and no mock returns `configured: []` and does not touch posts; the overdue warning appears when a scheduled post is overdue by more than twice the observed interval.
- **Signed image route:** valid signature serves a PNG for a `scheduled` post; for a `published` post it still serves within the 15 minute grace and 404s after; 404 after an edit bumps `revision`; 404 for a tampered or expired link; a bad signature causes no database query (query counter).
- **No outbound calls:** a global `fetch` spy fails the test on any call except to the explicitly allowed configured local or Blob media host (3.4), throughout the int suite for these files.

### 4.11 Seed (`seed:demo`)

Add `social-posts` with targets: one draft, two scheduled (one due in the past so a local `GET /api/cron/social-posts` with the bearer header publishes it through the mock), one posted with manual remote ids, one failed with a plain-English reason and a retryable target, and one with an `unknown` target. Idempotent by a hidden `title` key. The seed enables the mock only in the demo `.env.local` documentation, not in code.

### 4.12 Acceptance (local, no external calls)

1. Migrate and `seed:demo`; set `SOCIAL_MOCK_NETWORK=yes` and `CRON_SECRET=local-test` in the shell (not in a committed file).
2. Open Social posts as an editor: the queue shows the seeded rows and the Test network is the only network offered (Facebook, Instagram and X show "not available yet" even if their env is filled in).
3. Compose a result, schedule it for 2 minutes ahead (note `siteUrl` must be a public https address; for local acceptance use the test override of the site-URL check, which exists only when `NODE_ENV !== 'production'`), run `curl -H "Authorization: Bearer local-test" localhost:41xx/api/cron/social-posts` after it is due: the row moves to Posted with a mock remote id and the queue shows "Last checked 0 minutes ago". Run the curl twice in parallel: still one mock post.
4. Make the mock fail (the seeded failing post): the row shows the reason and the next attempt time; Retry; Mark as posted; the unknown post shows "Not sure it went out. Check the page."; Share, Download and Copy caption work with no network configured.
5. Unset the mock: the composer says "not available yet" and the fallback is the only path; Schedule is disabled with a clear reason.
6. Demote the approving editor and run the cron: the post fails with the approver message.

### 4.13 Risks

- **Double posting.** The biggest risk. Mitigations: `FOR UPDATE SKIP LOCKED` claim, per-target at-most-once with the `unknown` state for timeouts, 5xx and drops instead of blind retry, claim token on finish, explicit SQL for the write path, concurrency and token int tests.
- **Token leakage.** Adapter errors can echo request bodies or headers. Mitigation: `scrubSecrets`, 300-character cap, no secret in any DB field, no secret in the admin, `.env.local` stays local.
- **Signed URL as a public image.** It exposes one approved graphic until `exp` (at most 24 hours) or the end of the 15 minute post-publish grace, to anyone holding the link, the same as posting it. It is revoked on edit. The URL contains no personal data beyond the graphic. Verification happens before any lookup.
- **Stub adapters are not a working product.** Documented in the feature doc under "Not included": until the live calls are built the stubs are not schedulable (`live: false`); the queue publishes to the Test network or to nothing, and the fallback covers real use. The cron route does nothing when nothing is available.
- **Cron frequency.** The app does not assume a frequency. It records a heartbeat and shows when it last checked and warns when posts are overdue by more than twice the observed interval. A daily schedule makes "post at 6:30 pm" go out at the next daily run, and the UI says so. Decision in section 6.
- **Children's names.** Name-bearing graphics are gated by `isSocialEligible` at compose, schedule and publish (section 1).
- **Caption copy.** Default templates are generic; clubs edit them in settings. No club name is hard-coded.

## 5. Cross-cutting

### 5.1 Files and verification

New code lives in `lib/social/**`, `lib/social-queries.ts`, `lib/social-actions.ts`, `components/social/**`, `payload/globals/SocialSettings.ts`, `payload/collections/SocialPosts.ts`, `payload/collections/SocialPostTargets.ts`, `payload/components/SocialView.tsx`, `payload/endpoints/social.ts` (if an endpoint is needed instead of a server action), `app/api/admin/social/**`, `app/api/social/image/**`, `app/api/cron/social-posts/route.ts`. Also edited: `payload.config.ts` (global, collections, view), the players collection (`socialOptIn`, `isJunior`), `payload/admin/navigation.ts`, `next.config.ts` (`outputFileTracingIncludes` for the image routes), `vercel.json` (daily entry only), `.env.example`, `config/site.ts` (generic constants: sizes, queue constants), `lib/theme/og.tsx` (`BLACK`, `loadImageDataUri`), `lib/admin/notifications.ts`, `payload/admin/copy.ts`, `payload/admin/helpContent.ts`, docs and tests.

**Player merges.** Merges (`duplicate-players-and-undo`) are undoable, and rewriting ids inside the JSON `spec` would need undo-log support that `merge-core` does not have, so this wave does not touch merge code. The safe behaviour already exists: if a player in a scheduled spec is merged away, the 4.6 step 3 re-validation fails the target with `content_changed` and a person re-opens and reschedules it.

Final verify (once, at the end of WP-2): `pnpm tsc --noEmit`, `pnpm lint`, full `pnpm test`, `pnpm test:int`, `pnpm check:generated`, `pnpm check:migrations`, one `pnpm build`, and a manual run of the acceptance lists.

## 6. Decisions and credentials needed from outside the code

Build to the seam; do not fake. None of these blocks WP-1 or the queue and fallback in WP-2.

1. **Cron frequency.** The queue works best with a run at least every 10 minutes. Vercel Hobby allows only daily crons (so the shipped `vercel.json` has a daily entry at most); Pro allows frequent ones. Alternatives: an external pinger hitting the route with the bearer secret. Decision for the club: upgrade, ping externally, or accept daily and rely on the download-and-copy fallback. The app's heartbeat (4.7) tells the committee which one is actually in effect.
2. **Facebook Page.** A Meta app with a Page access token that can post photos (page publishing permissions need Meta app review for production use), the Page id. Separate from the selector sign-in app. The `FACEBOOK_PAGE_*` env contract is defined; the live call is not written and `live` stays false.
3. **Instagram.** A professional (business or creator) account linked to the Page, and the Instagram content publishing permission; image must be a public URL (the signed URL). Story publishing needs the stories endpoint and is not assumed.
4. **X.** An X developer project; writing posts and uploading media need a paid API tier at the time of writing. The club decides whether to pay.
5. **Human approval.** Default is "scheduling is the approval", re-checked at publish time (the approver must still be staff). If the club wants a second person to approve, add an `awaiting approval` status and a `social_approver` setting later (section 4.4 does not preclude it).
6. **Where credentials live.** Vercel project env (Sensitive) only; never `.env.local`, never the database. Token expiry (Meta page tokens, X tokens) is the club's renewal job; the queue shows "auth" failures with that hint.
7. **Sponsor logo formats.** PNG/JPEG only draw. Whether to convert WebP uploads at upload time (media pipeline change) or just tell the committee is left to the club; this spec only warns.
8. **Juniors.** Whether the club holds dates of birth, uses a junior flag or a junior grade category decides how `isJunior` is fed (Appendix B item 6). The opt-in is the club's call per child; the app only enforces it.

## Appendix A. Decisions worth challenging

1. **One new global rather than extending `theme` or `club`.** The theme is public-read and "site look"; captions, hashtags and policy are not styling and should not be public. The cost is a global that admits editors with field-level restriction on the styling fields (field access narrows, never widens, global access).
2. **Three styles composed from primitives rather than 81 layouts.** Gains consistency and theme safety; loses bespoke type-specific art. A fourth style is one `StyleKit`.
3. **POTM is staff-picked, from that match's players.** Reading the vote winner would break Wave B's privacy rule; the cost is one extra click.
4. **Snapshot at schedule time, frozen `finalText`.** Safe and exact, but a post about a game that gets corrected later stays as approved until edited. The hidden-player, renamed-player, ineligible-player and unpublished-event checks cover the harmful cases.
5. **Stubs with `live: false`, not simulated adapters.** A mock that reports "published" in production would be worse than nothing, and a stub a club could schedule to would fail by design, so the real three refuse and are not offered.
6. **`unknown` instead of auto-retry after a timeout or crash.** Occasional manual work in exchange for never double posting.
7. **Composer in the admin, not the selector area.** Selectors pick teams; posting to the club's public voice is committee work and needs staff-only access.
8. **Targets as a collection and raw SQL for the publisher.** More tables than an array field, but the only way to get per-target transitions and a token-guarded finish.
9. **Heartbeat instead of a declared frequency.** The app reports what it observed; it cannot promise what the host will do.

## Appendix B. Verify list (settle during implementation, in order)

1. What a stored match gives for margin and result text (`StoredMatch.match`, `Game.club.outcome`, scores) and whether a ready-made "won by N runs" string exists or must be derived (pure function with tests); and which stored-match rows identify "players in the game" for the POTM check.
2. Whether `ImageResponse` in this Next version supports the 1080x1920 size within the function memory limit when sponsor logos are loaded; measure on the render test.
3. Whether Payload's drizzle adapter exposes the table names `social_posts` and `social_post_targets` as expected for the explicit SQL (check the generated migration `.json`), and that `FOR UPDATE SKIP LOCKED` works on the local Postgres version.
4. Whether the Payload admin catch-all route honours a segment `maxDuration` export for the "Post now" server action; if not, use the `POST /api/admin/social/post-now` route handler (4.7).
5. How `payload.config.ts` registers a custom view and global together with `importMap` (the `approvals` view is the model) and that `pnpm generate` captures it.
6. Which existing player data identifies juniors (date of birth, grade category, a team category), which of the flag/DOB/category inputs `isJunior` needs, and whether `socialOptIn` and `isJunior` fit the existing players schema without touching sync (PlayHQ-sourced fields must not be overwritten by the sync).
7. The exact `jobTiles` and `everydayNav` counts in `tests/admin-visibility.test.ts` before the cap changes from 13 to 14.
8. Whether `instrumentation.ts` is the right place for the mock-in-production refusal (it already refuses missing env).
9. Whether a global row update from the cron (heartbeat) is best done by raw SQL on the global table or by a tiny dedicated table, given global versioning.

## Appendix C. Risks (summary)

Double posting (4.13), leaked tokens, render cost and satori overflow (3.11), cron frequency (section 6.1, heartbeat in 4.7), stub adapters being mistaken for a finished integration (not schedulable, documented), children's names on social networks (section 1), sponsor logo formats, and the menu cap (solved by the Advanced entry plus a tile cap of 14).

## Appendix D. Review resolution

Every point of the review was applied; the notes below record where it was refined or where the arithmetic supersedes a number.

| # | Outcome |
| --- | --- |
| 1 | Applied: `live: false` on stubs, `configuredNetworks` requires `live && isConfigured` (4.1, 4.5). |
| 2 | Applied: daily entry or none, never sub-daily (4.7, section 6.1). |
| 3 | Applied: heartbeat, "last checked N minutes ago", overdue at twice the observed interval, env var dropped (4.7). |
| 4 | Applied: `finalText` per target at Schedule (4.3, 4.4). |
| 5 | Applied with a refinement: `unknown` for timeouts, aborts, 5xx and post-send drops; `rejected` for provable non-acceptance, where only transient causes (429, pre-send connection failure) auto-retry and auth/validation/4xx are failed with a manual Retry, since retrying a bad token on a timer is pointless. `idempotencyKey` removed (4.5). |
| 6 | Applied: targets are their own hidden collection and the publisher uses explicit SQL for claim, per-target transitions and finish; token-guard int test added (4.4, 4.6, 4.10). |
| 7 | Applied: hash-then-compare, unset secret 401 (4.7). |
| 8 | Applied: id-and-`scheduled` predicate, staff rate limit, `maxDuration` on the hosting route with a route-handler fallback (4.6, 4.7). |
| 9 | Applied: re-check `isStaffUser(approvedBy)`; edit/pause clear approval (4.4, 4.6). |
| 10 | Applied: guarantee scoped to solid colours; `textMuted` derived and verified; scrim from tokens, tested over worst-case photo values (3.2). |
| 11 | Applied. Per type it is 3 x 3 = 9. The first draft's 108 matched 12 types; after the cuts of item 18 (9 types) the render test is 81. |
| 12 | Applied: composer lineup uses the new renderer in all sizes; the two public/selector routes are untouched (3.7). |
| 13 | Applied: stated rule, `isSocialEligible`, enforcement at compose, schedule and publish, tests (section 1). How a junior is identified depends on existing data; settled in Appendix B item 6 and fails closed. |
| 14 | Applied: picker and loader constrained to players in the stored match; stat line 80-character rule (3.1). |
| 15 | Applied: 300 per 10 minutes per user, 60 s lock, one size rendered at a time (3.5, 3.7). |
| 16 | Applied: size tabs, Web Share with download fallback, plain-English labels, reason for the quiet-hours tick (3.5, 4.2). |
| 17 | Applied with a correction: Payload field access can only narrow collection/global access, so the global admits staff and the styling fields are admin-only per field (3.3). |
| 18 | Applied: `typeStyles`, `resolveStyle` levels, `hashtagsPerNetwork`, `networks[]` and the env knobs removed (constants in `config/site.ts`); `toss` dropped; `scorecard` and `round-results` folded into `result` modes; suggested posts and pasted-link deferred. |
| 19 | Applied: former 5.1 and Appendix B item 5 deleted; the `content_changed` re-validation is the safe path (5.1). |
| 20 | Applied: snapshot name and version compared at publish (4.4, 4.6). |
| 21 | Applied: 15 minute post-publish grace, signature before DB lookup, public https `siteUrl` check (4.1, 4.7). |
| 22 | Applied: `mockAllowed` with `SOCIAL_MOCK_ALLOW_PROD_DEMO`, tested (4.5). |
| 23 | Applied: tile cap raised to 14, `apparel` stays (3.6). |
| 24 | Applied: 2 s timeout, `url + updatedAt` key, Next data cache for cold instances, explicit media-host allowance in the spy (3.4). |
| 25 | Applied: port override noted in section 1; interval cast in the claim SQL (4.6). |

Rejected findings: none. Point 10's first bullet ("4.58:1 is correct") needed no change beyond scoping it to solid colours.
