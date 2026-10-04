# W2 stats: match-data statistics, StatLab v2 and admin tools (design)

Date: 2026-10-04. Branch: feat/payload-cms. Tracking issue: #38. Builds on `2026-10-04-w1-foundation-design.md` (WP-M match store, WP-T theme). Work packages, in build order:

| WP | Issues | One line |
| --- | --- | --- |
| WP-S1 Derived stats | #3 #4 #5 #6 #7 | A pure, unit-tested library over the stored matches, and its pages: opposition, dismissals, partnerships, batting position, new leaderboard and record categories, milestones. |
| WP-S2 StatLab v2 and yearbooks | #8 #13 | Opponent, format, season and decade filters, 50 columns, 26 presets, saved reports, CSV; match-data sections on the yearbook. |
| WP-S3 Admin tools | #9 #10 #11 #12 | Historical CSV import and export, duplicate suggestions and merge undo, name and grade label overrides, a simple notification centre, an AI-assisted yearbook draft. |

Product goal (every WP): this repository is reused for other cricket clubs. Anything club-specific (colours, crest, fonts, names, copy, hosts, model ids) comes from the `theme` and `club` globals, `site-settings` or env (`config/site.ts`), never from code. Use Tailwind `brand-*` classes (CSS variables), never hex. No club name string in code outside `config/site.ts` and the seed defaults (guard tests exist). Everything below was checked against the code on this branch unless marked **(verify)**.

## 0. Rules that hold for the whole spec

1. **Honest by construction.** A figure is shown only when the rows behind it are complete enough. Otherwise it is `n/a` (a dash with a text alternative) or omitted, and a coverage line says why. Nothing is estimated, interpolated or defaulted to zero. Null means "not recorded" (W1 rule) and is never summed as 0.
2. **Two coverage windows exist and they differ.** `player-seasons` covers the PlayHQ seasons (what `coverage()` and `sinceLabel()` in `lib/stats/season-window.ts` report). The match store covers only games that were fetched and stored (`matches.localDate`, `matches.seasonStartYear`), which can start later and is missing games that failed to save. Every match-derived figure has its own caption computed from `matches`, never from `coverage()`.
3. **One caption format** (`lib/stats/match/coverage.ts`, `coverageCaption`): `From <first season or d MMM yyyy>, <N> games stored. <K> of <M> innings have <ball-by-ball totals | bowling figures | fall of wickets>.` The same function feeds pages, CSV headers and the yearbook.
4. **Sources never mix silently.** The 26 existing metrics keep reading `player-seasons` and stay the source of every existing leaderboard, record and profile line. Match-derived numbers sit beside them, labelled "from match data". A table that mixes sources is not allowed: see section 5.2 (mode rule).
5. **Hidden players and juniors.** The match store holds senior games only (W1) and club-side rows need a resolved, non-hidden player. Every public query in this spec restates FINAL-only and hidden-player filtering itself (the Local API ignores access, CLAUDE.md) and resolves names through `lib/match-store/names.ts` (a hidden player is "a club player"). The collections stay staff-read only; nothing here adds a public REST path to them.
6. **Personal data.** Emails and phones are never touched. Opposition player names are shown only on the single-match views W1 already exposes; no W2 page lists opposition individuals. CSV that contains player names (import templates with data, exports) is admin-only; public CSV is only the StatLab table the public page already shows. Every CSV writer goes through the hardened `csvCell` (section 5.4).
7. **Unverified shapes are labelled.** `run_out`, `stumped` and `retired_*` appear only in invented data (W1 M12; none of the three real captures contained them). Every statistic built on them is tagged **(verify)** below, shows a "based on a small number of recorded events" note while the live count is below 5, and the acceptance gate is the first real backfill log reporting those types with no `unknown_dismissal:` lines.
8. **Reuse, not rebuild.** Theme (`getTheme()`, `themedImageResponse()`), `Panel`, `SubHeading`, `PageHeader`, `LeaderboardTable`, `ProgressionChart` conventions (server-rendered inline SVG with `<title>`, `<desc>` and an adjacent table in `<details>`), `rankValues`/`rankBy`, `combineCounts`, `aggregateFromMatchRows`, `classifyGrade`, `effectiveCategories`, `statLabHref`/`parseStatLabParams`, `csvCell`/`toCsv`, `getPendingCounts`, `uniqueSlug`. No chart dependency.
9. Process rules of CLAUDE.md apply: feature docs, committee-admin classification, schema-qualified migrations, generated files committed, explicit-path conventional commits, never push, local DB only.

## 1. What the match store actually contains (investigation)

Read from `docs/features/match-data-store.mdx`, W1 spec M1 to M12, `payload/collections/Match*.ts`, `lib/playhq/match-rows.ts`, `lib/match-store/{read,queries,write,aggregate,names}.ts`, `lib/players/sync.ts`.

**Stored.** FINAL senior games only, one `matches` row per `gameId` with `result` (`won|lost|draw|tie|no_result|abandoned`, but abandoned is never stored), `byForfeit`, `onFirstInnings`, `type` (`oneDay|twoDay`), `seasonStartYear`, `gradeName`, `clubTeamName`, `opponentOrgId`/`opponentOrgName`, `opponentName`, `localDate`, toss, `isHome`. `match-innings` has `played` (false for the two-day placeholder innings), `declared`, `allOut`, `totalRuns/Wickets/Balls`, extras, and three coverage flags: `hasFallOfWickets`, `hasBowlingData`, `hasBallData`. `match-batting` has `position` (the scorer's `displayOrder`), `battingStatus` (`out|not_out|did_not_bat|unknown`), `runs`, nullable `balls/fours/sixes`, `dismissalType` (also set for some not-out batters, e.g. retired hurt, W1 M12), `bowlerAppearanceId`, `fielderAppearanceId` (only the first fielder of a run-out), `fowWicket`, `fowRuns`. `match-bowling` has `balls`, `maidens`, `runs`, `wickets`, `wides`, `noBalls` (rows only for overs > 0). `match-fielding` is informational. Identity lives only on `match-appearances` (`player`, `nameKey`, `isClubSide`, `displayName` for opposition). Read helpers today: `getMatchByGameId` and `readStoredBundles` (`lib/match-store/read.ts`).

**Limits that drive every rule below** (all verified in W1 fixtures, not assumed):

| Limit | Consequence |
| --- | --- |
| One real innings has no bowling or fielding data for the whole fielding side, but its dismissal events exist. | Bowling stats and wickets-by-type need `hasBowlingData`; dismissal events alone give batter-side facts. |
| One real innings has only `TOTAL_RUNS` per batter: no balls, fours or sixes. | Strike rate, boundary share, golden ducks and balls per boundary need `hasBallData` per innings and use only those innings. |
| `fallOfWickets` exists in some innings only (one-day innings 1 had none, innings 2 had it; two-day innings 3 and 4 had none). | Partnerships are available per innings, never assumed. |
| Partner identity is not provided by PlayHQ. | Pairs are inferred from batting order plus fall of wickets and labelled `inferred`, never `exact`. |
| A captured real innings is 6 runs off (batters plus extras versus team total). | Never recompute a team total from rows. Partnership runs are team-score differences (exact); per-batter contributions inside a partnership do not exist. |
| No keeper flag on appearances; `keeperCatches` depends on the scorer. | Caught-behind is partial (section 2.5). |
| No PlayHQ player id; identity is a name key. | Same-name players can merge, spelling changes can split (existing alias and merge tools). Duplicate suggestions (WP-S3b) lean on this. |
| Forfeits are FINAL and stored (playing side only listed); abandoned games are never stored; club-vs-club games are skipped; DLS keeps only won or lost. | Rules in section 2.7. |
| Junior games are not stored. | The juniors toggle never has match data; pages say so instead of showing an empty table. |

W1 also exposes two seams W2 must respect: `aggregateFromMatchRows` already reproduces the `player-seasons` counts from match rows, with zero reconciliation tolerance, and the nightly reconcile counter shows how far the two sources disagree. W2 never switches a source over (W1 4.2); that stays a later decision once the counter has been zero for a period.

**Foundation gap found: strike rate over partial ball data.** `SeasonCounts.batBalls` is a plain sum, so an innings with runs but no recorded balls adds runs to the strike-rate numerator without adding balls to the denominator, which inflates strike rate (and deflates boundary share, because fours and sixes are also missing while the runs count). W1 says rates must treat null as absent, but `SeasonCounts` cannot express it. WP-S1 adds one integer, `batRunsUnballed` (runs scored in innings with no ball data, 0 for fully recorded rows), to `SeasonCounts`, `combineCounts`, `pickCounts`, the `player-seasons` collection and the sync/aggregate mappers, so strike rate and boundary share use `batRuns - batRunsUnballed` (a player whose every innings lacks ball data gets `n/a`, not a wrong number). This also gives imported season totals (WP-S3a) an honest way to omit balls. It is included in the sync reconcile (zero tolerance).

## 2. Derivation rules (pure, `lib/stats/match/`)

Input unit: an innings of one stored match with its rows and the match header, produced from `StoredBundle` (read layer) plus the set of visible player ids. All functions are pure and take plain data.

### 2.1 Which innings and rows count

- An innings counts only when `played = true` (excludes the two-day placeholder). A forfeit has no played innings, so it contributes nothing to batting, bowling, fielding, partnership or dismissal stats.
- A batting row counts as an innings when `battingStatus != did_not_bat`. `unknown` counts as an innings but is neither "out" nor "not out" for averages (same as `aggregateFromMatchRows`), and is never a duck. Absent hurt arrives as `did_not_bat` and is excluded; the player still has an appearance (so `games` matches the season table, which counts every listed player).
- Retired: `retired_hurt` and `retired` are not-out innings and not dismissals; `retired_out` is an out innings and a dismissal of type "retired out" but credits no bowler or fielder. **(verify)** all three.

### 2.2 Batting milestones

| Stat | Rule |
| --- | --- |
| Fifty | `runs 50..99`, out or not out. |
| Hundred | `runs >= 100`. A hundred is not also a fifty. |
| Duck | `battingStatus = out`, `runs = 0`, `dismissalType != retired_out`. A `0*` is not a duck; retired hurt on 0 is not a duck. |
| Golden duck | A duck whose `balls = 1` (needs non-null `balls`). `n/a` where `balls` is null. |
| Fifty conversion | hundreds / (fifties + hundreds), shown only with at least 5 scores of 50 or more. |
| Five-wicket haul | A bowling row with `wickets >= 5` in one innings. |
| Three-for | `wickets >= 3`. |
| Ten in a match | Sum of one player's wickets over the innings of a single `gameId` is 10 or more (two-day games). |
| Not-out count | `battingStatus = not_out`. |

Counts of 50s, 100s, ducks and five-fors need no ball or bowling flag for the batting ones (`runs` and `status` are always stored). Five-fors and three-fors need `hasBowlingData`; where an innings lacks it, that innings is simply absent from the count and the coverage line says "K of M innings have bowling figures".

### 2.3 Dismissals (issue #4)

- **Batter chart.** For a player's innings with `battingStatus = out` and a `dismissalType`: bowled, caught (split below), caught and bowled, lbw, stumped, run out, hit wicket, retired out, other. Not-out innings are a separate "not out" segment (with a footnote counting retired hurt). An `out` row with no `dismissalType` is "not recorded" and shown as such, never folded into "other".
- **Bowler chart.** Wickets credited to a bowler by type: bowled, caught, caught and bowled, lbw, stumped, hit wicket. Run outs and retirements are never credited to a bowler. An innings enters the bowler chart only when `hasBowlingData` and the number of dismissals credited to that bowler equals his `match-bowling.wickets`; innings that fail the check are excluded and counted ("K of M wicket-taking innings reconcile with the scorecard").
- **Caught behind (partial).** There is no keeper flag. For a fielder in an innings with a `match-fielding` row, with `c` caught dismissals credited to him (excluding caught and bowled) and `k = keeperCatches`: `min(k, c)` count as caught behind, `c - min(k,c)` as caught in the field when `k > 0`, and all `c` as "caught (not split)" when `k = 0` or no fielding row exists (a zero may simply mean the scorer did not enter it). The split is therefore only claimed in aggregate per fielder per innings, and never for a single named dismissal when `0 < k < c`. The chart legend says "Caught behind is only shown where the scorer recorded wicket-keeper catches".
- **Fielding credits.** Catches, run-outs and stumpings come from dismissal events with `fielderAppearanceId` (same source as the W1 catches rule), not from `match-fielding` counts. A run-out with two fielders credits only the stored first fielder, so shared run-outs are undercounted; the docs and column help say so. Stumpings credit the stored fielder (the keeper). **(verify)** run-out and stumping attribution against the first real data.

### 2.4 Partnerships (issue #5), `lib/stats/match/partnerships.ts`

Only for innings with `isClubBatting`, `played`, `hasFallOfWickets`. Algorithm:

1. Rows with `battingStatus != did_not_bat` sorted by `position`; the first two are the openers. Any row with `dismissalType` in `retired`, `retired_hurt`, `retired_out`, or a `position` of 0 or duplicated, makes the innings **unavailable** for partnerships (a retirement leaves no wicket entry and breaks the pairing). This is deliberately conservative.
2. Validation (from W1 M1): the set of `fowWicket` values must be exactly `1..N`, every `out` row must have an `fowWicket` and every row with an `fowWicket` must be `out`, `N` must equal the innings' `totalWickets`, `fowRuns` must be non-decreasing, and the batter dismissed at wicket `k` must be one of the two batters currently at the crease. Any failure marks the innings unavailable (counted, never repaired).
3. Simulation: crease = {pos 1, pos 2}. For `k = 1..N`: the dismissed batter and the other batter at the crease form the wicket-`k` partnership, runs = `fowRuns[k] - fowRuns[k-1]` (with `fowRuns[0] = 0`); the dismissed batter is replaced by the next unused position.
4. Unbroken last stand: when `!allOut` and exactly two `not_out` batters remain, runs = `totalRuns - fowRuns[N]`, wicket number `N+1`, flagged `unbroken`. An all-out innings has no unbroken pair. If `totalRuns` is null the pair is skipped.
5. Output per pair: `{ gameId, inningsSeq, wicket, runs, playerA, playerB (visible ids or null), unbroken, confidence: 'inferred' }`. Runs include extras; PlayHQ gives no per-batter share, so none is shown.
6. Hidden players: a pair with a hidden partner is omitted from club records; on the visible partner's profile it is listed with "a club player". Balls and minutes of a partnership are not available and not shown.
7. Coverage: "N of M club batting innings have complete fall of wickets." A partnership record with `N = 0` shows no ranking at all.

### 2.5 Batting position (issue #6)

`position` is the scorer's card order (`displayOrder`), not proof of who walked in first; the label says "batting order as scored". Buckets are constants (`POSITION_BUCKETS`): opener 1-2, top and middle 3-5, lower middle 6-7, tail 8-11. Per bucket: innings, runs, average (out innings only), not outs, high score, fifties. A bucket shows an average only with at least `positionInnings` (default 5) innings, otherwise the raw counts and `n/a`. Also: most common position (tie goes to the lower number), average position. Rows with position 0 (the "no data" marker seen on the bowling side) are excluded and counted.

### 2.6 Opposition (issue #3), `lib/stats/match/opposition.ts`

- **Key.** `oppositionKey = opponentOrgId ?? 'n:' + slug(normaliseClubName(opponentOrgName ?? opponentName))`. `normaliseClubName` lower-cases, removes punctuation, strips a trailing "cricket club", "cc", "c c", "club", grade or team suffixes ("2nds", "A Grade"), collapses spaces. PlayHQ org ids are stable, so the name fallback exists only for imported matches (no org id) and can split one club into two; the admin label rename (WP-S3c, `kind: 'opponent'`) merges name variants. **Label** = the most recent `opponentOrgName`.
- **Player table.** Per opposition: games, batting innings, runs, average, high score, fifties, hundreds, ducks, wickets, runs conceded, best figures, economy, catches. Averages and economy need at least `oppositionInnings` (default 3) innings (batting) or `oppositionBalls` (default 72, twelve overs) recorded (bowling); below that the raw counts show and the rate is `n/a`. Bowling columns use only innings with `hasBowlingData`.
- **Club head to head.** Per opposition: played, won, lost, drawn, tied, no result, forfeits (marked), last meeting, highest and lowest club score and highest and lowest conceded (played innings with a total only). Sort by played, then label.
- **Grade filter.** The same category checks as `/stats` (`classifyGrade(canonicalGrade(gradeName), clubTeamName, rules)`), default senior-style categories from `effectiveCategories`. The juniors checkbox is replaced by a note "Junior games are not in the match data".

### 2.7 Results, forfeits and edge cases

| Case | Rule |
| --- | --- |
| `won` (including `onFirstInnings`) | Win, with the first-innings marker shown. |
| `lost` | Loss. |
| `draw`, `tie`, `no_result` | "Other", reported separately, never as win or loss. |
| `byForfeit` | Counted in the results tables with a "forfeit" mark; excluded from win percentage (both directions) and from every batting, bowling, fielding, partnership and dismissal figure. Appearances still count toward `games`, consistent with the season table. Win percentage here will therefore differ from the PlayHQ ladder, which counts forfeits; this is intended and the caption says "excludes forfeits", so nobody should "fix" it to match. |
| Abandoned / not final | Never stored. W2 never shows them; yearbook live-results totals already exclude them (`summariseResults`). |
| DLS | Stored as won or lost only. No margin, target or overs are shown; the docs say so. |
| Two-day games | Per-innings stats are per innings (a player can have two ducks in a game). Results and partnership lists are per innings; "games" is per game. |
| Win percentage | `won / (won + lost + draw + tie)` over non-forfeit, non-no-result games, only with `winGames` (default 10) such games. |
| Imported matches | `source = 'import'`. They carry no fall of wickets and usually no balls, so they feed counts and averages but never partnerships, and their coverage flags are false. |

### 2.8 Minimums at club scale

A club of this size has about 20 regulars per team and roughly 20 to 40 games a season per team, so a three-season window gives a regular 30 to 90 innings and only a handful of innings against any one opponent. Defaults (admin-editable in `site-settings.stats.matchMinimums`, siblings of `qualification`, never literals; seven numbers): `oppositionInnings 3`, `oppositionBalls 72`, `positionInnings 5`, `rateInnings 10` (duck percentage and dismissal shares need 10 dismissals), `winGames 10`, `ballsForBoundary 100`, `partnershipPairGames 2` (a per-player "most successful partner" needs at least two shared partnerships). Count leaderboards use the existing `count` qualifier (value above zero), so "Most fifties" lists everyone with at least one.

## 3. Caching, performance and revalidation

**Where the data is read.**

- **Club-wide boards, records, StatLab, yearbook:** one cached slim columnar blob per season of innings facts (`['match-facts', seasonStartYear]`), exactly the `SlimSeason` pattern in `lib/stats/queries.ts`: a header table of matches (id, date, opposition key and label index, grade index, format, result, flags) plus integer rows for batting, bowling and credit facts per visible club-side player. Estimated size: 80 games a season per club x about 35 rows x 14 integers is roughly 150 KB; a test asserts that a generated worst case of ten teams stays under 1.5 MB (the `unstable_cache` entry cap is 2 MB) and the loader splits by grade if it would not.
- **Player profile sections:** one cached blob per player (`['player-match-facts', playerId]`, an `appearances (player, match)` index lookup, a few hundred rows at most). The profile route must be ISR like `/stats` (`export const revalidate = 900`; it has no export today, **(verify)** and add it).
- **Partnerships:** derived inside the per-season loader (needs the full innings), cached as part of the season blob (a few hundred pairs).
- Nothing queries match rows per anonymous request without the cache. Admin-only pages (import preview, duplicate suggestions) query uncached.

**Tags and a latent inconsistency.** The nightly sync revalidates `player-stats` (via `revalidatePlayerPages`) and `match-store`, but the merge endpoint, the `players` hooks (`STATS_TAGS`) and the `site-settings` hook revalidate only `player-stats`, and nothing reads `match-store` today. A match-derived cache tagged only `match-store` would go stale after a hide, merge or grade-rule change. Rule: **every stats cache (old and new) carries both tags**, defined once as `STATS_TAGS = ['player-stats', 'match-store']` in `lib/stats/tags.ts`, and one helper `revalidateStats()` replaces the literals. Files to change: `lib/stats/queries.ts` (`cached()`), `lib/players/revalidate.ts`, `payload/collections/Players.ts`, `payload/globals/SiteSettings.ts`, `payload/endpoints/mergePlayers.ts` (via `revalidatePlayerPages`), `lib/players/sync.ts` (its explicit tag list), and the new import, undo and label-rename paths. A unit test greps that no file passes a bare tag literal to `revalidatePaths`.

**Freshness.** Pages stay ISR 900 s plus tag revalidation after every sync, merge, import, undo and settings save.

## 4. WP-S1 Derived stats, profile sections, leaderboards, records (issues #3 #4 #5 #6 #7)

### 4.1 Library (pure, no DB, no Next)

New `lib/stats/match/`:

| File | Contents |
| --- | --- |
| `types.ts` | `InningsFacts`, `BatFact`, `BowlFact`, `CreditFact`, `MatchHeader`, `MatchCounts`. |
| `facts.ts` | `deriveFacts(bundle, visibleIds)` turns a `StoredBundle` into facts (applies 2.1). |
| `counts.ts` | `matchCountsOf(facts)` returns `MatchCounts` (fifties, hundreds, ducks, goldenDucks, fiveFors, threeFors, tenWicketMatches, runOuts, stumpings, caught split, dismissal tallies, position tallies, results, plus the denominators `battingInnings`, `ballInnings`, `bowlingInnings`, `reconciledWicketInnings`). |
| `dismissals.ts` | batter and bowler breakdowns and the caught-behind rule (2.3). |
| `partnerships.ts` | validation, simulation, `bestByWicket`, `topN`, `forPlayer` (2.4). |
| `position.ts` | buckets and per-bucket lines (2.5). |
| `opposition.ts` | key, normalisation, player and club tables (2.6). |
| `coverage.ts` | `MatchCoverage` and `coverageCaption` (rule 0.3). |
| `metrics.ts` | match metric registry (4.3). |

Foundation edits: `batRunsUnballed` (section 1), `lib/stats/labels.ts` (`canonicalGrade`, `canonicalTeam`, `applyLabels`, section 6.3; shipped here because every read below uses it), `lib/stats/tags.ts`.

Server-only queries `lib/match-store/stats-queries.ts` (the only reader of match rows for pages): `getMatchCoverage()`, `getSeasonFacts(seasonStartYear)` (cached), `getAllFacts()`, `getPlayerMatchFacts(playerId)` (cached), `getClubPartnerships(filter)`, `getOppositionTable(playerId)`, `getHeadToHead(filter)`. Each restates FINAL-only and non-hidden filtering.

### 4.2 Pages and components

- **Player profile** `app/(frontend)/players/[slug]/page.tsx`: a "Match analysis" block after "Season progression", with an anchor sub-nav (no client tabs, no search params, so ISR stays): Against each opposition, How out / How wickets came, Partnerships, Batting position. Sections are omitted when the player has no match rows; each carries its coverage caption. The opposition table is a small client component that sorts by runs or wickets (server renders the default order, so it works without JS). Components in `components/stats/match/`: `opposition-table.tsx`, `dismissal-chart.tsx` (horizontal stacked bar, inline SVG, `fill-brand-*`, legend and counts in a table in `<details>`, not colour alone), `partnership-list.tsx`, `position-table.tsx` (table, with a small inline SVG bar per bucket).
- **Club head to head:** `app/(frontend)/stats/opposition/page.tsx` (ISR 900; stats sub-nav gains "Opposition"). Per-opposition rows link to `?club=<key>` anchored detail (best scores, last meeting).
- **Partnership records:** a section on `/records` ("Partnerships": best at each wicket 1 to 10) and `app/(frontend)/records/partnerships/page.tsx` (top 25 overall, season selector, category filter), all labelled "inferred from batting order and fall of wickets" with the coverage caption.
- **Leaderboards and records:** `/stats` gains metrics `fifties`, `hundreds`, `ducks`, `fiveFors`, `runOuts`, `stumpings` (and `goldenDucks` only when ball data exists) in the existing metric select, each with the match-data caption and "counts recorded innings only". `/records` gains the matching "most in the stored matches" lists plus best innings figures and highest score with opposition and date. Ducks sit last under a neutral heading. Rank, ties and the `take`/hard-cap rules reuse `rankValues` and `records.ts` helpers.
- **Milestone counters:** new match milestones (50s `[1,5,10,25]`, 100s `[1,2,5]`, five-fors `[1,3,5]`, constants in `lib/stats/match/milestones.ts`) on profile badges and the stats milestone strip. They are explicitly "since <first stored match date>": there is no baseline field for them, so they are never merged into the games/runs/wickets/catches milestones that do have baselines, and they never claim lifetime totals. Admin-configurable thresholds are deferred.
- **StatLab columns** appear in WP-S2 (deviation from the task text, which listed them under WP-S1: the columns are only useful together with the match-mode rule and filters, so they ship with StatLab v2).

### 4.3 Match metrics

`MatchMetric` mirrors `Metric` (`key`, `label`, `short`, `group`, `value`, `format`, `higherIsBetter`, `qualifier`) but takes `MatchCounts` and adds `coverage(c): {known, total} | null` and `needs: 'balls' | 'bowling' | 'fow' | null`. A value is `null` (shown as the dash) when the denominator innings are zero. New qualifier kinds for the rate ones, reading `matchMinimums`.

### 4.4 Access, schema, migrations

- `player-seasons.batRunsUnballed` (number, default 0), `site-settings.stats.matchMinimums` group (seven numbers with defaults). One migration `w2_s1_stats` (schema-qualified, with the `payload.player_seasons` column and the settings columns), `pnpm generate`, `pnpm check:generated`, `pnpm check:migrations`.
- No new collection, no new access rule, no nav entry (the everyday cap of 16 in `tests/admin-visibility.test.ts` is already full and nothing here is everyday).
- The sync (`lib/playhq/players.ts` aggregation and `lib/match-store/aggregate.ts`) fills `batRunsUnballed`; reconcile compares it.

### 4.5 Tests

Unit (`tests/`, no DB): `stats-match-facts`, `stats-match-counts` (every rule in 2.2 with edge rows: 49/50/99/100, 0*, retired hurt on 0, golden duck with null balls, five-for with and without bowling data, two-day ten-wicket match), `stats-match-dismissals` (caught split cases `k=0`, `0<k<c`, `k>=c`, no fielding row; bowler reconciliation mismatch), `stats-match-partnerships` (clean ten-wicket, all-out, declared with unbroken stand, two-day innings 3 with no FoW, retirement, gap in `fowWicket`, non-monotonic runs, hidden partner), `stats-match-position`, `stats-match-opposition` (key, name fallback, minimum rules), `stats-match-coverage`, `stats-batting-runs-unballed`, `stats-tags` (no bare literals). Fixtures come from the W1 seed generator (`payload/scripts/fixtures/match-seed-data.ts`) plus tiny hand-built bundles.
Integration (`tests/int/`): `match-stats-queries.int` (seed demo into the test DB; hidden player absent everywhere, including as partner; forfeits excluded; revalidation tags), `match-stats-reconcile.int` (derived counts equal `aggregateFromMatchRows` for fifties+runs sanity and `batRunsUnballed` reconciles), `match-stats-pages.int` (render opposition, partnership records and a profile section against the seeded DB).

### 4.6 Docs

New `docs/features/match-stats.mdx` (profile sections, opposition, dismissals, positions, new categories, honesty rules and every "n/a" case), `partnership-records.mdx`; updated `stats-leaderboards.mdx`, `club-records.mdx`, `milestones.mdx`, `players-directory-and-profiles.mdx`, `match-data-store.mdx` (no longer "no page reads the rows"), `index.mdx`.

### 4.7 Seed

Extend `payload/scripts/fixtures/match-seed-data.ts` and `seed-demo`: fall of wickets in most club innings (and none in two, one with a retirement, one with a gap), at least one fifty, one hundred, three ducks (one golden with balls, one with null balls), a five-for and a three-for, a two-day ten-wicket match, run out and stumped events, three opponent clubs with repeated meetings so averages cross the minimum, a hidden player in a partnership, and one innings with no ball data.

### 4.8 Acceptance (local)

1. `pnpm seed:demo`, open a seeded player: opposition, dismissal, partnership and position sections render, each with a caption; an innings without ball data does not appear in strike rate.
2. `/stats?metric=fifties` ranks and shows "From <date>, N games stored".
3. `/records` partnership section lists inferred pairs, the unbroken stand is marked, a retirement innings is absent and counted in the caption.
4. `/stats/opposition` totals match the seeded match list; forfeit games marked, not in win percentage.
5. Hide a player: gone from every board, profile 404s, partner lists show "a club player".
6. `pnpm test` unit files above green, `match-stats-*.int` green.

### 4.9 Risks

- Inferred partnerships can be wrong when the scorer's `displayOrder` is not arrival order; the validation rejects most such innings and the label says `inferred`. Acceptance includes a manual comparison of three real innings after the first backfill.
- `run_out` and `stumped` shapes are unverified (rule 0.7).
- `batRunsUnballed` touches the sync aggregator; the reconcile counter must stay at zero after deploy, otherwise the change is reverted before anything else ships.
- Per-season blob growth (guard test, split by grade).
- Opposition name fallback can split a club (only for imported rows).

## 5. WP-S2 StatLab v2, saved reports, yearbook sections (issues #8 #13)

### 5.1 Filters and columns

New filters in `StatLabParams` (all validated by the existing whitelist parser, which never throws): `opp` (an `oppositionKey` from the known list), `fmt` (`oneDay|twoDay`), `decade` (`2020`, bucketed from `seasonStartYear`), alongside season, grade, categories. `statLabHref` canonicalises them (sorted keys, defaults omitted), so equal reports share a URL. Imported matches without a `format` value are excluded when `fmt` is set.

**Mode rule (no silent mixing).** If any selected column is match-only, or any of `opp`, `fmt`, `decade` is set, the whole table is computed from match rows: the 26 classic metrics come from `aggregateFromMatchRows` (so they exist for any opponent), the match metrics from `matchCountsOf`, and strike rate and boundary share use `batRunsUnballed`. Otherwise the table is computed from `player-seasons` exactly as today. The table caption says which ("Season totals since 2023/24" or "From match data, <coverage caption>") and match-only column headers carry a "match data" marker. A match-only column in season mode forces match mode; the UI explains this in one line when the column picker toggles it.

**Columns.** 26 existing plus 24 new, 50 in the registry (the picker still allows 12 at a time): `fifties`, `hundreds`, `ducks`, `goldenDucks`, `fiveFors`, `threeFors`, `runOuts`, `stumpings`, `bowledPct`, `caughtPct`, `lbwPct` (shares of dismissals, minimum `rateInnings`), `notOutPct`, `avgPosition`, `openerInnings`, `openerAvg`, `middleAvg` (positions 3-5), `lowerAvg` (6-11), `bestPartnership`, `partnerships50`, `wins`, `winPct` (minimum `winGames`), `runsInWins`, `wicketsInWins`, `opponentsFaced`, `ballsPerBoundary` (minimum `ballsForBoundary`), `fiftyConversion`. Each column states its rule in the column picker help text.

### 5.2 Presets (26)

Twelve existing plus fourteen match-data presets, each a plain StatLab URL: `fifty-makers`, `century-makers`, `five-for-club`, `run-out-specialists`, `stumpings`, `openers-report`, `middle-order-engine`, `lower-order-runs`, `ducks-club`, `boundary-hitters` (balls per boundary), `best-partnerships`, `converters`, `wins-when-they-play`, `most-opponents-faced`. Opponent-specific presets are not shipped (an opponent key is data, not code); a preset with `decade` uses the current decade computed at read time. `PRESETS` stays in `lib/stats/presets.ts`; a unit test asserts at least 25, unique keys, every column exists and every preset parses unchanged through `parseStatLabParams`.

### 5.3 Saved reports (`saved-reports` collection)

| Field | Notes |
| --- | --- |
| `title` | Required, 80 characters. |
| `slug` | `uniqueSlug`, hook-owned (`nobodyField` create/update). |
| `visibility` | `public` or `admin` (default `admin`). |
| `owner` | Relationship to `users`, set by a `beforeChange` hook from `req.user`, hook-owned. |
| `query` | Text, at most 2000 characters: the canonical StatLab query string. |
| `description` | Optional, 300 characters. |

The strict schema is the existing parser: a `beforeValidate` hook runs the stored string through `parseStatLabParams` (against the live seasons, grades, opposition keys) and `statLabHref`, replaces it with the canonical form, and rejects an empty column set or anything that is not a query string. No JSON blob, no expressions, no code. Cap of 200 reports (hook). Access: `read` is `anyone` where `visibility = public`, otherwise admin only; create, update, delete are admin only (the owner is recorded for audit). Public pages state their own `visibility = public` filter (Local API). Classified in `advancedNav` ("Saved reports") with `admin.hidden: hiddenFromEditors`; plain-English labels; no everyday entry.

UI: `/statlab` gets a "Saved reports" list (public ones) and, for admins only, a server action "Save this report" (title, visibility). `/statlab/r/[slug]` renders a report through the same `runStatLab` path, ISR with tag `saved-reports` plus `STATS_TAGS`, canonical link, and a themed share card `app/(frontend)/statlab/r/[slug]/opengraph-image.tsx` built on `themedImageResponse()` (title, row count, top three names, brand colours from `ctx.theme.colors`; `./assets/fonts/**` already traced in `next.config.ts`). Shareable URL = the canonical StatLab href or the short `/statlab/r/<slug>`.

### 5.4 CSV export

`/statlab/export` keeps its route and cap. Additions: header comment lines `# <coverage caption>` and `# source: season totals | match data` (lines starting with `#`, written through `csvCell`), a `Source` column when match mode, and a hardened `csvCell` (spec for tests): dangerous leading characters are tested after trimming leading whitespace and include the full-width forms `＝ ＋ － ＠` and `|` at the start of a text cell, tab and carriage return; text beginning with those gets a leading `'`; numbers are written as numbers; a re-importable export (WP-S3a) strips one leading `'` only when the next character is one of `=+-@`. Public export contains only what the public table shows (visible players, classic and match metrics); no name columns beyond the player name already public.

### 5.5 Yearbook (`/yearbooks/[slug]`, the real route; the issue text says `[season]`)

`app/(frontend)/yearbooks/[slug]/page.tsx` gains four sections, shown only when the season has stored matches, each with the coverage caption and "N of M finished games stored" (M from the existing live fixtures call when it is available), and falling back silently to today's sections otherwise:

1. **Results by grade with scores** (replaces the PlayHQ-only `resultsByGrade` when stored data is complete enough, otherwise both are not mixed: the section states which source it uses). Rows: date, round, opponent, club score and opposition score as `runs/wickets (overs)` from `match-innings` (two-day games show both innings), result letter and word, forfeit mark. Grade names pass through `canonicalGrade`.
2. **Win/loss progression.** One inline SVG per grade: a result strip (a cell per game in date order with a letter `W L D T N`, never colour alone) above a stepped line of cumulative wins minus losses. Title, description and an adjacent table. Brand classes only.
3. **Partnership records for the season:** best pair at each wicket and the top five, inferred and captioned.
4. **Season highlights and all-rounder awards** (clearly "stat leaders, not club honours"): top all-rounder with the existing `allRounderScore` rule (reused, not redefined) overall and per grade category with minimums in constants (`GRADE_ALLROUNDER_MIN`), highest score with opposition and date, best bowling figures, most fifties, best partnership. Honours stay a separate, committee-entered section.

### 5.6 Files

New: `lib/stats/match/*` (S1), `lib/stats/match-statlab.ts`, `payload/collections/SavedReports.ts`, `lib/stats/saved-reports.ts` (canonicalise, queries), `app/(frontend)/statlab/r/[slug]/{page,opengraph-image}.tsx`, `components/stats/match/yearbook-*.tsx`, `components/stats/win-loss-chart.tsx`. Changed: `lib/stats/{statlab,presets,csv,metrics,statlab-queries,query-string}.ts`, `components/stats/{statlab-form,column-picker,filter-bar}.tsx`, the yearbook page and `yearbook-sections.tsx`, `payload.config.ts`, `payload/admin/navigation.ts`.

### 5.7 Migration

`w2_s2_saved_reports` creates `payload.saved_reports` and the `payload_locked_documents_rels` column.

### 5.8 Tests

Unit: `stats-statlab-v2` (parse, canonical href, mode rule, filters, 50 columns exist, minimums), `stats-presets-v2`, `stats-csv-injection` (leading `= + - @`, tab, CR, space-then-`=`, full-width forms, pipe, negative numbers stay numbers, round trip with the import un-escape), `saved-reports-canonical`, `stats-yearbook-match` (results lines, progression series, highlights), `win-loss-chart-render`. Integration: `saved-reports.int` (public vs admin read over REST, owner stamped, invalid query rejected, cap, unknown params dropped), `statlab-v2.int` (opponent filter equals manual sum over seeded rows; match mode and season mode captions; export body), `yearbook-match.int` (sections appear with seeded matches, absent without; draft yearbook still 404). Extend `tests/admin-visibility.test.ts` for the new collection.

### 5.9 Docs

Updated `statlab-and-csv-export.mdx` (v2 filters, mode rule, columns), `season-yearbooks.mdx`; new `saved-reports.mdx`; `index.mdx`.

### 5.10 Seed

Four saved reports (three public, one admin only) built from presets; the demo yearbook for the seeded season with published status so the new sections render.

### 5.11 Acceptance (local)

1. `/statlab?opp=<key>&cols=runs,avg,fifties` shows the match-mode caption; clearing the opponent and the match column returns the season-mode caption.
2. All 26 presets open, parse and render without error; export of each starts with the coverage comment and no cell begins with `=`.
3. As admin save a report; public one opens at `/statlab/r/<slug>` with its share card (`/statlab/r/<slug>/opengraph-image` returns a PNG); admin-only one 404s when signed out.
4. Seeded yearbook shows results with scores, the progression SVG with letters, partnership records and highlights.

### 5.12 Risks

Match mode versus season mode confusion (mitigated by the caption and the forced-mode note); response size of the per-season blobs in a wide career query (guard test); report cap and query validation drift when metric keys are renamed (a saved report with an unknown key keeps loading because unknown columns are dropped, and the page says so); OG font tracing (reuse the W1 include).

## 6. WP-S3 Admin tools (issues #9 #10 #11 #12)

### 6.1 (a) Historical CSV import and export (#9)

**UI and routes.** An admin-only custom view `payload/components/HistoryImportView.tsx` at `/admin/history-import` ("Import and export history", entry in `advancedNav`, not everyday). Endpoints in `payload/endpoints/historyImport.ts`, all requiring `role = admin`: `GET /api/history-import/template/:kind`, `POST /api/history-import/preview`, `POST /api/history-import/apply`, `POST /api/history-import/undo-batch`, `GET /api/history-import/export/:kind` (`kind` is `season-totals` or `match-rows`).

**Templates** (`lib/history-import/templates.ts`; header plus two clearly fake example rows for `Example Player`, which the importer rejects with "remove the example rows"):

- Season totals: `season, team, grade, first_name, last_name, games, bat_innings, bat_not_outs, bat_runs, bat_high_score, bat_high_score_not_out, bat_balls, bat_fours, bat_sixes, bowl_overs, bowl_maidens, bowl_runs, bowl_wickets, best_wickets, best_runs, catches`. Blank balls, fours and sixes are allowed and mean "not recorded" (the importer sets `batBalls`, `batFours`, `batSixes` to 0 and `batRunsUnballed = batRuns`, so strike rate shows `n/a` for that season, not a wrong number). `bowl_overs` uses cricket notation and goes through `oversToBalls`.
- Match rows (one row per player per game): `date, grade, team, opponent, format (one_day|two_day|blank), result, team_runs, team_wickets, opp_runs, opp_wickets, first_name, last_name, batted, runs, balls, fours, sixes, how_out, overs, maidens, runs_conceded, wickets, catches, run_outs, stumpings`. Blank means not recorded. Team and opposition totals, when given, must agree on every row of the same game. Bowler and fielder names are deliberately not importable (club people are never stored as text, W1).

**Parsing and validation** (pure, `lib/history-import/{csv-parse,season-totals,match-rows,plan}.ts`): RFC 4180 parser, BOM stripped, limits of 2 MB, 5,000 rows and 40 columns; every row validated with row-level errors that name the row number, column and plain-English reason (unknown header, bad season shape, number out of range, high score above runs, not-outs above innings, `how_out` not in the list, a date that does not belong to the season, junior grade rejected using the same `JUNIOR_GRADE_RE` rule, `0` wickets with a best figure, unknown or duplicate player). Text cells starting with `=`, `+`, `-` or `@` are rejected so injection cannot be stored (exports also guard). A leading `'` written by our exporter is stripped only before those four characters.

**Players.** Resolve by name key through `player_aliases`. An unknown name is a warning that lists the closest existing players (the WP-S3b similarity function); the admin ticks "create new players for unknown names" to proceed, otherwise those rows are errors. Created players use `source: 'manual'`, an alias, and are never hidden by default.

**Dry run.** `preview` returns `{ summary: { create, update, unchanged, errors, warnings }, rowErrors[], newPlayers[], overlaps[], fileHash }` and writes nothing. `apply` re-parses the same file, refuses unless every row is valid, and runs in one drizzle transaction. Idempotency: season totals upsert on `(player, teamId = 'import:<season>:<teamSlug>')` (the existing unique index); matches upsert on `gameId = 'imp:' + sha1(date | team | opponent)` with children replaced wholesale, like the sync. Re-importing the same file reports `unchanged`. A season that PlayHQ already covers for that player (or a match whose date and opponent exist as a PlayHQ game) is an error ("PlayHQ already has this"), so history is never double counted.

**Schema.** `player-seasons` and `matches` get `source` (`playhq|import`, default `playhq`) and `importBatch` (text, for undo of a whole import). `player-seasons.seasonStartYear` (number, nullable). Imported matches use a synthetic non-null `clubTeamId` of `import:<teamSlug>` (and `clubTeamName` from the file), the same idea as the season rows' synthetic `teamId`. Match innings stubs for imported games set the three coverage flags false and store totals only when supplied (the totals columns are already nullable).

**The sync must never touch imports** (the change that makes the tag true): in `lib/players/sync.ts` the season replace becomes `DELETE ... WHERE source = 'playhq'` (also in the partial-pair branch), and the wipe guard's `existing` count (step 6) counts `source = 'playhq'` rows only, otherwise a club that imports history before its first sync would be refused forever; `pruneStaleMatches`, `relinkMatchPlayers` (still relinks imports through aliases, which is wanted, but never deletes), `reconcileMatchStore`, `storedMatchIndex` and the backfill plan exclude `source = 'import'`. **Season ordering.** `seasonOrder` is renumbered by the sync against the newest PlayHQ group (W1 M2), so imported seasons get `seasonOrder = maxPlayhqOrder + max(1, oldestPlayhqStartYear - importedStartYear)`, recomputed by `renumberImportedSeasons()` at the end of every sync and after every import; imported rows therefore sort strictly older than PlayHQ rows, never count as "current", and never flip the derived active flag (`ACTIVE_MAX_SEASON_ORDER`). **(verify)** the active-flag code path with a test.

**Export.** `export/season-totals` and `export/match-rows` write the current data with a `source` column, including imported rows, so an export re-imports as a no-op. Hidden players are included (admin-only) with a `hidden` column. Opposition players are never exported. All cells go through `csvCell`.

**Undo of an import:** `undo-batch` deletes the rows tagged with a given `importBatch` (admin, confirmation, one transaction), then `revalidateStats()`.

### 6.2 (b) Duplicate suggestions and merge undo (#10)

**Collection `merge-log`** (internal: `internalCollection`, written by code only, hidden from all roles, listed in `internalCollections`): `kind` (`merge|dismissed`), `status` (`applied|undone|dismissed`), `sourcePlayerId`, `sourceName`, `targetPlayer` (relationship, set null on delete), `snapshot` (json), `createdBy`, `createdAt`, `undoneAt`, `undoneBy`. Reads happen through the admin view with `overrideAccess`.

**Snapshot, taken inside the merge transaction before any write** (`payload/endpoints/mergePlayers.ts`): the full source `players` row; its `players_honours` rows (ids and `_order`) and the max `_order` on the target; its `player_aliases` rows (ids, name keys); its `player_seasons` rows (ids and counts) and, for combined teams, the target row's original counts and id, plus `moveSeasonIds`; the target's pre-merge `photo`, `bio`, `isActiveDerived`; ids of `people` and `player_sponsors` rows that pointed at the source; ids of `match_appearances` moved. Size bound: tens of season rows and under a thousand appearance ids, below 100 KB.

**Undo** (`POST /api/players/merge-log/:id/undo`, admin): in one transaction, re-insert the source player with its original id and slug, restore its aliases (so future syncs route its name key to it again and not the target), move honours back by recorded ids and restore `_order`, restore combined target counts and re-insert the source rows, move season rows, `people`, `player_sponsors` and `match_appearances` back by recorded ids, revert the target patch only for fields still equal to the merged value, mark the log `undone`, `revalidatePlayerPages()`. Refused with a plain message when the target no longer exists (merged again: undo that one first), when the log is older than 30 days (`MERGE_UNDO_DAYS`; season rows would be stale), or already undone. A season refresh note: "Season totals will refresh at tonight's sync, or press Sync now." Sync routing is correct immediately because alias rows are the routing table.

**Suggestions** (`lib/players/duplicates.ts`, pure, unit-tested; query in `lib/players/duplicate-queries.ts`): candidate pairs are scored 0 to 100 from name similarity on the `first|last` key (Jaro-Winkler, swapped first and last, initial versus full first name, a small shipped nickname table such as Bob and Robert, edit distance 1 on either part) with weight 0.6, plus overlap with weight 0.4 (same club team in the same or adjacent seasons, never both active in the same season on different teams of the same grade, similar grade). **Veto:** two players who appear in the same game (same `match` in `match-appearances`) cannot be one person and are excluded outright (this is what the match store buys us), as are pairs dismissed before (`merge-log kind: dismissed`). Same-name pairs that never co-appear rank first. Only pairs scoring at least 60 are listed, at most 50, each with reasons in plain English ("same name spelt differently", "played for A Grade in 2023/24 and 2024/25 and never in the same game"). Hidden players are included (admin-only view) with a marker.

**UI:** custom admin view `payload/components/DuplicatePlayersView.tsx` at `/admin/duplicate-players` ("Duplicate players", `advancedNav`): ranked pairs, "Merge into ..." (which side keeps the profile is chosen by games played, overridable), "Not the same person", and a "Recent merges" list with an Undo button. The existing merge field on the player edit page is unchanged and now also writes a log row.

### 6.3 (c) Name and grade label overrides (#11)

**Findings.** `players.firstName` and `lastName` are editable and the sync only inserts new players (it never rewrites names, `lib/players/sync.ts` step 5), so an edited name already survives syncs, but editing it does not change the alias key and `displayName` is rederived from the names. The real gap is a display-only preferred name (a nickname) that does not touch identity, and the label problem below.

- **Preferred name.** `players.preferredName` (optional text, 100 characters, editor-editable, helper text "Shown on the site instead of the PlayHQ name"). The `displayName` hook yields `preferredName || fullName`, and a new `shownName(p) = displayName?.trim() || playerName(p)` replaces `playerName` at every read that selects names (`lib/stats/queries.ts` `loadPlayers`, `lib/match-store/queries.ts` `loadPlayerNames`, players queries, people queries; a grep-based unit test lists remaining direct uses). Aliases, name keys and merges never see it.
- **Grade and team label mapping, single source.** `lib/stats/labels.ts`: `normaliseLabel` (trim, collapse spaces, strip a leading numbering such as `2. `, `2) `, case-fold for comparison), `canonicalGrade(raw, map)`, `canonicalTeam(raw, map)`, and `canonicalOpponent(raw, map)`. Algorithm: the comparison key is the normalised label; an admin mapping entry `{ kind: 'grade'|'team'|'opponent', from, to }` (matched on the normalised key) wins; otherwise the displayed label is the most frequent original spelling in the data for that key (so "B Grade" and "B grade" collapse deterministically). Stored rows are never rewritten (the sync replaces them every night); the mapping is applied at read time. This is what tidies "2. Senior Men District" versus "Senior Men District", "Senior Men B Grade" versus "Senior Men B grade", "Senior Men E Grade East" versus "Senior Men E grade East".
- **Settings.** `site-settings.stats.labelRenames` array (`kind`, `from`, `to`), under the existing Advanced "Site settings" entry (no new nav). A small admin field component `payload/components/LabelRenamesHelp.tsx` lists the distinct labels currently in the data with counts and what each resolves to, so the admin picks from real names.
- **Consumers (every one changes together, one function):** `classifyGrade` (the canonical label is tested first, then the raw one, so existing grade rules keep working and a rename can intentionally change the category), `filterRows`/`gradeNames`/`availableCategories` in `lib/stats/leaderboard.ts`, `RecordEntry.grades` in `records.ts`, `careerOf`/`mergeBySeason` grade lists, StatLab identity columns and the grade filter, `resultsByGrade` and the new yearbook results, the match-store queries (`matches.gradeName`, `clubTeamName`, opposition labels), saved-report validation (grades are validated after canonicalisation), and the opponent label in 2.6. Applied in `getVisibleStatData` after the cached rows are expanded, using `getStatsSettings()`, which already revalidates with `STATS_TAGS`.
- **Shared links.** `?grade=` values are validated against canonical names, so an existing shared URL that uses a raw spelling falls back to "all grades" once a rename or the default normalisation merges that spelling. The parser therefore also accepts a raw spelling and maps it through `canonicalGrade` before validating, so old links keep working.
- **Risk note in the UI help:** renaming a grade can change its category (that is the point), so the admin sees the resulting category beside each mapping.

### 6.4 (d) Notification centre (#11)

No new collection, migration or nav entry. `payload/components/NotificationCentre.tsx` (RSC) replaces the "Needs your attention" block on `Dashboard.tsx` (the committee still sees a short list, admins also see technical lines). Sources, all existing: the latest `player-sync-runs` rows; `getPendingCounts` (stories and photos, as today); **new milestones**, which are computed once per sync, not per page load: at the end of `writeMatchStore` (its own try/catch, like the rest of the match step) the sync compares each visible player's totals now against totals excluding the games of the last 7 local days (`aggregateFromMatchRows`), and stores the crossed thresholds, capped at five, as `milestonesCrossed` (json) on the `player-sync-runs` row (one extra column, added in the `w2_s3_import_tags` migration). Home only reads the latest run row, so the page does no match-row query; it links to the milestones widget, which stays as is; and, for admins, the duplicate-suggestion count and the import log. Copy lives in `payload/admin/copy.ts` and is plain: committee sees "Player stats were updated last night" or "Last night's stats update did not finish. The site is still showing the previous numbers. Please tell the site administrator." Admins additionally see counts (`matchError`, `matchMismatches`, matches saved) and a link to Sync runs. Never raw error text for editors.

### 6.5 (e) AI-assisted yearbook narrative (#12)

- **Dependency.** Add `ai` (AI SDK) to `package.json`; the call is `generateText({ model, prompt })` with a plain `provider/model` string routed through the Vercel AI Gateway **(verify the exact call shape and current model ids against the `vercel:ai-gateway` and `vercel:ai-sdk` skills at build time)**. The `model` string comes from `process.env.YEARBOOK_AI_MODEL`, falling back to `AI_DEFAULTS.yearbookModel` in `config/site.ts`; no model id appears in app or library code.
- **Gate.** `aiConfigured()` is true when `AI_GATEWAY_API_KEY` is set or, on Vercel, the OIDC token is present. When false the admin button is disabled with the sentence "AI drafting is not set up on this site" and the endpoint returns 503. No network call is made when unconfigured, in dev, or in tests.
- **Endpoint** `POST /api/yearbooks/:id/draft-summary` (collection endpoint, `role = admin`). It builds a prompt from published aggregates only: the season record and by-grade results, the leaders already shown on the public yearbook (non-hidden players), highlights from match data, and honours entered for that season. It never receives opposition player names, emails, phones, bios or hidden players, and the prompt instructs the model to use only the supplied facts, never invent events, and write at most 300 words of plain prose with the club's configured locale. It returns the text and **does not save the text**. It writes only the bookkeeping on the yearbook row (through the Local API, hook-owned fields): `seasonSummaryAi = true`, `aiDraftAt`, and the counters. The draft text lives in the form until the editor saves it.
- **Flag lifecycle (one rule).** `seasonSummaryAi` is cleared by a `beforeChange` hook whenever the saved `seasonSummary` is empty, and is otherwise only ever set by the endpoint. An editor who discards the draft (leaves the field empty or restores the previous text and clears the AI flag by the "Discard AI draft" button, which calls a small endpoint that clears it) is therefore never blocked or labelled; an editor who edits the draft keeps the flag until they tick `seasonSummaryChecked`, which is the only way to publish with the flag set (an editor who replaces the whole text by their own writing still has to tick "I have read and corrected this text", which is cheap and keeps the rule simple and auditable).
- **Admin UI.** A button "Draft a season summary" (client field component on the yearbook edit page) fills `seasonSummary` in the form (not saved until the editor saves), shows the notice "AI-assisted draft, please check", and the editor reads and edits. New yearbook fields: `seasonSummary` (textarea, 6000 characters, editor-visible like the other messages), `seasonSummaryAi` (checkbox, hook-owned, set by the endpoint's result), `seasonSummaryChecked` (checkbox, "I have read and corrected this text", editor), `aiDraftAt` and `aiDraftCount`/`aiDraftDay` (hook-owned, rate-limit bookkeeping). **Never auto-published:** a `beforeChange` validation refuses `status = published` while `seasonSummaryAi && !seasonSummaryChecked`, with a plain message. A new draft resets `seasonSummaryChecked`. The public yearbook shows the summary with a one-line, config-driven note ("Written with AI assistance and checked by the committee", `club.pageCopy.yearbooks.aiNote`) when the flag is set.
- **Rate limit** (serverless-safe, stored): at most 5 drafts per yearbook per day and `AI_DAILY_DRAFT_LIMIT` (default 20) across the site per day, computed from `aiDraftAt`; a 60 second cooldown per yearbook. Refusals return a friendly message.
- **Tests, mocked:** `lib/ai/yearbook-draft.ts` takes an injected `generate` function; unit tests cover the prompt builder (no hidden names, no personal fields, deterministic ordering), the gate matrix (key, OIDC, neither), the model-id resolution (env over config), the publish gate hook and the rate limits. No test imports the real model; `ai` is mocked at module level.

### 6.6 Files, migrations, access

New: `lib/history-import/*`, `payload/endpoints/{historyImport,mergeUndo,yearbookDraft}.ts`, `payload/components/{HistoryImportView,DuplicatePlayersView,NotificationCentre,LabelRenamesHelp,YearbookDraftButton}.tsx`, `payload/collections/MergeLog.ts`, `lib/players/{duplicates,duplicate-queries,merge-snapshot}.ts`, `lib/stats/labels.ts`, `lib/ai/yearbook-draft.ts`, `lib/stats/match/milestones-new.ts` (pure, called by the sync). Changed: `payload/endpoints/mergePlayers.ts`, `payload/collections/{PlayerSeasons,Matches,Players,Yearbooks}.ts`, `payload/globals/SiteSettings.ts`, `lib/players/sync.ts`, `payload/collections/PlayerSyncRuns.ts`, `lib/match-store/{write,reconcile}.ts`, `payload/admin/{navigation,copy}.ts`, `Dashboard.tsx`, `config/site.ts`, `package.json`, `.env.example` (documents `AI_GATEWAY_API_KEY`, `YEARBOOK_AI_MODEL`, `AI_DAILY_DRAFT_LIMIT`; no key is ever committed or put in `.env.local`).

Migrations: `w2_s3_import_tags` (`player_seasons.source/import_batch/season_start_year`, `matches.source/import_batch`, `player_sync_runs.milestones_crossed`), `w2_s3_labels_names` (`players.preferred_name`, `site_settings` label-renames array table), `w2_s3_merge_log` (`payload.merge_log`, locked-docs column), `w2_s3_yearbook_ai` (yearbook fields). Each is schema-qualified, `check:migrations` replays them, and the `players` hooks and `site-settings` stay on `revalidateStats()`.

Classification for the committee admin: `merge-log` is an `internalCollection`; `saved-reports` (S2), the import view and the duplicates view are `advancedNav` entries with `hiddenFromEditors`; the notification centre is part of Home; no everyday entry is added (cap 16 is full).

### 6.7 Tests

Unit: `history-import-parse` (limits, BOM, quotes, apostrophe rule), `history-import-season-totals` and `-match-rows` (every error message above, unballed rule, consistency of team totals), `history-import-plan` (idempotency keys, overlap with PlayHQ, new-player warnings), `players-duplicates` (similarity cases, nickname table, co-appearance veto, dismissed pairs, ranking), `players-merge-snapshot` (snapshot completeness against `planMerge`), `stats-labels` (normalisation on the real variants, mapping precedence, category effect, most-frequent-spelling tie rule), `notifications-new-milestones`, `yearbook-draft-prompt`, `yearbook-draft-gate`, `yearbook-draft-rate-limit`, `yearbook-publish-gate`.
Integration: `history-import.int` (preview writes nothing, apply is atomic, re-apply is unchanged, sync run afterwards leaves imported season and match rows intact, active flags unaffected, undo-batch), `merge-undo.int` (merge, undo, then a simulated sync routes the original name key to the restored player; refusals after 30 days or after a later merge), `labels.int` (rename changes grade filters, records and category; stored rows unchanged), `preferred-name.int` (survives a sync, absent from aliases), `yearbook-ai.int` (endpoint with an injected generator; 503 when unconfigured; counters; editor cannot call it), plus the access suite additions for `merge-log`, `saved-reports`.

### 6.8 Docs

New: `history-import-export.mdx`, `duplicate-players-and-undo.mdx`, `name-and-grade-labels.mdx`, `admin-notifications.mdx`, `ai-season-summary.mdx`. Updated: `playhq-player-sync.mdx` (merge, import safety), `committee-admin.mdx`, `players-directory-and-profiles.mdx` (preferred name), `season-yearbooks.mdx`, `club-and-site-settings.mdx` (label renames, minimums), `index.mdx`, `help` content in `payload/admin/helpContent.ts`.

### 6.9 Seed (demo)

Invented grade variants ("2. Demo District" and "Demo District", "Demo B Grade" and "Demo B grade") with one label rename; a near-duplicate pair of invented players (different spellings, same team, never in one game) plus one merged-and-undoable example (the merge log row created by running the real merge, not hand-written); a preferred name on one player; sample import CSVs under `tests/fixtures/history-import/` (valid, with errors, and an overlap case) used by tests and by the acceptance steps; a hand-written (not AI) season summary on the demo yearbook.

### 6.10 Acceptance (local)

1. Download both templates, import the valid fixtures: preview shows counts, apply creates rows tagged `import`; re-apply reports unchanged; the error fixture lists row numbers and reasons and writes nothing.
2. Run the sync against fixtures (no live PlayHQ): imported rows survive and order below PlayHQ seasons.
3. Open Duplicate players: the seeded pair ranks first with reasons, the same-game pair is absent; merge it, then Undo: aliases, honours, seasons, people and appearances return; run a sync fixture and confirm the original name key still routes to the restored player.
4. Add a label rename: leaderboards, filters, records and the yearbook show one grade name; the category follows the rename.
5. Home shows the plain notification list; force a failed sync run in the test DB and see the committee wording and the admin counts.
6. With no AI env the button is disabled; with a test-only stub generator (int test) a draft fills the field with the notice and publishing is blocked until "checked" is ticked.

### 6.11 Risks

- The sync change (`DELETE ... WHERE source = 'playhq'`) is the safety-critical edit: covered by a dedicated int test and reviewed first. A bug here could delete imported history or leave stale PlayHQ rows.
- Undo restores a snapshot while the sync may have run since: bounded by the 30 day window, the explicit refresh note and the next nightly rewrite.
- Label renames are read-time only, so any new code path that reads `gradeName` directly would bypass them; the unit test greps for direct `gradeName` use outside `lib/stats/labels.ts` consumers.
- The `ai` dependency and model id availability on the gateway; everything is gated and defaults to off.
- Import data entry errors are the main data risk; mitigated by the dry run, undo of a batch, the overlap block and the junior rule.

## 7. Interfaces W3 and later rely on

```ts
// lib/stats/match/types.ts, counts.ts, partnerships.ts, opposition.ts, coverage.ts (pure)
export function deriveFacts(bundle: StoredBundle, visibleIds: ReadonlySet<number>): InningsFacts[]
export function matchCountsOf(facts: readonly InningsFacts[]): MatchCounts
export function derivePartnerships(i: InningsFacts): { pairs: Partnership[]; unavailable: string | null }
export function oppositionKey(m: { opponentOrgId: string | null; opponentOrgName: string | null; opponentName: string | null }): string
export function coverageCaption(c: MatchCoverage, need?: 'balls' | 'bowling' | 'fow'): string

// lib/match-store/stats-queries.ts (server-only; FINAL, non-hidden, cached with STATS_TAGS)
export function getSeasonFacts(seasonStartYear: number): Promise<SeasonFacts>
export function getPlayerMatchFacts(playerId: number): Promise<PlayerMatchFacts | null>
export function getMatchCoverage(): Promise<MatchCoverage>

// lib/stats/labels.ts (pure)
export function canonicalGrade(raw: string | null, map: LabelMap): string
export function applyLabels<T extends { gradeName?: string | null; teamName?: string | null }>(rows: T[], map: LabelMap): T[]

// lib/stats/tags.ts
export const STATS_TAGS: readonly ['player-stats', 'match-store']
export function revalidateStats(paths?: string[]): Promise<void>

// lib/history-import/plan.ts (pure)
export function planSeasonTotalsImport(rows: ParsedRow[], ctx: ImportContext): ImportPlan
export function planMatchRowsImport(rows: ParsedRow[], ctx: ImportContext): ImportPlan
```

Rules for later waves: use `STATS_TAGS`; never read `gradeName` raw; never store a club person as text; imported rows are `source = 'import'` and never deleted by sync code; a new match-derived statistic ships with its derivation rule in section 2, a coverage caption and a unit test for each edge case.

## 8. Data-quality assumptions about the real data (inferred from the repo)

- **Grade names are inconsistent.** Captured fixtures show `Senior Men B Grade` (38) and `Senior Men B grade` (6), `Senior Men D Grade` and `D grade`, `Senior Men E Grade East` and `E grade East`, `Senior Men E`, `Senior Men E Grade`, `Premier` versus `Senior Men Premier`, `Senior Men 1 Day Comp` versus `Senior Men One Day`, a bare `Senior Men` and `Senior Competition`; the committee also reported `2. Senior Men District` next to `Senior Men District` in real data (not in the fixtures; a leading numbering). Assumption: case, spacing and leading-number variants are the same grade; East/West and format variants are not, unless an admin maps them.
- **Juniors.** Classification is regex based (`JUNIOR_GRADE_RE`: `u12`, `under 14`, `junior(s)`, `girls`, `boys`, `youth`; `JUNIOR_COMPETITION_RE` also drops winter competitions). A fixture grade `U15 All Star Girls` is junior. Assumption: the sync is senior-only, so the match store has no junior rows; a grade whose name matches no junior word but contains only juniors would leak into senior stats and into the match store, which is why imports reuse the same rule and the label mapping can reclassify.
- **Windows.** The existing presets assume stored seasons from 2023/24; the match store starts at whatever the backfill loads, so match-derived figures can cover fewer seasons than season totals and must say so.
- **Names.** No PlayHQ player id; one name can be two people and one person can have two spellings, so duplicates exist in production and some name keys already map via aliases.
- **Real shapes seen:** fall of wickets in some innings only, entire fielding sides with no bowling data, innings with runs but no balls/4s/6s, a 6-run discrepancy, a placeholder second innings in two-day games, forfeit games FINAL with only the playing side listed, abandoned games with no data (not stored). **Unseen:** run out, stumped and retired in real data.
- **Opponents.** `opponentOrgId` is stable; team names vary per grade and season. Imported history has no org id.
- **Format.** Most club grades are one format each, so the format filter is mostly redundant with grade at this club (two-day senior grades versus the one-day competition); it stays because it costs nothing and other clubs mix formats.

## 9. Final Verify step (once, at the end of W2)

1. `pnpm tsc --noEmit`, `pnpm lint`.
2. `pnpm generate`, `git add` the generated files, `pnpm check:generated`, `pnpm check:migrations`.
3. `pnpm test` (unit), then `pnpm test:int` (sequential; both share the test DB, never two vitest processes at once).
4. One `pnpm build` (output tailed).
5. `pnpm seed:demo` against `langlang_dev`, then the acceptance lists in 4.8, 5.11 and 6.10 on a dev server (ports 3700 to 3799), screenshots of a profile section, the partnership records, StatLab match mode, the yearbook sections, the import preview and the duplicates view.
6. `tests/feature-docs.test.ts` and `tests/no-brand-hex.test.ts` pass; `rg 'Lang Lang' app components lib payload` finds nothing new outside config and seed defaults.
7. Reconcile counter on the demo sync run is zero after the `batRunsUnballed` change.

## Appendix A. Issue to section map

| Issue | Sections |
| --- | --- |
| #3 opposition | 2.6, 4.2, 4.5 |
| #4 dismissals | 2.3, 4.2 |
| #5 partnerships | 2.4, 4.2, 5.5 |
| #6 batting position | 2.5, 4.2 |
| #7 new categories | 2.2, 4.2, 4.3, 5.1 |
| #8 report builder | 5.1 to 5.4 |
| #13 yearbook | 5.5 |
| #9 import and export | 6.1 |
| #10 merge suggestions and undo | 6.2 |
| #11 admin tools | 6.3, 6.4 |
| #12 AI narrative | 6.5 |

## Appendix B. Decisions worth challenging

- `batRunsUnballed` modifies the core season shape to make strike rate honest; the alternative (match-only strike rate) was rejected because imported seasons need it too.
- Partnerships are conservative (any retirement or inconsistency makes an innings unavailable) at the cost of coverage.
- Saved reports store a canonical query string rather than a JSON schema because the existing parser is already a strict whitelist and a second validator would drift.
- Milestone counters for 50s, 100s and five-fors are "since first stored match" with no baseline fields, to avoid claiming lifetime totals.
- Label renames are read-time mappings, not data rewrites, because the sync replaces rows nightly.
