# BetterStats feature set for Lang Lang: design

Date: 2026-10-03. Branch: `feat/payload-cms`. Builds on `2026-10-03-payload-cms-migration-design.md` (Local API behind `lib/*-queries`, `club` global, `payload/` layout, access model) and `2026-09-30-players-design.md`. Visual system: `DESIGN.md` (PageHeader, SectionHeading sub-section variant, `card-static`, shadcn `Table` inside `card-static`, `segmented-pill`, `count-pill`, `empty-state`, `container-site`). No new design tokens, no new runtime dependency.

Source inventory: BetterStats `/modules/betterstats` (captured in `research.md`, scratchpad). This spec decides which of those features Lang Lang can build honestly.

## 1. Data reality (what is actually derivable)

Stored (collection `player-seasons`, one row per player x PlayHQ team, rewritten by the nightly sync in `lib/players/sync.ts`): `seasonName`, `seasonOrder` (0 = newest senior season group the sync produced; see fact 9 for how "current" is defined), `teamId`, `teamName`, `gradeName`, `games`, `batInnings`, `batNotOuts`, `batRuns`, `batHighScore` (+`batHighScoreNotOut`), `batBalls`, `batFours`, `batSixes`, `bowlBalls`, `bowlMaidens`, `bowlRuns`, `bowlWickets`, `bowlBestWickets`, `bowlBestRuns`, `catches`. Plus `players` (name, photo, bio, `hidden`, `honours[] {years,title}`), `player-aliases`.

Facts that constrain design:

1. **Mostly senior.** `collectSeniorAggregates()` skips teams that are junior (`team.isJunior`), whose competition matches `isJuniorCompetition` (`junior|u1\d|girls|winter`) or whose grade matches `isJuniorGrade` (`u1\d|under`). Grades that match neither (for example a "Boys" or "Youth" grade in a competition not named junior) are NOT filtered and can be stored, so junior rows are unlikely but not impossible. The "include juniors" toggle is built, driven by classification, and hidden when the data set holds no rows in that category (conditional, not assumed dormant). Women's, masters and mixed appear only if the club's PlayHQ senior competitions contain such grades. Note the Winter season in the PlayHQ fixtures is treated as junior by `isJuniorCompetition` and is therefore not stored.
2. **Aggregates only, no per-match rows.** The sync fetches every FINAL scorecard (`getGameSummary`) and discards it after `aggregatePlayers`. Scorecards for display come live from PlayHQ (`lib/playhq`, TTL cached) and only for seasons PlayHQ still lists.
3. **`batHighScore` and `bowlBestWickets` are single values per row**, so counts of 50s, 100s, ducks and 5-fors are really not derivable. What is derivable is a boolean: "has ever scored 100+" (`highScore >= 100`) and "has ever taken 5+ in an innings" (`bestWickets >= 5`). Badges are named and worded exactly that way. A merged career or season `highScore` and best figures must come from `combineCounts` (max with not-out tie-break, best-of figures), never from a sum.
4. Catches are stored; run-outs and stumpings are not.
5. A player can have several rows per season (one per team). Every season-scoped stat first merges rows by `(player, seasonName)` with `combineCounts` (`lib/players/season-math.ts`, already handles best-of high score and best figures).
6. `batBalls` may be 0 for old/partial data: strike rate returns `null` (existing `battingAverages`), and qualification for SR requires minimum balls.
7. **Coverage window (the main honesty constraint).** Rows exist only for seasons PlayHQ still lists. `tests/fixtures/playhq/seasons.json` shows Summer 2023/24 to Summer 2026/27 (plus a Winter season treated as junior), and `collectSeniorAggregates` can only build rows from listed seasons. Pre-PlayHQ history exists in the club's life (the `yearsLabel` code falls back to `manualYears` for it) but not in `player-seasons`. Consequently "career" in this spec means "since 2023/24" (the earliest stored `seasonName`, computed from data, not hard-coded). Every surface that says career must say so: table captions, the records heading and a coverage line ("Records cover seasons from 2023/24; earlier history is not in the database"), and the milestone strip. See 3.6 for how milestones avoid undercounting veterans.
8. Honours are free text `{years, title}`; there is no honour type or numeric year. Categorisation is keyword-based and best effort.
9. **"Current season" is data-defined.** Summer 2026/27 is UPCOMING in the fixtures and `sync.ts` skips teams with no stats, so the newest PlayHQ season group may have no rows and `seasonOrder === 0` is not guaranteed to hold rows. Everywhere this spec says "current" or "newest" (NEW record badge, yearbook current season, milestone "reached in") it means the lowest `seasonOrder` that actually has rows in the cached data (helper `currentSeasonOrder(rows)`), or the PlayHQ ACTIVE season when one has rows; never a literal `seasonOrder === 0`.
10. **Per-match context that does exist in PlayHQ models (but is not stored).** `Scorecard.teams` and `Game.opponent` carry opposition; the mapped scorecard has `displayOrder`, but `Innings` does not store it, so Tier B sync would need to carry it. `Innings.fallOfWickets` is `{wicket, runs, name}` (the dismissed batter only).

## 2. Decision: Tier A (build) and Tier B (deferred)

### Tier A: built from existing data

| # | Feature | Route / surface | Notes |
|---|---|---|---|
| A1 | Grade-category classification | `lib/stats/categories.ts`, site-settings | senior / junior / womens / masters / mixed from `gradeName` first, `teamName` only as fallback (precedence in 3.1) |
| A2 | Leaderboards | `/stats` | batting: runs, average, high score, sixes, fours, strike rate; bowling: wickets, economy, average, best figures, maidens; fielding: catches; also games. Filters season + grade + scope (since-2023/24 totals or single season). Rank badges 1/2/3 as text and numerals. |
| A3 | Club records | `/records` | since-2023/24 and single-season bests from aggregates, coverage period stated; NEW badge for the data-defined current season |
| A4 | Profile upgrades | `/players/[slug]` | progression charts (inline SVG), best/worst season highlight, milestone badges, rank badges, junior toggle (`?juniors=1`) |
| A5 | Player comparison | `/players/compare?a=&b=` | shareable URL |
| A6 | Shareable stat cards | `/api/public/players/[slug]/card` (`next/og` ImageResponse) + share button | also OG image for profile |
| A7 | Honour board | `/honours` | aggregates existing `players.honours` by title and year |
| A8 | Milestone tracker | public strip on `/players` and `/stats`, admin Dashboard widget | players approaching 100 games / 1000 runs / 100 wickets etc. |
| A9 | Season yearbooks | `/yearbooks`, `/yearbooks/[season]` | new `yearbooks` collection (editorial), auto-filled stats; print stylesheet |
| A10 | Match archive | `/matches` | PlayHQ games by season + grade, links to existing `/fixtures/[gameId]` scorecard route |
| A11 | StatLab-lite | `/statlab`, `/statlab/export` | column picker, filters, sort, thresholds, presets, CSV; saved reports = URL query string only |
| A12 | Shell | nav, footer, sitemap, JSON-LD, club `pageCopy`, SEO pages, revalidation, tests | |

Added by honest derivation (no new data): "Centurion" (has ever scored 100+) and "Five-wicket haul" (has ever taken 5+ in an innings) badges (`highScore >= 100` / `bestWickets >= 5`), "most seasons played (since 2023/24)" record, "reached in season X" for milestones (cumulative sum over seasons, only where baseline allows, see 3.6).

### Tier B: deferred (needs per-match storage)

Common prerequisite: a `player-innings` collection (or drizzle table like `player_seasons`) populated by the sync from the scorecards it already downloads (`Scorecard.innings[].batting/bowling`, `fallOfWickets`, `dismissal` text, `players`), so no extra PlayHQ API cost. Pre-PlayHQ history would need CSV import.

| Feature | Data needed |
|---|---|
| 50s / 100s / ducks / 5-fors counts and leaderboards | per innings: runs, notOut; per spell: wickets |
| Dismissal breakdown chart | per innings: dismissal kind (parse existing `dismissalText` or store PlayHQ event type), bowler, fielder |
| Run-outs, stumpings leaderboards | fielder per dismissal event (not just catches) |
| Opposition analysis, opposition history in compare | opponent per game (exists in `Scorecard.teams` / `Game.opponent`, not stored per player; needs per-innings rows) |
| Batting position analysis | `displayOrder` per innings (mapped in the scorecard but not stored in `Innings`; the sync must carry it) |
| Partnerships and partnership records | Not directly derivable. `fallOfWickets` is `{wicket, runs, name}` and names only the dismissed batter; the not-out partner is unidentified, and raw periods carry only `appearanceId`/`sequenceNo`. Tier B would derive pairs from batting order plus `fallOfWickets` with the partner inferred (approximate, flagged as such), or drop partnership records entirely |
| Best economy/average by spell, best innings figures list | per-spell overs/runs/wickets (records page then shows only the single best per player we already know) |
| Recent-form view (last N innings) | dated innings rows |
| Per-match links from profiles | `gameId` per innings row |
| Team records (biggest win, highest total) | per-game team totals (only partly live via PlayHQ today) |
| Grade rename / merge admin tools, CSV stats import | N/A to this phase; grade classification rules (A1) cover the display need |

Features NOT in BetterStats-for-Lang-Lang scope: AI narrative, notification centre, multi-club white-label, 200+ presets (we ship about 12).

## 3. Architecture

### 3.1 Layering

- `lib/stats/*` pure TypeScript, no Payload/React imports, unit-tested:
  - `categories.ts`: `GradeCategory = 'senior'|'junior'|'womens'|'masters'|'mixed'`; `classifyGrade(gradeName, teamName, rules)`. Rules are anchored with word boundaries so "Thunder" never matches `under`: junior `/\b(u\s?-?1\d|under\s?-?1\d|juniors?|girls|boys|youth)\b/i`, womens `/\b(women'?s?|ladies|womens)\b/i`, masters `/\b(masters?|over\s?-?\d{2}s?|o\s?-?\d{2}s?|vets?|veterans?)\b/i`, mixed `/\bmixed\b/i`; anything else senior. Bare `\bw\b` is dropped as brittle. Precedence: apply rules to `gradeName` first; only when `gradeName` is empty or yields senior-by-default, repeat on `teamName`. Within one string the order is junior, then womens, then masters, then mixed, so "Women's Under 16" is junior. The junior pattern and the sync's `isJuniorGrade` (`u1\d|under`) and `isJuniorCompetition` (`junior|u1\d|girls|winter`) are defined once in a shared pure constant module (`lib/playhq/junior-rules.ts`, no `server-only`) that both the sync and `categories.ts` import, so they cannot drift; `boys`/`youth` are added to that shared constant deliberately and noted as a sync behaviour change (it only widens the junior filter). The classification matrix (Thunder, Women's Under 16, Over 40s, O35, Masters, A Grade, Boys, Mixed T20, empty gradeName with team fallback) is unit-tested.
  - `aggregate.ts`: `mergeBySeason(rows)`, `careerOf(rows)`, built on `combineCounts`/`pickCounts`.
  - `metrics.ts`: metric registry `{key, label, group, value(counts)->number|null, format, higherIsBetter, qualifier}`. Used by leaderboards, records, StatLab, compare, so one definition of each stat.
  - `qualify.ts`: minimum thresholds (section 3.3).
  - `rank.ts`: `rankBy(rows, metric, {min})` with competition ranking (ties share rank) and `badgeFor(rank)` (1 gold, 2 silver, 3 bronze).
  - `records.ts`, `milestones.ts`, `progression.ts` (per-season series for charts), `honours.ts`, `query-string.ts` (StatLab/leaderboard params parse + serialise, whitelist-validated), `csv.ts` (RFC 4180 + formula-injection guard, see A11), `season-window.ts` (`currentSeasonOrder`, coverage period).
- `lib/stats/queries.ts` (`server-only`): the only Payload access. `getVisibleStatRows()` = one `payload.find` on `player-seasons` with `pagination:false`, `depth:0`, `select` of count fields plus `player`, and a `where: { 'player.hidden': { equals: false } }`, joined in memory with a `players` find (`hidden:false`, `joins:false`, select name/slug/photo). Public queries state their own hidden filter (Local API runs with overrideAccess). Caching rules:
  - **Size.** `unstable_cache` entries are capped at about 2MB on Vercel and a few thousand rows with about 20 count fields plus player data can approach that. The cached value is a slim columnar shape (`{ cols: string[], rows: number[][] }` plus a small player table), not raw Payload docs, and is cached per season (`['stat-rows', seasonName]`, with a small cached season index), so no entry nears the cap. Derived merged tables (per-season merged rows; the since-window career table) are computed from those and memoised in-process by `(cacheVersion, params)` where `cacheVersion` is a counter bumped when the tag is revalidated (or the latest `player-sync-runs` finish time).
  - **Per-request cost.** Per request: merge by `(player, season)` over a few thousand rows, then rank over at most about 25 metrics for the requested view. This is O(rows x metrics), a few ms, acceptable; memoised leaderboards make repeat hits free within an instance.
  - **Admin widget** (A8) never reads the public cache entry. It calls a separate `getAllStatRowsForAdmin()` (uncached or its own tag, explicit `hidden` not filtered) and is only imported from `payload/components`.
  - **Export and card** read the same visible-only cached rows as pages.
  - **Page rendering mode.** Pages use `export const revalidate = 900` (matching `/fixtures/[gameId]`) rather than `force-dynamic`, because they read tag-cached data and take `searchParams`; where `searchParams` forces dynamic rendering, the data layer cache provides the speed. The choice is made once per route and recorded in a code comment; the two are not mixed ad hoc.
- `lib/yearbooks-queries.ts`, `lib/matches-queries.ts`: yearbooks via Payload; matches via `lib/playhq` (`getSeasonGroups`, `getClubGames`).
- Pages are server components under `app/(frontend)/...` (rendering mode per the cache rules above), state in `searchParams` (no client state beyond pickers and the share button). Segmented-pill navigation renders as links with `aria-current="page"`, not as an ARIA tablist (there are no tab panels).

### 3.2 Grade-category configuration

`site-settings` gains a `stats` group (migration):

- `defaultIncludedCategories`: select hasMany, default `['senior','womens','masters','mixed']` (juniors off, matching BetterStats default).
- `gradeRules`: array `{ category, pattern, flags default 'i' }`, prepended to the built-in defaults; `pattern` validated as a compilable regex (validate fn, max length 100) to prevent ReDoS-style or invalid input.
- Qualification overrides (3.3), milestone thresholds (3.6).

Page-level override: `?cat=senior,womens` (whitelist-validated) and `?juniors=1` shorthand adds `junior`. Categories with zero rows are not offered in the UI. Settings read through `lib/site-settings.ts` (extend `site-settings-core.ts` defaults so it works before the global is saved, same as `sponsorCarouselTiers`).

### 3.3 Qualification minimums (scaled to Lang Lang)

Assumption to verify, not a fact: Lang Lang plays roughly 15 to 20 games a season per team across about 3 senior teams. BetterStats' 500 runs / 100 overs / 50 wickets would likely leave leaderboards empty. Before hardcoding defaults, WP-A runs a check query over the real `player-seasons` data (distribution of games per player-season, number of senior teams, how many players pass each threshold) and sets the defaults from it; the table below is the starting proposal. Because career data only spans the coverage window (fact 7), career minimums are set against 2023/24 onwards, not a full playing career. Defaults (editable in site-settings):

| Metric | Since-2023/24 scope | Single-season scope |
|---|---|---|
| Batting average | >= 300 runs and >= 8 innings | >= 100 runs and >= 5 innings |
| Strike rate | >= 300 balls faced | >= 100 balls |
| Bowling average | >= 25 wickets | >= 8 wickets |
| Economy | >= 300 balls bowled (50 overs) | >= 120 balls (20 overs) |
| Counting stats (runs, wickets, catches, sixes, fours, maidens, games, high score, best figures) | >= 1 | >= 1 |

Rows below the minimum are listed under a collapsed "Not enough data yet" note, never ranked. Thresholds shown in the table caption (accessibility + transparency).

### 3.4 Caching and revalidation

`revalidatePlayerPages()` in `lib/players/sync.ts` additionally calls `revalidateTag('player-stats', <profile>)` and `revalidatePath` for `/stats`, `/records`, `/honours`, `/statlab`, `/yearbooks`. These calls throw outside a Next request (`payload run` scripts, ETL, tests), so they go inside the same try/catch that already wraps `revalidatePlayerPages`, and a failure is swallowed (logged at debug). The second argument is the cache-life profile: confirm against the installed Next version (16.3.8) that `'max'` is accepted by `revalidateTag` before use, and adjust (or use `updateTag` in server actions) per the installed docs. Players `afterChange/afterDelete` hooks add the tag (hidden/honours changes) and also `revalidatePath` the player's card path `/api/public/players/<slug>/card` (A6). Yearbooks hooks revalidate `/yearbooks` and `/yearbooks/[slug]`. Verify the repo's Next cache mode before choosing `unstable_cache` vs `'use cache'` (the repo currently uses `force-dynamic` pages plus tag-based fetch caches for PlayHQ); the tag name is the contract, not the API.

### 3.5 Visual components (`components/stats/*`)

`StatsSubNav` (segmented-pill row: Leaderboards, Records, Honours, StatLab, Yearbooks, Matches), `LeaderboardTable` (shadcn `Table` in `card-static`, sr-only caption, `tabular-nums`, rank badge), `RankBadge` (numeral plus ordinal text, position conveys rank; tints only from existing tokens: gold-deep for 1, grey for 2, charcoal for 3; no bronze or other second hue, DESIGN.md "one accent hue and its tints"), `FilterBar` (native selects + `segmented-pill`, GET form so it works without JS). Overflow: `segmented-pill` has `min-h-11` and no overflow handling, and Batting/Bowling/Fielding/Games plus about 12 metric links plus sub-nav links will overflow at 375px. Below `sm` the metric list is a native `<select>` (auto-submitting through the GET form with a visible Apply button for no-JS), and the group tabs and sub-nav sit in an `overflow-x-auto` scroller inside `container-site` so the page itself never scrolls horizontally, `MilestoneStrip`, `ProgressionChart` (server-rendered inline SVG: polyline/bars coloured with `currentColor` and existing CSS-variable tokens only, no hex and no added chart colours; `role="img"`, `<title>`/`<desc>`, adjacent data table in `<details>`), `SeasonTable` extension (best cell `bg-brand-gold-pale`, worst cell `text-brand-grey` (a token, no raw colour), plus a text marker so colour is not the only cue), `ShareButton` (client; `navigator.share` with copy-link fallback), `PrintStyles` (yearbook `@media print` block in `globals.css`, scoped under a `.yearbook-print` wrapper class so no other page is affected).

### 3.6 Milestones

Config `milestoneThresholds` default `{ games: [50,100,150,200,250], runs: [500,1000,2000,3000,5000], wickets: [25,50,100,150,200], catches: [25,50,100] }` and `approachWindow` default `{ games: 5, runs: 100, wickets: 10, catches: 5 }` (editable). `milestones.ts` returns, per player, `achieved[]` (with "reached in <season>" by cumulative sums over seasons in the data; season-level granularity only) and `approaching[]` (next threshold within window, remaining count). **Coverage guard (fact 7).** Totals only cover seasons since 2023/24, so a veteran's "games" or "runs" is an undercount and "approaching 100 games" would be wrong. Two mechanisms, both implemented: (a) an optional per-player "pre-PlayHQ baseline" on `players` (`baselineGames`, `baselineRuns`, `baselineWickets`, `baselineCatches`, number fields, admin-only edit, default 0, added in the WP-B migration; additive to the stored totals before milestone maths, and "reached in" is only computed when the baseline is 0 or the threshold is crossed within the stored window); and (b) when no baseline is set and `manualYears` indicates earlier history (a start year before the earliest stored season, parsed by the same year logic as `yearsLabel`), the player is excluded from the approaching list and achieved milestones are labelled "since 2023/24". The milestone strip heading says "Milestones (since 2023/24 unless a baseline is recorded)". The seed (section 7) includes one veteran with `manualYears` earlier than the window to exercise this. Public strip shows active (`isActive`) players only; admin Dashboard widget (`payload/components/Dashboard.tsx` + `dashboardCards.ts` neighbour, server component calling the same lib) shows all, including remaining counts and a link to the player admin page. Note: data updates after nightly sync, so "approaching" is as of last sync (shown as "as of" using the latest `player-sync-runs` finish time).

## 4. Feature details

### A2 Leaderboards `/stats`
Params: `season` (`all` default = since-window totals, captioned "since 2023/24", or a `seasonName` validated against known season names), `grade` (a `gradeName` or `all`), `cat`, `juniors`, `metric` (default `runs`), `scope` implied by season. Tabs: Batting / Bowling / Fielding / Games rendered as `segmented-pill` links. Top 10 per metric on the hub view (cards), full list (top 50) per metric via `?metric=`. Ties share a rank. Rank badges for 1/2/3. Player name links to profile. Empty state when filters yield no rows. When `grade` is set, rows are filtered before merge (a player's stats in that grade only).

### A3 Records `/records`
Since 2023/24 (the coverage window, stated in the heading and a coverage line): runs, highest score (with `*`), best average (min qual), sixes, fours, games, most seasons played (since 2023/24), wickets, best bowling figures, maidens, best economy (qual), catches. Single season (merge by `(player, seasonName)`): runs, highest score, wickets, best figures, catches, best average (qual), best economy (qual). Each record lists holder, value, season, grade, and the next 4 for context (top 5). Ties listed together. NEW badge when the record's season is the data-defined current season (`currentSeasonOrder(rows)`, fact 9, the lowest `seasonOrder` with rows, never a literal `0`) and the record is the top. Notes block states that innings-level records (best innings figures beyond personal best, partnerships, 100s counts) arrive with per-match storage (Tier B), phrased as a short "Coming" line only if the club copy enables it; default is to omit silently.

### A4 Profile upgrades
Existing `getPlayerProfile` stays; add `lib/players/profile-extras.ts` that takes profile seasons plus the cached league rows and returns: progression series (runs, average, wickets, games by season), best/worst season per metric, milestone badges (achieved, subject to the 3.6 coverage guard), rank badges (since-2023/24 top 3 in any default-scope leaderboard metric for which the player qualifies), junior toggle. Season table gains highlight classes; page gets "Share card" button and links to `/players/compare?a=<slug>`. Sections omit cleanly when a player has no batting or bowling data (do not draw empty charts).

### A5 Compare `/players/compare?a=&b=`
Two native `<select>` pickers (server-provided list of public players, sorted by name, GET form) plus the shareable URL. Rows: career batting, bowling, fielding with the better value subtly highlighted (ties neither); per-season split table on a shared season axis; "career vs" only the common seasons toggle (`?common=1`). Invalid or unknown slugs show the pickers with an inline message (`error-box`), never a 500. Reserve the slug `compare` in `uniqueSlug` (`payload/hooks/slug.ts` currently reserves only `submit` and `drafts`; add `compare` via the reserved list in `lib/slugify`) so a player can never shadow the static route. Existing rows are not covered by the hook: the WP-B migration includes a one-time check that fails loudly (or renames to `compare-2`) if any `players.slug = 'compare'` exists (ETL-created or manual), and a test asserts no existing row holds a reserved slug. Not available in Tier A: opposition history, dismissal patterns, recent form.

### A6 Stat cards
`app/api/public/players/[slug]/card/route.tsx`: `ImageResponse` 1200x630 (OG) and `?format=square` 1080x1080. Content: crest, name, years, 4 headline stats chosen by role (batter / bowler / allrounder by runs vs wickets), top rank text badge if any. Route config: `export const runtime = 'nodejs'`.
- **Theme.** Colours come from the club theme via `getClub()` (the same CSS-variable channels DESIGN.md describes), converted to rgb strings at render time; no hex baked into the route. Fall back to the default theme values from `club-defaults.ts` if absent.
- **Assets.** satori cannot render webp or svg, and the club logo is a Blob URL. The route uses a bundled local PNG crest under `public/` or `assets/` when the logo is not PNG/JPEG, and otherwise fetches the logo with a 2s `AbortSignal.timeout` and falls back to the bundled PNG (or no crest) on any failure. "No network at render" therefore holds for the font and fallback, not the logo fetch. The font file is read via `fs`, so `next.config.ts` gets `outputFileTracingIncludes` for this route's font/PNG assets.
- **Bounded variants.** `?format` is whitelisted to `{og, square}` and `?season` to known season names (from the cached season index); unknown values are ignored (treated as default), so the cache key space is finite.
- **Caching and hiding.** `Cache-Control: public, s-maxage=300` for 200 (short because `revalidatePath` does not purge route-handler responses, so a hidden player must age out of the CDN quickly); the 404 for hidden/unknown players uses `s-maxage=60` so unhiding recovers quickly. The Players `afterChange` hook `revalidatePath`s `/api/public/players/<slug>/card` so a newly hidden player's card stops being served promptly rather than after the TTL. Route is unauthenticated and CPU-heavy: the same visible-only cached rows, no per-request DB scans beyond one player lookup.
- Profile `generateMetadata` uses it as OG image when the player has no photo.

### A7 Honour board `/honours`
Parse `players.honours`: group by normalised title (trim, collapse spaces, case-insensitive key), list recipients with `years`. Year parsing: extract 4-digit years and `YYYY/YY` ranges for sorting; unparsable years sort last and still display verbatim. Category chips via keyword rules (defaults: Life Member, Hall of Fame, Premiership, Best and Fairest / Club Champion, Captain, Leadership/Role, Association honours, Other), overridable in site-settings `honourCategories` (array `{label, keywords[]}`). Two views: By honour (default), By year. Hidden players excluded. Empty state when no honours exist.

### A9 Season yearbooks
New collection `yearbooks` (`payload/collections/Yearbooks.ts`, group "Club"): `title`, `seasonName` (text, unique, validated against the pattern of existing `player-seasons.seasonName`, with an admin hint listing known seasons), `slug` (unique; derived from `seasonName` e.g. "Summer 2025/26" with `/` replaced by `-` and the season word kept, so `summer-2025-26`; on collision append `-2`, `-3` via the same `makeUniqueSlug` path; slug is stable after create), `status` select `draft|published` (same custom pattern as Stories, not Payload versions, to avoid version tables), `cover` upload to `media`, `presidentMessage`, `coachMessage`, `sponsorMessage` (plain textarea, "blank line between paragraphs", consistent with player bio; max length validators), `photos` relationship hasMany to `gallery-photos`, `featuredSponsors` relationship hasMany to `sponsors`, `premiership` text (optional headline like "A Grade premiers"). Access: read `staffOr({ status: { equals: 'published' } })` (this protects REST/GraphQL only); create/update/delete `isStaff`. Hooks: revalidate paths/tags; `trimStrings`.
**Draft leakage.** (1) The page, sitemap and `generateMetadata` run through the Local API, where `overrideAccess` defaults to true, so the `status: published` filter must be written explicitly in every `lib/yearbooks-queries.ts` query (list, by-slug, metadata, sitemap) and each has its own test. (2) Draft assets are not private: `gallery-photos` read is `anyone` (`GalleryPhotos.ts`) and `Media.ts` read is `staffOr` excluding only the `stories/pending` prefix, so a draft's cover or photos are fetchable by direct URL or their own REST endpoints. The admin hint says "do not upload unreleased assets until publishing" and no further guarantee is claimed. Relationship expansion (`depth`) on `/api/yearbooks` for anonymous users is irrelevant for drafts because the doc itself is filtered.
Auto-filled sections (computed at request time, never stored): overview (games, W/L/D/win rate when PlayHQ has the season via `getClubGames`; otherwise omitted with `PlayhqUnavailable` style note), top batters / bowlers / fielders by season (from `player-seasons`, same leaderboard components, season-scoped, qualification at season level), most games, a neutral stat leaderboard "Top all-rounders (runs + 20 x wickets)" (min 100 runs and 8 wickets; the formula is printed on the page; it is a stat ranking, kept out of the honours board and never described as an honour or award), results by grade (PlayHQ games with score lines via `resultSentence`), honour board entries whose `years` mention the season, photos, sponsors, editorial messages. Seasons older than PlayHQ coverage have no stats rows and no results block; a yearbook for such a season shows editorial content only (stats sections omitted cleanly). `/yearbooks` lists published yearbooks (cover cards, newest first) plus "Seasons with stats but no yearbook yet" is NOT shown publicly. Print: `@media print` hides nav/footer/filters, forces light background, page-break rules per section, "Print / save as PDF" button calling `window.print()`. Draft yearbooks 404 publicly (route `app/(frontend)/yearbooks/[slug]/page.tsx`; the param is a slug, not a season); a staff preview route is out of scope.

### A10 Match archive `/matches`
Params `season` (default from `resolveSeason`), `grade`, `q` (opponent substring), `result` (won/lost/other). Reuses `getClubGames`, `GameRows` (`components/playhq/game-rows.tsx`) and `SeasonPicker`; adds a grade `segmented-pill` and opponent filter. Rows link to `/fixtures/[gameId]`. Finished games only, newest first, grouped by round. PlayHQ failure renders `PlayhqUnavailable`. No unbounded DOM: the list is paginated by round groups (a fixed number of rounds per page via `?page=`, no row cap separate from that), and when a grade is not selected and the season has more than 200 finished games, only the first page of rounds is shown with a "narrow by grade" hint. Cost: `getClubGames` fans out to every team's fixture on each request (five at a time, TTL 1800), so the page relies on that TTL cache. Coverage: `/matches` only shows seasons PlayHQ lists (Summer 2023/24 onwards); pre-2023 history does not exist and the page says so, and yearbooks for older seasons have no results block.

### A11 StatLab-lite `/statlab`
Query: `?scope=career|season|player-season&season=&grade=&cat=&cols=runs,avg,sr&sort=runs.desc&min.runs=100&q=` (all parsed by `query-string.ts` against the metric registry whitelist; `season` validated against known season names, unknown keys dropped; limits: max 12 columns, `min` values clamped; the on-page table shows at most 500 rows). Scopes: `career` (one row per player over the stored window, captioned "since 2023/24"), `season` (one row per player x season, merged teams), `team-season` (one row per player-season row). Metric columns: every metric in the registry (about 25 incl. derived: batting average, SR, economy, bowling average, bowling strike rate, runs per game, wickets per game, catches per game, boundary runs %, = (4s*4+6s*6)/runs). Presets (typed list in `lib/stats/presets.ts`, each is just a query string): Top run scorers, Best batting averages, Hard hitters (SR and sixes), Strike bowlers, Economical bowlers, Maiden makers, Best seasons, All-rounders, Catching machines, Most capped, Rising stars (<= 3 seasons, ranked by runs per game), Active squad snapshot. "Save report" = copy URL; no DB. `GET /statlab/export?...same params` route handler (`export const runtime = 'nodejs'`) returns `text/csv; charset=utf-8`, same parser/filters and single code path as the page, reading the same cached visible-only rows (hidden players can never appear), and no player data beyond the public leaderboard fields (name, never ids).
- **Row cap reconciled.** The page shows the top 500 rows of the result; the export returns the full filtered result up to 5,000 rows. This is the one deliberate difference: same filters, sort and columns, different cap. If the result exceeds 5,000 rows it is truncated and the first line of the file is a comment-style header row `# truncated to 5000 of N rows`, with `X-Export-Truncated: 1`. The acceptance check compares the export against the table for the first 500 rows.
- **Injection guard.** For string cells only: if the value starts with `=`, `+`, `-`, `@`, tab (`\t`) or carriage return (`\r`), prefix `'`. Numeric cells (including negative numbers) are written unprefixed. Unit-tested for each lead character and for negative numbers.
- **Abuse and caching.** The route is public and recomputes, so it sends `Cache-Control: public, s-maxage=600, stale-while-revalidate=60` keyed by the canonical query string (the parser re-serialises params in sorted canonical order and redirects or ignores non-canonical extras), and applies the max column/row limits above. No in-app rate limiter; CDN caching bounds cost and the row/column caps bound each computation. If abuse appears, add a Vercel firewall rule on the path (note only).
- **Headers.** `Content-Disposition: attachment; filename="langlang-statlab-<scope>.csv"` where `<scope>` is the whitelisted scope value only; `q` and other user input never reach headers. `X-Robots-Tag: noindex` is set (route handlers ignore `noindex` metadata).

### A12 Shell
- Navigation: `navigation` in `payload/seed/club-defaults.ts` (defaults-module): add a "Stats" entry to `clubLinks` pointing to `/stats`; sub-pages are reached from `StatsSubNav` (avoids bloating the nav). Footer column gets Stats, Records, Honours, Yearbooks. `isActivePath` already matches by prefix.
- `pageCopy` (defaults-module, `club-defaults.ts`): add `stats`, `records`, `honours`, `statlab`, `yearbooks`, `matches`, `compare` entries each with `header: HeaderCopy` (eyebrow, title, intro) plus empty-state strings and caption text; `getClub()` merge unchanged. SEO: extend `SEO_PAGES` and `PAGE_LABELS` in `payload/globals/Club.ts` with `stats, records, honours, statlab, yearbooks, matches` (title/description editable, schema change, covered by migration).
- Sitemap (`app/sitemap.ts`): STATIC adds `/stats` (weekly 0.7), `/records` (weekly 0.6), `/honours` (monthly 0.5), `/yearbooks` (monthly 0.5), `/matches` (weekly 0.5), `/statlab` (monthly 0.4); dynamic `/yearbooks/[slug]` from published yearbooks (`status: published`). `/players/compare` and `/statlab/export` are excluded from the sitemap; parameterised page views carry `noindex` metadata with canonical to the base path via `canonicalFor`; the CSV and PNG route handlers set `X-Robots-Tag: noindex` headers instead because metadata does not apply to them.
- Structured data (`lib/structured-data.ts`): BreadcrumbList on new pages; `ItemList` of `Person` (name, url) for the leaderboard top 10; yearbook uses `Article`-like `CreativeWork` with `datePublished`. Never emit stats as unverifiable claims beyond the visible content.
- `robots.ts`: current rules disallow all of `/api`, which also blocks the card. Add an explicit `allow: '/api/public/players/'` (longest-match wins over `/api`) so OG fetchers and crawlers can reach the cards, and add `disallow` entries `/statlab/export` and `/players/compare`. A robots test asserts the final rules list contains each.
- Admin: Dashboard "Milestones" widget; `yearbooks` card in `dashboardCards.ts`; site-settings `stats` tab.

## 5. Payload / schema changes

| Change | Migration |
|---|---|
| `site-settings.stats` group (categories, grade rules, qualification, milestones, honour categories) | WP-A |
| `club.pages.{stats,records,statlab}` (SEO) | WP-A |
| `club.pages.{honours,compare}` (SEO); optional `players.baseline*` number fields (3.6); one-time reserved-slug check | WP-B |
| `yearbooks` collection (+ `yearbooks_rels` for photos and sponsors) + `club.pages.{yearbooks,matches}` | WP-C |

Each WP: `pnpm payload migrate:create <name>`, hand-check that SQL is schema-qualified (`"payload"."..."`), `pnpm check:migrations`, `pnpm generate` (types + importmap), dev DB reset by `DROP SCHEMA payload CASCADE` via node `pg` when needed (payload push hangs non-TTY). `player-seasons` is unchanged; `players` gains only the optional baseline fields (WP-B). The sync changes only by the extra (try/catch-wrapped) revalidation call and by importing the shared junior-rule constants.

## 6. Testing

Unit (vitest `--project unit`, `tests/stats-*.test.ts`): categories (matrix of grade names including Thunder, Women's Under 16, Over 40s, Boys and teamName fallback), aggregate/merge by season (two teams same season, best figures/high score), metrics (null handling, zero balls), qualify, rank ties and badges, records (ties, NEW flag with no rows in the newest season group, coverage period), season-window helper, milestones (approach window, "reached in season"), progression series, honours parsing, query-string whitelist (garbage, overflow, duplicate keys), csv (injection guard for `= + - @ \t \r` on strings only, negative numbers unprefixed, quoting), robots rules, presets all parse. Integration (`tests/int`, local `langlang_test`): `stats-queries.int.test.ts` (hidden players excluded from every query; counts match seeded data; after hiding one player, invalidating and re-reading the cached query no longer returns that player; admin query still returns them), `yearbooks.int.test.ts` (anonymous read returns published only, draft hidden through REST probing including `?where[status][equals]=draft` and `depth` expansion, an explicit test per `yearbooks-queries` function (list, by-slug, metadata, sitemap) that drafts are excluded, staff sees all, slug uniqueness and collision suffix), route tests for CSV (headers, filename from scope only, cap and truncation marker, `X-Robots-Tag`, guard) and card (404 hidden player with short TTL, content-type `image/png`, unknown `format`/`season` ignored), sitemap test extended, structured-data tests extended, site-settings test for the new group defaults. Final-verify only: full `vitest`, `next build`, `eslint .`, `pnpm check:generated`, `pnpm check:migrations`.

## 7. Local seeding for acceptance checks

`pnpm fixture:legacy` + `pnpm etl` into `langlang_dev` loads only about four players, which suits the ETL parity tests but is too small for leaderboards. Add `payload/scripts/fixtures/stats-seed.ts` (`"fixture:stats": "payload run payload/scripts/fixtures/stats-seed.ts --"`):

- Calls `_guard.ts` first and refuses unless `DATABASE_URL` host is `127.0.0.1` and DB name is `langlang_dev` or `langlang_test`.
- Deterministic seeded PRNG (fixed seed), about 70 players with plausible names, seasons matching the real PlayHQ window (`Summer 2023/24` to `Summer 2025/26`, `seasonOrder` 0..2, with no rows for the upcoming `Summer 2026/27` so the "newest season group has no rows" case is exercised); the seed is not allowed to invent pre-2023 history, so tests cannot hide the coverage gap (one veteran has `manualYears` starting before 2023 to test the milestone guard), grades A/B/C Grade plus a few rows named "Women's T20", "Over 40s" and "Under 16" so classification and the junior toggle can be exercised, 1 to 3 team rows per player-season (multi-team merge case), realistic counts (batters 150 to 600 runs/season, bowlers 8 to 35 wickets, some zero-ball rows, some `batBalls = 0`), planted known leaders (named test players with exact totals, e.g. a career 2,017-run batter, a 99-game player 1 short of the milestone, with the window sized so 99 games is achievable in 3 seasons), 20 players with honours (varied `years` formats and titles), 3 hidden players holding top stats (must never appear), 2 yearbooks (one published with messages and photos, one draft).
- Players created with `source: 'manual'`, slug prefix none; marker: `bio` starts `[seed]`. Idempotent: deletes previously seeded rows (by marker) first, uses `context: { disableRevalidate: true }`. Seeds `site-settings` defaults.
- Ground-truth cross-check queries (documented in the WP checks) run directly with node `pg` against `127.0.0.1:54329`, e.g. `select p."displayName", sum(s."batRuns") ... group by 1 order by 2 desc limit 5` must equal the leaderboard top 5.

Local run recipe: `pgctl.sh status|start`; `pnpm payload migrate`; `pnpm seed:club`; `pnpm seed:admin`; `pnpm fixture:stats`; `PORT=3101 pnpm dev` with `.env.local`; curl and page checks below.

## 8. Work packages (ordered; each ends with tests green for its files and one commit per logical unit)

### WP-A: stats core, grade classification, leaderboards, records
Files:
- new `lib/stats/{categories,aggregate,metrics,qualify,rank,records,query-string,csv}.ts`, `lib/stats/queries.ts`
- edit `lib/site-settings-core.ts`, `lib/site-settings.ts`, `payload/globals/SiteSettings.ts` (stats group), `payload/globals/Club.ts`, `payload/seed/club-defaults.ts` (pageCopy `stats`,`records`, SEO)
- new `components/stats/{stats-sub-nav,leaderboard-table,rank-badge,filter-bar}.tsx`
- new `app/(frontend)/stats/page.tsx`, `app/(frontend)/records/page.tsx`
- edit `lib/players/sync.ts` (tag revalidation), `payload/collections/Players.ts` hooks (tag), `app/sitemap.ts`, `lib/structured-data.ts`, nav/footer defaults
- new `payload/scripts/fixtures/stats-seed.ts`, `package.json` script
- migration `payload/migrations/<ts>_stats_settings.*`, regenerated `payload-types.ts` / importMap
- tests: `tests/stats-{categories,aggregate,metrics,qualify,rank,records,query-string}.test.ts`, `tests/int/stats-queries.int.test.ts`, extend `sitemap`/`structured-data`/`site-settings` tests
Acceptance (local, `langlang_dev` seeded):
1. `tsc --noEmit`, `payload generate:types`, `pnpm check:migrations`, targeted vitest files pass.
2. `/stats?metric=runs&season=all` top-5 equals the node-pg ground-truth query (the join excludes `players.hidden = true`); hidden seeded stars absent; planted career leader is #1 with gold badge.
3. `/stats?metric=avg` excludes players under 300 runs / 8 innings; `?season=Summer 2025/26&grade=B Grade` filters correctly; `?cat=` and `?juniors=1` change the set; invalid params fall back to defaults with 200.
4. `/records` since-2023/24 and season-best values match SQL cross-check; multi-team seasons are merged; coverage period shown; NEW badge only on the data-defined current season.
5. Changing `site-settings.stats` (a threshold and a grade rule) in the admin changes output after revalidation; an invalid regex is rejected at save.
6. Page HTML has one h1, sr-only table captions (stating the "since 2023/24" scope), no horizontal overflow at 375px (manual or Chrome check) including the metric select below `sm`.

### WP-B: profile upgrades, compare, stat cards, honour board, milestones
Files:
- new `lib/stats/{progression,milestones,honours}.ts`, `lib/players/profile-extras.ts`
- edit `app/(frontend)/players/[slug]/page.tsx`, `components/players/player-season-tables.tsx` (highlights), `app/(frontend)/players/page.tsx` (milestone strip)
- new `components/stats/{progression-chart,milestone-strip,share-button,compare-table}.tsx`
- new `app/(frontend)/players/compare/page.tsx`, `app/(frontend)/honours/page.tsx`, `app/api/public/players/[slug]/card/route.tsx` (+ bundled font and PNG crest assets, `outputFileTracingIncludes` in `next.config.ts`)
- edit `payload/components/Dashboard.tsx` (+ small `MilestonesWidget.tsx`), `payload/hooks/slug.ts` (reserved `compare`), `payload/globals/{SiteSettings,Club}.ts`, `club-defaults.ts`, sitemap, importMap
- migration for `honours`/`compare` SEO and any added settings fields
- tests: `tests/stats-{progression,milestones,honours}.test.ts`, `tests/int/player-card-route.int.test.ts`, compare-page query tests, slug reservation test
Acceptance:
1. Profile of a seeded multi-season player shows charts (SVG with `<title>`), best/worst highlight with text markers, milestone and rank badges consistent with `/stats`; `?juniors=1` shows the junior row only when seeded; player with no bowling data renders no bowling chart.
2. `/players/compare?a=<slug>&b=<slug>` renders both players and the better-value highlight; swapping a and b swaps columns; unknown slug shows inline error with 200; hidden player slug treated as unknown; a player with slug `compare` cannot be created.
3. `curl -I /api/public/players/<slug>/card` returns `200 image/png`; hidden/unknown returns 404; `?format=square` size differs.
4. `/honours` groups the seeded honours correctly (title normalisation, year sort, category chips, hidden players excluded).
5. Milestones: seeded "99 games" player appears as approaching 100 games on `/players` and in the admin dashboard widget; a crossing player shows "reached in <season>".
6. Share button works with and without `navigator.share` (Chrome check).

### WP-C: yearbooks, match archive, StatLab, shell completion
Files:
- new `payload/collections/Yearbooks.ts`, register in `payload.config.ts`, `payload/components/dashboardCards.ts` (card), revalidate hooks, migration
- new `lib/yearbooks-queries.ts`, `lib/matches-queries.ts`, `lib/stats/{presets}.ts`
- new `app/(frontend)/yearbooks/page.tsx`, `yearbooks/[slug]/page.tsx`, `matches/page.tsx`, `statlab/page.tsx`, `statlab/export/route.ts`
- new `components/stats/{yearbook-sections,statlab-form,column-picker}.tsx`; print CSS in `app/(frontend)/globals.css`
- edit `app/sitemap.ts` (+ dynamic yearbooks), `app/robots.ts` (allow card, disallow export and compare), `lib/structured-data.ts`, nav/footer defaults, `club-defaults.ts`, `Club.ts`
- tests: `tests/stats-presets.test.ts`, `tests/int/yearbooks.int.test.ts`, `tests/int/statlab-export.int.test.ts`, `tests/matches-queries.test.ts` (with `tests/fixtures/playhq`), sitemap test extended
Acceptance:
1. Anonymous REST `GET /api/yearbooks` returns published only; draft slug 404 on the site; staff sees both in admin; duplicate `seasonName` rejected.
2. `/yearbooks/<published-slug>` shows editorial messages, auto stats matching `/stats?season=` for the same season, photos and sponsors; with PlayHQ unreachable (offline run) the page still renders stats and shows the unavailable note for results; print preview hides nav/footer (Chrome check).
3. `/matches?season=&grade=` lists games from the existing PlayHQ test fixtures (mocked in tests) and links to `/fixtures/[gameId]`; PlayHQ failure shows `PlayhqUnavailable`.
4. `/statlab` presets each render non-empty on seeded data; column/sort/min params round-trip through the URL; garbage params fall back safely; export returns CSV with correct headers and row count, matches the on-screen table, and a seeded player name starting with `=` is neutralised.
5. Sitemap includes new static routes and published yearbooks only; nav and footer show Stats links; `pnpm check:migrations`, `pnpm check:generated` clean.
6. Final verify (once): full `vitest run` (unit + int), `eslint .`, `next build`, then a Chrome pass over every new route at 375px and 1280px.

## 9. Risks and notes

- **Honesty over parity.** Any metric with no honest source is omitted, not estimated. The README-style note in `lib/stats/metrics.ts` lists which BetterStats metrics are absent and why (Tier B table).
- **Coverage window and senior-mostly data.** Career figures cover only PlayHQ-era seasons (fact 7) and are labelled so; the junior toggle appears only when rows classify as junior, and is not assumed dormant.
- **Free-text honours** will classify imperfectly; admin-editable keyword rules and verbatim display of unrecognised titles mitigate this.
- **Single-query load**: `player-seasons` rows (a few thousand over the coverage window) are cached per season in a slim columnar shape under tag `player-stats` (3.1, 2MB entry cap); if this grows past about 20k rows, move aggregation to SQL (`payload.db.drizzle`).
- **Privacy**: hidden players excluded from every public query, export, card, comparison and sitemap; junior names are not expected (junior seasons are filtered at sync), but grades such as "Boys" are not filtered by the current sync, so the shared junior-rule constant widens the filter (3.1).
- Tier B upgrade path: persist per-innings rows in the sync (same scorecards, no extra API calls), then add metrics to the registry; leaderboards, records and StatLab pick them up through `metrics.ts` without page changes.

## Appendix: review findings disposition

All 15 findings were checked against the repo and accepted; the spec text above is updated. Verified facts: `Media.ts` read is `staffOr` excluding only the `stories/pending` prefix, `GalleryPhotos` read is `anyone`, `payload/hooks/slug.ts` reserves only `submit`/`drafts`, `app/robots.ts` disallows all of `/api`, `isJuniorGrade` is `isJuniorCompetition || /u1\d|under/i`, Next is 16.3.8, `/fixtures/[gameId]` uses `revalidate = 900`.

Accepted with adjustments (not taken verbatim):
- 1: both baseline mechanisms are specified (optional `players.baseline*` fields, plus exclusion when `manualYears` shows earlier history). Seed window aligned to real seasons.
- 6: no per-request rate limiter is built; caching plus row/column caps bound cost (firewall rule noted). The `'max'` profile argument is flagged "confirm against installed Next" rather than asserted, since it was not executed in this docs-only change.
- 9: "rate-limit or at least cache" is met by caching and caps only.
- 10: draft assets are documented as not private rather than made private (changing `Media`/`GalleryPhotos` access would affect public pages).
- 15: qualification defaults are explicitly an unverified assumption, with a data check required in WP-A before defaults are hardcoded.

Rejected: none outright. Not verified here (to be confirmed during implementation): whether `satori` in the installed `next/og` supports the font format chosen, and the exact `revalidateTag` signature.


## Known limitations

- The `overs` metric value is balls/6 (true decimal overs) while it displays in cricket notation, so a `min.overs` of 12.3 means 12.3 true overs, not 12.3 cricket overs.
- Strike rate is career runs over career balls; a few legacy `player_seasons` rows have runs but no recorded balls, which inflates SR for affected players.
- `/matches` and yearbook results include junior grades (consistent with `/fixtures`), while yearbook stat leaders exclude them by default.
