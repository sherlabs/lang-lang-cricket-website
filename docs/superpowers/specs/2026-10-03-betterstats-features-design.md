# BetterStats feature set for Lang Lang: design

Date: 2026-10-03. Branch: `feat/payload-cms`. Builds on `2026-10-03-payload-cms-migration-design.md` (Local API behind `lib/*-queries`, `club` global, `payload/` layout, access model) and `2026-09-30-players-design.md`. Visual system: `DESIGN.md` (PageHeader, SectionHeading sub-section variant, `card-static`, shadcn `Table` inside `card-static`, `segmented-pill`, `count-pill`, `empty-state`, `container-site`). No new design tokens, no new runtime dependency.

Source inventory: BetterStats `/modules/betterstats` (captured in `research.md`, scratchpad). This spec decides which of those features Lang Lang can build honestly.

## 1. Data reality (what is actually derivable)

Stored (collection `player-seasons`, one row per player x PlayHQ team, rewritten by the nightly sync in `lib/players/sync.ts`): `seasonName`, `seasonOrder` (0 = newest senior season group), `teamId`, `teamName`, `gradeName`, `games`, `batInnings`, `batNotOuts`, `batRuns`, `batHighScore` (+`batHighScoreNotOut`), `batBalls`, `batFours`, `batSixes`, `bowlBalls`, `bowlMaidens`, `bowlRuns`, `bowlWickets`, `bowlBestWickets`, `bowlBestRuns`, `catches`. Plus `players` (name, photo, bio, `hidden`, `honours[] {years,title}`), `player-aliases`.

Facts that constrain design:

1. **Senior only.** `collectSeniorAggregates()` skips junior seasons and U-age grades (`isJuniorCompetition` / `isJuniorGrade`). Junior seasons are not in the database. The "include juniors" toggle therefore only has an effect for grade names that classify as junior in stored rows (e.g. an Under-age grade inside a senior-classified competition cannot occur either, since it is filtered). The toggle is built, driven by classification, and hidden when the data set holds no rows in that category. Women's, masters and mixed appear only if the club's PlayHQ senior competitions contain such grades.
2. **Aggregates only, no per-match rows.** The sync fetches every FINAL scorecard (`getGameSummary`) and discards it after `aggregatePlayers`. Scorecards for display come live from PlayHQ (`lib/playhq`, TTL cached) and only for seasons PlayHQ still lists.
3. **`highScore` and `bestWickets` are single values**, so we know "a century exists in this player's career/season" (highScore >= 100) but not how many. Counts of 50s/100s/ducks/5-fors are NOT derivable.
4. Catches are stored; run-outs and stumpings are not.
5. A player can have several rows per season (one per team). Every season-scoped stat first merges rows by `(player, seasonName)` with `combineCounts` (`lib/players/season-math.ts`, already handles best-of high score and best figures).
6. `batBalls` may be 0 for old/partial data: strike rate returns `null` (existing `battingAverages`), and qualification for SR requires minimum balls.
7. Honours are free text `{years, title}`; there is no honour type or numeric year. Categorisation is keyword-based and best effort.

## 2. Decision: Tier A (build) and Tier B (deferred)

### Tier A: built from existing data

| # | Feature | Route / surface | Notes |
|---|---|---|---|
| A1 | Grade-category classification | `lib/stats/categories.ts`, site-settings | senior / junior / womens / masters / mixed from `gradeName` (and `teamName` fallback) |
| A2 | Leaderboards | `/stats` | batting: runs, average, high score, sixes, fours, strike rate; bowling: wickets, economy, average, best figures, maidens; fielding: catches; also games. Filters season + grade + scope (career/season). Gold/silver/bronze badges. |
| A3 | Club records | `/records` | career and single-season bests from aggregates; NEW badge for current season |
| A4 | Profile upgrades | `/players/[slug]` | progression charts (inline SVG), best/worst season highlight, milestone badges, rank badges, junior toggle (`?juniors=1`) |
| A5 | Player comparison | `/players/compare?a=&b=` | shareable URL |
| A6 | Shareable stat cards | `/api/public/players/[slug]/card` (`next/og` ImageResponse) + share button | also OG image for profile |
| A7 | Honour board | `/honours` | aggregates existing `players.honours` by title and year |
| A8 | Milestone tracker | public strip on `/players` and `/stats`, admin Dashboard widget | players approaching 100 games / 1000 runs / 100 wickets etc. |
| A9 | Season yearbooks | `/yearbooks`, `/yearbooks/[season]` | new `yearbooks` collection (editorial), auto-filled stats; print stylesheet |
| A10 | Match archive | `/matches` | PlayHQ games by season + grade, links to existing `/fixtures/[gameId]` scorecard route |
| A11 | StatLab-lite | `/statlab`, `/statlab/export` | column picker, filters, sort, thresholds, presets, CSV; saved reports = URL query string only |
| A12 | Shell | nav, footer, sitemap, JSON-LD, club `pageCopy`, SEO pages, revalidation, tests | |

Added by honest derivation (no new data): "Centurion" and "Five-wicket haul" badges (highScore >= 100 / bestWickets >= 5), "most seasons played" record, "reached in season X" for milestones (cumulative sum over `seasonOrder`).

### Tier B: deferred (needs per-match storage)

Common prerequisite: a `player-innings` collection (or drizzle table like `player_seasons`) populated by the sync from the scorecards it already downloads (`Scorecard.innings[].batting/bowling`, `fallOfWickets`, `dismissal` text, `players`), so no extra PlayHQ API cost. Pre-PlayHQ history would need CSV import.

| Feature | Data needed |
|---|---|
| 50s / 100s / ducks / 5-fors counts and leaderboards | per innings: runs, notOut; per spell: wickets |
| Dismissal breakdown chart | per innings: dismissal kind (parse existing `dismissalText` or store PlayHQ event type), bowler, fielder |
| Run-outs, stumpings leaderboards | fielder per dismissal event (not just catches) |
| Opposition analysis, opposition history in compare | opponent team/club per game (`Scorecard.teams`) |
| Batting position analysis | `displayOrder` per innings |
| Partnerships and partnership records | `fallOfWickets` pairs per innings (runs, wicket no., both batters) |
| Best economy/average by spell, best innings figures list | per-spell overs/runs/wickets (records page then shows only the single best per player we already know) |
| Recent-form view (last N innings) | dated innings rows |
| Per-match links from profiles | `gameId` per innings row |
| Team records (biggest win, highest total) | per-game team totals (only partly live via PlayHQ today) |
| Grade rename / merge admin tools, CSV stats import | N/A to this phase; grade classification rules (A1) cover the display need |

Features NOT in BetterStats-for-Lang-Lang scope: AI narrative, notification centre, multi-club white-label, 200+ presets (we ship about 12).

## 3. Architecture

### 3.1 Layering

- `lib/stats/*` pure TypeScript, no Payload/React imports, unit-tested:
  - `categories.ts`: `GradeCategory = 'senior'|'junior'|'womens'|'masters'|'mixed'`; `classifyGrade(gradeName, teamName, rules)`; default rules (regex, case-insensitive): junior `/\bu\s?-?1\d\b|under|junior|girls|boys|\byouth\b/`, womens `/women|ladies|\bw\b/` , masters `/master|over\s?\d{2}|o\d{2}|vets?/`, mixed `/mixed/`; anything else senior. Reuses `isJuniorGrade` from `lib/playhq/queries` as an additional junior signal (import the regex logic into a shared constant to avoid a server-only import).
  - `aggregate.ts`: `mergeBySeason(rows)`, `careerOf(rows)`, built on `combineCounts`/`pickCounts`.
  - `metrics.ts`: metric registry `{key, label, group, value(counts)->number|null, format, higherIsBetter, qualifier}`. Used by leaderboards, records, StatLab, compare, so one definition of each stat.
  - `qualify.ts`: minimum thresholds (section 3.3).
  - `rank.ts`: `rankBy(rows, metric, {min})` with competition ranking (ties share rank) and `badgeFor(rank)` (1 gold, 2 silver, 3 bronze).
  - `records.ts`, `milestones.ts`, `progression.ts` (per-season series for charts), `honours.ts`, `query-string.ts` (StatLab/leaderboard params parse + serialise, whitelist-validated), `csv.ts` (RFC 4180 + formula-injection guard: cells starting `= + - @` get a leading `'`).
- `lib/stats/queries.ts` (`server-only`): the only Payload access. `getStatRows()` = one `payload.find` on `player-seasons` with `pagination:false`, `depth:0`, `select` of count fields plus `player`, and a `where: { 'player.hidden': { equals: false } }`, joined in memory with a `players` find (`hidden:false`, `joins:false`, select name/slug/photo). Wrapped in `unstable_cache(..., ['stat-rows'], { tags: ['player-stats'] })`. Public queries state their own hidden filter (Local API runs with overrideAccess).
- `lib/yearbooks-queries.ts`, `lib/matches-queries.ts`: yearbooks via Payload; matches via `lib/playhq` (`getSeasonGroups`, `getClubGames`).
- Pages are server components under `app/(frontend)/...`, `export const dynamic = 'force-dynamic'` like sibling pages, state in `searchParams` (no client state beyond pickers and the share button).

### 3.2 Grade-category configuration

`site-settings` gains a `stats` group (migration):

- `defaultIncludedCategories`: select hasMany, default `['senior','womens','masters','mixed']` (juniors off, matching BetterStats default).
- `gradeRules`: array `{ category, pattern, flags default 'i' }`, prepended to the built-in defaults; `pattern` validated as a compilable regex (validate fn, max length 100) to prevent ReDoS-style or invalid input.
- Qualification overrides (3.3), milestone thresholds (3.6).

Page-level override: `?cat=senior,womens` (whitelist-validated) and `?juniors=1` shorthand adds `junior`. Categories with zero rows are not offered in the UI. Settings read through `lib/site-settings.ts` (extend `site-settings-core.ts` defaults so it works before the global is saved, same as `sponsorCarouselTiers`).

### 3.3 Qualification minimums (scaled to Lang Lang)

Lang Lang plays about 15 to 20 games a season per team across 3 or so senior teams and a small playing group, so BetterStats' 500 runs / 100 overs / 50 wickets would leave leaderboards empty. Defaults (editable in site-settings):

| Metric | Career scope | Single-season scope |
|---|---|---|
| Batting average | >= 300 runs and >= 8 innings | >= 100 runs and >= 5 innings |
| Strike rate | >= 300 balls faced | >= 100 balls |
| Bowling average | >= 25 wickets | >= 8 wickets |
| Economy | >= 300 balls bowled (50 overs) | >= 120 balls (20 overs) |
| Counting stats (runs, wickets, catches, sixes, fours, maidens, games, high score, best figures) | >= 1 | >= 1 |

Rows below the minimum are listed under a collapsed "Not enough data yet" note, never ranked. Thresholds shown in the table caption (accessibility + transparency).

### 3.4 Caching and revalidation

`revalidatePlayerPages()` in `lib/players/sync.ts` additionally calls `revalidateTag('player-stats','max')` and `revalidatePaths(['/stats','/records','/honours','/statlab','/yearbooks'])`. Players `afterChange/afterDelete` hooks add the tag (hidden/honours changes). Yearbooks hooks revalidate `/yearbooks` and `/yearbooks/[slug]`. Verify the repo's Next cache mode before choosing `unstable_cache` vs `'use cache'` (the repo currently uses `force-dynamic` pages plus tag-based fetch caches for PlayHQ); the tag name is the contract, not the API.

### 3.5 Visual components (`components/stats/*`)

`StatsSubNav` (segmented-pill row: Leaderboards, Records, Honours, StatLab, Yearbooks, Matches), `LeaderboardTable` (shadcn `Table` in `card-static`, sr-only caption, `tabular-nums`, rank badge), `RankBadge` (gold / silver / bronze using existing `brand-gold`, grey and a bronze tint added only as a Tailwind arbitrary value inside the component; no new token), `FilterBar` (native selects + `segmented-pill`, GET form so it works without JS), `MilestoneStrip`, `ProgressionChart` (server-rendered inline SVG: polyline/bars, `role="img"`, `<title>`/`<desc>`, adjacent data table in `<details>`), `SeasonTable` extension (best/worst cell highlight with `bg-brand-gold-pale` / muted text, plus a text marker so colour is not the only cue), `ShareButton` (client; `navigator.share` with copy-link fallback), `PrintStyles` (yearbook `@media print` block in `globals.css`).

### 3.6 Milestones

Config `milestoneThresholds` default `{ games: [50,100,150,200,250], runs: [500,1000,2000,3000,5000], wickets: [25,50,100,150,200], catches: [25,50,100] }` and `approachWindow` default `{ games: 5, runs: 100, wickets: 10, catches: 5 }` (editable). `milestones.ts` returns, per player, `achieved[]` (with "reached in <season>" by cumulative sums over `seasonOrder`; season-level granularity only) and `approaching[]` (next threshold within window, remaining count). Public strip shows active (`isActive`) players only; admin Dashboard widget (`payload/components/Dashboard.tsx` + `dashboardCards.ts` neighbour, server component calling the same lib) shows all, including remaining counts and a link to the player admin page. Note: data updates after nightly sync, so "approaching" is as of last sync (shown as "as of" using the latest `player-sync-runs` finish time).

## 4. Feature details

### A2 Leaderboards `/stats`
Params: `season` (`all` default = career, or a `seasonName`), `grade` (a `gradeName` or `all`), `cat`, `juniors`, `metric` (default `runs`), `scope` implied by season. Tabs: Batting / Bowling / Fielding / Games rendered as `segmented-pill` links. Top 10 per metric on the hub view (cards), full list (top 50) per metric via `?metric=`. Ties share a rank. Rank badges for 1/2/3. Player name links to profile. Empty state when filters yield no rows. When `grade` is set, rows are filtered before merge (a player's stats in that grade only).

### A3 Records `/records`
Career: runs, highest score (with `*`), best average (min qual), sixes, fours, games, most seasons played, wickets, best bowling figures, maidens, best economy (qual), catches. Single season (merge by `(player, seasonName)`): runs, highest score, wickets, best figures, catches, best average (qual), best economy (qual). Each record lists holder, value, season, grade, and the next 4 for context (top 5). Ties listed together. NEW badge when the record's season is `seasonOrder === 0` (current/newest season) and the record is the top. Notes block states that innings-level records (best innings figures beyond personal best, partnerships, 100s counts) arrive with per-match storage (Tier B), phrased as a short "Coming" line only if the club copy enables it; default is to omit silently.

### A4 Profile upgrades
Existing `getPlayerProfile` stays; add `lib/players/profile-extras.ts` that takes profile seasons plus the cached league rows and returns: progression series (runs, average, wickets, games by season), best/worst season per metric, milestone badges (achieved), rank badges (career top 3 in any default-scope leaderboard metric for which the player qualifies), junior toggle. Season table gains highlight classes; page gets "Share card" button and links to `/players/compare?a=<slug>`. Sections omit cleanly when a player has no batting or bowling data (do not draw empty charts).

### A5 Compare `/players/compare?a=&b=`
Two native `<select>` pickers (server-provided list of public players, sorted by name, GET form) plus the shareable URL. Rows: career batting, bowling, fielding with the better value subtly highlighted (ties neither); per-season split table on a shared season axis; "career vs" only the common seasons toggle (`?common=1`). Invalid or unknown slugs show the pickers with an inline message (`error-box`), never a 500. Reserve the slug `compare` in `uniqueSlug` so a player can never shadow the static route (the static segment wins in Next routing, but the slug would be unreachable). Not available in Tier A: opposition history, dismissal patterns, recent form.

### A6 Stat cards
`app/api/public/players/[slug]/card/route.tsx`: `ImageResponse` 1200x630 (OG) and `?format=square` 1080x1080. Content: crest (club logo URL from `getClub`), name, years, 4 headline stats chosen by role (batter / bowler / allrounder by runs vs wickets), top rank badge if any. Brand black background, gold accents. Font: bundle one local font file read via `fs` (no network at render). `?season=` optional. Hidden or unknown players return 404; response `Cache-Control: public, s-maxage=3600, stale-while-revalidate`. Profile `generateMetadata` uses it as OG image when the player has no photo.

### A7 Honour board `/honours`
Parse `players.honours`: group by normalised title (trim, collapse spaces, case-insensitive key), list recipients with `years`. Year parsing: extract 4-digit years and `YYYY/YY` ranges for sorting; unparsable years sort last and still display verbatim. Category chips via keyword rules (defaults: Life Member, Hall of Fame, Premiership, Best and Fairest / Club Champion, Captain, Leadership/Role, Association honours, Other), overridable in site-settings `honourCategories` (array `{label, keywords[]}`). Two views: By honour (default), By year. Hidden players excluded. Empty state when no honours exist.

### A9 Season yearbooks
New collection `yearbooks` (`payload/collections/Yearbooks.ts`, group "Club"): `title`, `seasonName` (text, unique, validated against the pattern of existing `player-seasons.seasonName`, with an admin hint listing known seasons), `slug` (unique, from season, e.g. `2025-26`), `status` select `draft|published` (same custom pattern as Stories, not Payload versions, to avoid version tables), `cover` upload to `media`, `presidentMessage`, `coachMessage`, `sponsorMessage` (plain textarea, "blank line between paragraphs", consistent with player bio; max length validators), `photos` relationship hasMany to `gallery-photos`, `featuredSponsors` relationship hasMany to `sponsors`, `premiership` text (optional headline like "A Grade premiers"). Access: read `staffOr({ status: { equals: 'published' } })`; create/update/delete `isStaff`. Hooks: revalidate paths/tags; `trimStrings`.
Auto-filled sections (computed at request time, never stored): overview (games, W/L/D/win rate when PlayHQ has the season via `getClubGames`; otherwise omitted with `PlayhqUnavailable` style note), top batters / bowlers / fielders by season (from `player-seasons`, same leaderboard components, season-scoped, qualification at season level), most games, all-rounder honour (min 100 runs and 8 wickets, ranked by runs + 20 x wickets, documented heuristic), results by grade (PlayHQ games with score lines via `resultSentence`), honour board entries whose `years` mention the season, photos, sponsors, editorial messages. Seasons older than PlayHQ coverage show stats only. `/yearbooks` lists published yearbooks (cover cards, newest first) plus "Seasons with stats but no yearbook yet" is NOT shown publicly. Print: `@media print` hides nav/footer/filters, forces light background, page-break rules per section, "Print / save as PDF" button calling `window.print()`. Draft yearbooks 404 publicly; a staff preview route is out of scope.

### A10 Match archive `/matches`
Params `season` (default from `resolveSeason`), `grade`, `q` (opponent substring), `result` (won/lost/other). Reuses `getClubGames`, `GameRows` (`components/playhq/game-rows.tsx`) and `SeasonPicker`; adds a grade `segmented-pill` and opponent filter. Rows link to `/fixtures/[gameId]`. Finished games only, newest first, grouped by round. PlayHQ failure renders `PlayhqUnavailable`. Pagination by round groups (no unbounded DOM): cap 200 rows with "narrow by grade" message.

### A11 StatLab-lite `/statlab`
Query: `?scope=career|season|player-season&season=&grade=&cat=&cols=runs,avg,sr&sort=runs.desc&min.runs=100&q=` (all parsed by `query-string.ts` against the metric registry whitelist; unknown keys dropped; limits: max 12 columns, max 500 rows, `min` values clamped). Scopes: `career` (one row per player), `season` (one row per player x season, merged teams), `team-season` (one row per player-season row). Metric columns: every metric in the registry (about 25 incl. derived: batting average, SR, economy, bowling average, bowling strike rate, runs per game, wickets per game, catches per game, boundary runs %, = (4s*4+6s*6)/runs). Presets (typed list in `lib/stats/presets.ts`, each is just a query string): Top run scorers, Best batting averages, Hard hitters (SR and sixes), Strike bowlers, Economical bowlers, Maiden makers, Best seasons, All-rounders, Catching machines, Most capped, Rising stars (<= 3 seasons, ranked by runs per game), Active squad snapshot. "Save report" = copy URL; no DB. `GET /statlab/export?...same params` route handler returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename=langlang-statlab-<scope>.csv`, same parser/filters (single code path with the page), `csv.ts` injection guard, row cap 5,000, no player data beyond the public leaderboard fields (name, never ids or hidden players).

### A12 Shell
- Navigation: `navigation` in `payload/seed/club-defaults.ts` (defaults-module): add a "Stats" entry to `clubLinks` pointing to `/stats`; sub-pages are reached from `StatsSubNav` (avoids bloating the nav). Footer column gets Stats, Records, Honours, Yearbooks. `isActivePath` already matches by prefix.
- `pageCopy` (defaults-module, `club-defaults.ts`): add `stats`, `records`, `honours`, `statlab`, `yearbooks`, `matches`, `compare` entries each with `header: HeaderCopy` (eyebrow, title, intro) plus empty-state strings and caption text; `getClub()` merge unchanged. SEO: extend `SEO_PAGES` and `PAGE_LABELS` in `payload/globals/Club.ts` with `stats, records, honours, statlab, yearbooks, matches` (title/description editable, schema change, covered by migration).
- Sitemap (`app/sitemap.ts`): STATIC adds `/stats` (weekly 0.7), `/records` (weekly 0.6), `/honours` (monthly 0.5), `/yearbooks` (monthly 0.5), `/matches` (weekly 0.5), `/statlab` (monthly 0.4); dynamic `/yearbooks/[slug]` from published yearbooks (`status: published`). `/players/compare` and `/statlab/export` are excluded and `noindex` for parameterised views (canonical to the base path via `canonicalFor`).
- Structured data (`lib/structured-data.ts`): BreadcrumbList on new pages; `ItemList` of `Person` (name, url) for the leaderboard top 10; yearbook uses `Article`-like `CreativeWork` with `datePublished`. Never emit stats as unverifiable claims beyond the visible content.
- `robots.ts`: disallow `/statlab/export` and `/api/public/players/*/card` is allowed (OG fetchers).
- Admin: Dashboard "Milestones" widget; `yearbooks` card in `dashboardCards.ts`; site-settings `stats` tab.

## 5. Payload / schema changes

| Change | Migration |
|---|---|
| `site-settings.stats` group (categories, grade rules, qualification, milestones, honour categories) | WP-A |
| `club.pages.{stats,records,statlab}` (SEO) | WP-A |
| `club.pages.{honours,compare}` (SEO) | WP-B |
| `yearbooks` collection (+ `yearbooks_rels` for photos and sponsors) + `club.pages.{yearbooks,matches}` | WP-C |

Each WP: `pnpm payload migrate:create <name>`, hand-check that SQL is schema-qualified (`"payload"."..."`), `pnpm check:migrations`, `pnpm generate` (types + importmap), dev DB reset by `DROP SCHEMA payload CASCADE` via node `pg` when needed (payload push hangs non-TTY). No change to `players` or `player-seasons`. The sync is untouched except for the extra revalidation call.

## 6. Testing

Unit (vitest `--project unit`, `tests/stats-*.test.ts`): categories (matrix of grade names), aggregate/merge by season (two teams same season, best figures/high score), metrics (null handling, zero balls), qualify, rank ties and badges, records (ties, NEW flag), milestones (approach window, "reached in season"), progression series, honours parsing, query-string whitelist (garbage, overflow, duplicate keys), csv (injection guard, quoting), presets all parse. Integration (`tests/int`, local `langlang_test`): `stats-queries.int.test.ts` (hidden players excluded from every query; counts match seeded data), `yearbooks.int.test.ts` (anonymous read returns published only, draft hidden through REST `where[player]` style probing, staff sees all, slug uniqueness), route tests for CSV (headers, cap, guard) and card (404 hidden player, content-type `image/png`), sitemap test extended, structured-data tests extended, site-settings test for the new group defaults. Final-verify only: full `vitest`, `next build`, `eslint .`, `pnpm check:generated`, `pnpm check:migrations`.

## 7. Local seeding for acceptance checks

`pnpm fixture:legacy` + `pnpm etl` into `langlang_dev` loads only about four players, which suits the ETL parity tests but is too small for leaderboards. Add `payload/scripts/fixtures/stats-seed.ts` (`"fixture:stats": "payload run payload/scripts/fixtures/stats-seed.ts --"`):

- Calls `_guard.ts` first and refuses unless `DATABASE_URL` host is `127.0.0.1` and DB name is `langlang_dev` or `langlang_test`.
- Deterministic seeded PRNG (fixed seed), about 70 players with plausible names, 8 seasons (`Summer 2018/19` to `Summer 2025/26`, `seasonOrder` 0..7), grades A/B/C Grade plus a few rows named "Women's T20", "Over 40s" and "Under 16" so classification and the junior toggle can be exercised, 1 to 3 team rows per player-season (multi-team merge case), realistic counts (batters 150 to 600 runs/season, bowlers 8 to 35 wickets, some zero-ball rows, some `batBalls = 0`), planted known leaders (named test players with exact totals, e.g. a career 2,017-run batter, a 99-game player 1 short of the milestone), 20 players with honours (varied `years` formats and titles), 3 hidden players holding top stats (must never appear), 2 yearbooks (one published with messages and photos, one draft).
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
2. `/stats?metric=runs&season=all` top-5 equals the node-pg ground-truth query for non-hidden players; hidden seeded stars absent; planted career leader is #1 with gold badge.
3. `/stats?metric=avg` excludes players under 300 runs / 8 innings; `?season=Summer 2025/26&grade=B Grade` filters correctly; `?cat=` and `?juniors=1` change the set; invalid params fall back to defaults with 200.
4. `/records` career and season-best values match SQL cross-check; multi-team seasons are merged; NEW badge only on `seasonOrder 0`.
5. Changing `site-settings.stats` (a threshold and a grade rule) in the admin changes output after revalidation; an invalid regex is rejected at save.
6. Page HTML has one h1, sr-only table captions, no horizontal overflow at 375px (manual or Chrome check).

### WP-B: profile upgrades, compare, stat cards, honour board, milestones
Files:
- new `lib/stats/{progression,milestones,honours}.ts`, `lib/players/profile-extras.ts`
- edit `app/(frontend)/players/[slug]/page.tsx`, `components/players/player-season-tables.tsx` (highlights), `app/(frontend)/players/page.tsx` (milestone strip)
- new `components/stats/{progression-chart,milestone-strip,share-button,compare-table}.tsx`
- new `app/(frontend)/players/compare/page.tsx`, `app/(frontend)/honours/page.tsx`, `app/api/public/players/[slug]/card/route.tsx` (+ bundled font asset)
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
- new `app/(frontend)/yearbooks/page.tsx`, `yearbooks/[season]/page.tsx`, `matches/page.tsx`, `statlab/page.tsx`, `statlab/export/route.ts`
- new `components/stats/{yearbook-sections,statlab-form,column-picker}.tsx`; print CSS in `app/(frontend)/globals.css`
- edit `app/sitemap.ts` (+ dynamic yearbooks), `app/robots.ts`, `lib/structured-data.ts`, nav/footer defaults, `club-defaults.ts`, `Club.ts`
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
- **Senior-only data** means "include juniors" is mostly dormant until/unless junior seasons are synced; the UI hides empty categories rather than showing a dead toggle.
- **Free-text honours** will classify imperfectly; admin-editable keyword rules and verbatim display of unrecognised titles mitigate this.
- **Single-query load**: all `player-seasons` rows (hundreds of players x about 10 seasons, a few thousand rows) are fetched once and cached under tag `player-stats`; if this grows past about 20k rows, move aggregation to SQL (`payload.db.drizzle`).
- **Privacy**: hidden players excluded from every public query, export, card, comparison and sitemap; junior names are never shown (juniors are not stored).
- Tier B upgrade path: persist per-innings rows in the sync (same scorecards, no extra API calls), then add metrics to the registry; leaderboards, records and StatLab pick them up through `metrics.ts` without page changes.
