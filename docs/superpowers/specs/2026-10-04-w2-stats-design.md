# W2 stats: match-data statistics, StatLab v2 and admin tools (design)

Date: 2026-10-04. Branch: feat/payload-cms. Tracking issue: #38. Builds on `2026-10-04-w1-foundation-design.md` (WP-M match store, WP-T theme). Work packages, in build order:

| WP | Issues | One line |
| --- | --- | --- |
| WP-S1 Derived stats | #3 #4 #5 #6 #7 | A pure, unit-tested library over the stored matches, and its pages: opposition, dismissals, partnerships, batting position, new leaderboard and record categories, milestones. |
| WP-S2 StatLab v2 and yearbooks | #8 #13 | Opponent, format and season filters, about 40 columns, 18 presets, an admin-only saved-report list, CSV; match-data sections on the yearbook. |
| WP-S3 Admin tools | #9 #10 #11 #12 | Historical CSV import and export, duplicate suggestions and merge undo, name and grade label overrides, a simple notification centre (no new milestone computation), an AI-assisted yearbook draft. |

Product goal (every WP): this repository is reused for other cricket clubs. Anything club-specific (colours, crest, fonts, names, copy, hosts, model ids) comes from the `theme` and `club` globals, `site-settings` or env (`config/site.ts`), never from code. Use Tailwind `brand-*` classes (CSS variables), never hex. No club name string in code outside `config/site.ts` and the seed defaults (guard tests exist). Everything below was checked against the code on this branch unless marked **(verify)**.

## 0. Rules that hold for the whole spec

1. **Honest by construction.** A figure is shown only when the rows behind it are complete enough. Otherwise it is `n/a` (a dash with a text alternative) or omitted, and a coverage line says why. Nothing is estimated, interpolated or defaulted to zero. Null means "not recorded" (W1 rule) and is never summed as 0.
2. **Two coverage windows exist and they differ.** `player-seasons` covers the PlayHQ seasons (what `coverage()` and `sinceLabel()` in `lib/stats/season-window.ts` report). The match store covers only games that were fetched and stored (`matches.localDate`, `matches.seasonStartYear`), which can start later and is missing games that failed to save. Every match-derived figure has its own caption computed from `matches`, never from `coverage()`.
3. **One caption format** (`lib/stats/match/coverage.ts`, `coverageCaption`): `From <first season or d MMM yyyy>, <N> games stored. <K> of <M> innings have <ball-by-ball totals | bowling figures | fall of wickets>.` The same function feeds pages, CSV headers and the yearbook.
4. **Sources never mix silently.** The 26 existing metrics keep reading `player-seasons` and stay the source of every existing leaderboard, record and profile line. Match-derived numbers sit beside them, labelled "from match data". A table, or a page, that mixes sources is not allowed: see section 5.1 (mode rule); the yearbook follows the same rule (5.5).
5. **Hidden players and juniors.** The match store holds senior games only (W1) and club-side rows need a resolved, non-hidden player. Every public query in this spec restates FINAL-only and hidden-player filtering itself (the Local API ignores access, CLAUDE.md) and resolves names through `lib/match-store/names.ts` (a hidden player is "a club player"). The collections stay staff-read only; nothing here adds a public REST path to them.
6. **Personal data.** Emails and phones are never touched. Opposition player names are shown only on the single-match views W1 already exposes; no W2 page lists opposition individuals. CSV that contains player names (import templates with data, exports) is admin-only; public CSV is only the StatLab table the public page already shows. Every CSV writer goes through the hardened `csvCell` (section 5.4).
7. **Unverified shapes are labelled.** `run_out`, `stumped` and `retired_*` appear only in invented data (W1 M12; none of the three real captures contained them). Every statistic built on them is tagged **(verify)** below, shows a "based on a small number of recorded events" note while the live count is below 5, and the acceptance gate is the first real backfill log reporting those types with no `unknown_dismissal:` lines.
8. **Reuse, not rebuild.** Theme (`getTheme()`, `themedImageResponse()`), `Panel`, `SubHeading`, `PageHeader`, `LeaderboardTable`, `ProgressionChart` conventions (server-rendered inline SVG with `<title>`, `<desc>` and an adjacent table in `<details>`), `rankValues`/`rankBy`, `combineCounts`, `aggregateFromMatchRows`, `classifyGrade`, `effectiveCategories`, `statLabHref`/`parseStatLabParams`, `csvCell`/`toCsv`, `getPendingCounts`, `uniqueSlug`. No chart dependency.
9. Process rules of CLAUDE.md apply: feature docs, committee-admin classification, schema-qualified migrations, generated files committed, explicit-path conventional commits, never push, local DB only.

## 1. What the match store actually contains (investigation)

Read from `docs/features/match-data-store.mdx`, W1 spec M1 to M12, `payload/collections/Match*.ts`, `lib/playhq/match-rows.ts`, `lib/match-store/{read,queries,write,aggregate,names}.ts`, `lib/players/sync.ts`.

**Stored.** FINAL senior games only, one `matches` row per `gameId` with `result` (`won|lost|draw|tie|no_result|abandoned`, but abandoned is never stored), `byForfeit`, `onFirstInnings`, `type` (`oneDay|twoDay`), `seasonStartYear`, `gradeName`, `clubTeamName`, `opponentOrgId`/`opponentOrgName`, `opponentName`, `localDate`, toss, `isHome`. `match-innings` has `played` (false for the two-day placeholder innings), `declared`, `allOut`, `totalRuns/Wickets/Balls`, extras, and three coverage flags: `hasFallOfWickets`, `hasBowlingData`, `hasBallData`. `match-batting` has `position` (the scorer's `displayOrder`), `battingStatus` (`out|not_out|did_not_bat|unknown`), `runs`, nullable `balls/fours/sixes`, `dismissalType` (also set for some not-out batters, e.g. retired hurt, W1 M12), `bowlerAppearanceId`, `fielderAppearanceId` (only the first fielder of a run-out), `fowWicket`, `fowRuns`. `match-bowling` has `balls`, `maidens`, `runs`, `wickets`, `wides`, `noBalls` (rows only for overs > 0). `match-fielding` has `catches`, `keeperCatches`, `stumpings`, `runOutsAssisted`, `runOutsUnassisted` per appearance and innings (the source for run-outs and stumpings, section 2.3). Identity lives only on `match-appearances` (`player`, `nameKey`, `isClubSide`, `displayName` for opposition). Read helpers today: `getMatchByGameId` and `readStoredBundles` (`lib/match-store/read.ts`).

**Limits that drive every rule below** (all verified in W1 fixtures, not assumed):

| Limit | Consequence |
| --- | --- |
| One real innings has no bowling or fielding data for the whole fielding side, but its dismissal events exist. | Bowling stats and wickets-by-type need `hasBowlingData`; dismissal events alone give batter-side facts. |
| One real innings has only `TOTAL_RUNS` per batter: no balls, fours or sixes. | `hasBallData` is true when any batter in the innings has `BALLS_FACED` (`lib/playhq/match-rows.ts`), so it is not a per-row guarantee. Ball-based figures decide **per batting row** (section 2.2a), never from the innings flag. |
| `fallOfWickets` exists in some innings only (one-day innings 1 had none, innings 2 had it; two-day innings 3 and 4 had none). | Partnerships are available per innings, never assumed. |
| Partner identity is not provided by PlayHQ. | Pairs are inferred from batting order plus fall of wickets and labelled `inferred`, never `exact`. |
| A captured real innings is 6 runs off (batters plus extras versus team total). | Never recompute a team total from rows. Partnership runs are team-score differences (exact); per-batter contributions inside a partnership do not exist. |
| No keeper flag on appearances; `keeperCatches` depends on the scorer. | Caught is one segment; `keeperCatches` is only a plain optional column (section 2.3). |
| No PlayHQ player id; identity is a name key. | Same-name players can merge, spelling changes can split (existing alias and merge tools). Duplicate suggestions (WP-S3b) lean on this. |
| Forfeits are FINAL and stored (playing side only listed); abandoned games are never stored; club-vs-club games are skipped; DLS keeps only won or lost. | Rules in section 2.7. |
| Junior games are not stored. | The juniors toggle never has match data; pages say so instead of showing an empty table. |

W1 also exposes two seams W2 must respect: `aggregateFromMatchRows` already reproduces the `player-seasons` counts from match rows, with zero reconciliation tolerance, and the nightly reconcile counter shows how far the two sources disagree. W2 never switches a source over (W1 4.2); that stays a later decision once the counter has been zero for a period.

**Foundation gap found: strike rate over partial ball data.** `SeasonCounts.batBalls` is a plain sum, so an innings with runs but no recorded balls adds runs to the strike-rate numerator without adding balls to the denominator, which inflates strike rate (and deflates boundary share, because fours and sixes are also missing while the runs count). W1 says rates must treat null as absent, but `SeasonCounts` cannot express it. WP-S1 adds one integer, `batRunsUnballed` (runs scored in innings with no ball data, 0 for fully recorded rows), to `SeasonCounts`, `combineCounts`, `pickCounts`, the `player-seasons` collection and the sync/aggregate mappers, so strike rate and boundary share use `batRuns - batRunsUnballed` (a player whose every innings lacks ball data gets `n/a`, not a wrong number). `batRunsUnballed` is computed **from row nulls** (a batting row with `balls == null`, or with `balls`, `fours` or `sixes` null for the boundary figures), never from the innings flag. **(verify)** the sync path first: `aggregatePlayers` (`lib/playhq/players.ts`) adds `b.balls` as a plain number, so the parsed scorecard may already have coerced a missing value to 0; the mapper must see the raw absence (carry `balls: number | null` through the parsed batting row, or derive the figure from the stored match rows) before `batRunsUnballed` is relied on, and the reconcile test covers a partial-ball innings. This also gives imported season totals (WP-S3a) an honest way to omit balls. It is included in the sync reconcile (zero tolerance).

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
| Golden duck | A duck whose `balls = 1`. Needs a non-null `balls` on that row; `n/a` for ducks with null `balls`. |
| Fifty conversion | hundreds / (fifties + hundreds), shown only with at least 5 scores of 50 or more. |
| Five-wicket haul | A bowling row with `wickets >= 5` in one innings. |
| Three-for | `wickets >= 3`. |
| Ten in a match | Sum of one player's wickets over the innings of a single `gameId` is 10 or more (two-day games). |
| Not-out count | `battingStatus = not_out`. |

Counts of 50s, 100s and ducks need no ball or bowling flag (`runs` and `status` are always stored). Five-fors and three-fors need `hasBowlingData`; where an innings lacks it, that innings is absent from the count, the figure is labelled "recorded" (a "recorded five-fors" heading and column help), and the coverage line says "K of M innings have bowling figures". "Ten in a match" is likewise "recorded": it is shown as `n/a` for a game where any innings in which the player's side bowled lacks `hasBowlingData`, because the player may have bowled in the missing innings.

### 2.2a Per-row rule for ball-based figures

Decide on each batting row, never on `innings.hasBallData`: strike rate and golden ducks use rows with `balls != null`; balls per boundary and boundary share use rows with `balls`, `fours` and `sixes` all non-null; `batRunsUnballed` is the sum of `runs` over rows that fail those tests. The innings flag stays only as a coverage-caption count.

### 2.3 Dismissals (issue #4)

- **Batter chart.** For a player's innings with `battingStatus = out` and a `dismissalType`: bowled, caught, caught and bowled, lbw, stumped, run out, hit wicket, retired out, other. Not-out innings are a separate "not out" segment (with a footnote counting retired hurt). An `out` row with no `dismissalType` is "not recorded" and shown as such, never folded into "other". The share columns `bowledPct`, `caughtPct` and `lbwPct` use as denominator the out innings **with a recorded `dismissalType`**; not-recorded rows are excluded from the denominator and the coverage count says "K of M dismissals have a recorded type".
- **Bowler chart.** Wickets credited to a bowler by type: bowled, caught, caught and bowled, lbw, stumped, hit wicket. Run outs and retirements are never credited to a bowler. An innings enters the bowler chart only when `hasBowlingData` and the number of dismissals credited to that bowler equals his `match-bowling.wickets`; innings that fail the check are excluded and counted ("K of M wicket-taking innings reconcile with the scorecard").
- **Caught is one segment.** The batter chart shows "caught" (and "caught and bowled") without a caught-behind split: there is no keeper flag and `keeperCatches` is scorer-dependent. `keeperCatches` is offered only as a plain optional column ("keeper catches, where recorded") on rows that have a `match-fielding` row; no legend caveat, no per-innings reconciliation.
- **Fielding credits.** Catches still come from dismissal events with `fielderAppearanceId` (the W1 catches rule). **Run-outs and stumpings come from `match-fielding`**: `runOuts = runOutsAssisted + runOutsUnassisted` and `stumpings` per fielding row, summed over innings in which the player has a fielding row; `n/a` for innings with no fielding row (never 0). They are reconciled against the dismissal events (`run_out` and `stumped` rows with a stored fielder): the first-fielder credits can never exceed the fielding-row counts, and a disagreement in either direction is logged as `fielding_mismatch:` in the sync log, not repaired. Because the fielding row is the honest source, the `runOuts` and `stumpings` leaderboards, the run-out specialists preset and the record stay. **(verify)** the `RUN_OUTS_*` and `STUMPINGS` statistic names on the first real capture (rule 0.7); if the first backfill shows them absent, drop the `runOuts` leaderboard, preset and record and keep run-outs as a footnoted count of first-fielder events.

### 2.4 Partnerships (issue #5), `lib/stats/match/partnerships.ts`

Only for innings with `isClubBatting`, `played`, `hasFallOfWickets`. Algorithm:

1. Rows with `battingStatus != did_not_bat` sorted by `position`; the first two are the openers. Any row with `dismissalType` in `retired`, `retired_hurt`, `retired_out`, or a `position` of 0 or duplicated, makes the innings **unavailable** for partnerships (a retirement leaves no wicket entry and breaks the pairing). This is deliberately conservative.
2. Validation (from W1 M1): the set of `fowWicket` values must be exactly `1..N`, every `out` row must have an `fowWicket` and every row with an `fowWicket` must be `out`, `N` must equal the innings' `totalWickets`, `fowRuns` must be non-decreasing, and the batter dismissed at wicket `k` must be one of the two batters currently at the crease. Any failure marks the innings unavailable (counted, never repaired). `allOut` does not require `N = 10`: a club team with fewer than eleven listed batters can be all out with `N < 10`, so the all-out and unbroken-stand logic uses `N` and `allOut`, never the constant 10 (a test covers a nine-wicket all-out innings). Rejections are counted by reason (`no_fow`, `retirement`, `bad_position`, `fow_gap`, `fow_missing_for_out`, `fow_runs_decrease`, `crease_mismatch`, `total_mismatch`) and the caption says "K of M innings unavailable (3 retirement, 2 missing fall of wicket number)", not just "unavailable". If PlayHQ turns out to omit `fowWicket` for a retirement-adjacent dismissal, the `fow_missing_for_out` count shows it.
3. Simulation: crease = {pos 1, pos 2}. For `k = 1..N`: the dismissed batter and the other batter at the crease form the wicket-`k` partnership, runs = `fowRuns[k] - fowRuns[k-1]` (with `fowRuns[0] = 0`); the dismissed batter is replaced by the next unused position.
4. Unbroken last stand: when `!allOut` and exactly two `not_out` batters remain, runs = `totalRuns - fowRuns[N]`, wicket number `N+1`, flagged `unbroken`. An all-out innings has no unbroken pair. If `totalRuns` is null the pair is skipped.
5. Output per pair: `{ gameId, inningsSeq, wicket, runs, playerA, playerB (visible ids or null), unbroken, confidence: 'inferred' }`. Runs include extras; PlayHQ gives no per-batter share, so none is shown.
6. Hidden players: a pair with a hidden partner is omitted from club records **and from the visible partner's profile list**, because "a club player" with a date, grade and wicket would reveal that the hidden player batted in that game. The profile instead shows one aggregate line, "partnerships with other club players" (count and best runs, no date, grade or wicket), which includes hidden partners only in that anonymous total. Balls and minutes of a partnership are not available and not shown.
7. Coverage: "N of M club batting innings have complete fall of wickets." A partnership record with `N = 0` shows no ranking at all.

### 2.5 Batting position (issue #6)

`position` is the scorer's card order (`displayOrder`), not proof of who walked in first. Every position figure says "as scored" in its column name and help text ("Average position (as scored)"), on the profile block and in StatLab alike. Buckets are constants (`POSITION_BUCKETS`): opener 1-2, middle 3-5, lower middle 6-7, tail 8-11; the buckets are the only breakdown (there are no separate opener, middle or lower average columns). Per bucket: innings, runs, average (out innings only), not outs, high score, fifties. A bucket shows an average only with at least `positionInnings` (default 5) innings, otherwise the raw counts and `n/a`. Also: most common position (tie goes to the lower number), average position. Rows with position 0 (the "no data" marker seen on the bowling side) are excluded and counted.

### 2.6 Opposition (issue #3), `lib/stats/match/opposition.ts`

- **Key.** `oppositionKey = opponentOrgId ?? 'n:' + slug(normaliseClubName(opponentOrgName ?? opponentName))`. `normaliseClubName` is locale-neutral: case-fold, trim, collapse whitespace and remove punctuation only. It strips no English words ("club", "cc") and no grade suffixes, so it never merges two different clubs. PlayHQ org ids are stable, so the name fallback exists only for imported matches (no org id). **Imported history never joins PlayHQ head-to-head by itself**: an `n:` key can never equal an org-id key. The admin opponent mapping (WP-S3c, `kind: 'opponent'`) therefore maps an imported name (`from`, normalised) to a target `oppositionKey` chosen from the known keys (an org-id key or another `n:` key), which makes the two sources join; without a mapping the docs state that imported opponents are separate rows. **Label** = the most recent `opponentOrgName`.
- **Player table.** Per opposition: games, batting innings, runs, average, high score, fifties, hundreds, ducks, wickets, runs conceded, best figures, economy, catches. Averages and economy need at least `oppositionInnings` (default 3) innings (batting) or `oppositionBalls` (default 72, twelve overs) recorded (bowling); below that the raw counts show and the rate is `n/a`. Bowling columns use only innings with `hasBowlingData`.
- **Club head to head.** Per opposition: played, won, lost, drawn, tied, no result, forfeits (marked), last meeting, highest club score and highest conceded (played innings with a total), plus "lowest completed innings" for club and conceded, counted only for innings with `allOut = true` (a winning chase, a declaration or a rain-shortened innings ends early and says nothing about a low score). Sort by played, then label.
- **Grade filter.** The same category checks as `/stats` (`classifyGrade(canonicalGrade(gradeName), clubTeamName, rules)`), default senior-style categories from `effectiveCategories`. The juniors checkbox is replaced by a note "Junior games are not in the match data".

### 2.7 Results, forfeits and edge cases

| Case | Rule |
| --- | --- |
| `won` (including `onFirstInnings`) | Win, with the first-innings marker shown. |
| `lost` | Loss. |
| `draw`, `tie`, `no_result` | "Other", reported separately, never as win or loss. |
| `byForfeit` | Counted in the results tables with a "forfeit" mark; excluded from win percentage (both directions) and from every batting, bowling, fielding, partnership and dismissal figure. Appearances still count toward `games`, consistent with the season table. A forfeit is never a win for any player: `wins` and every wins-based figure exclude forfeit games entirely (the player's `games` includes them, `wins` does not). Win percentage here will therefore differ from the PlayHQ ladder, which counts forfeits; this is intended and the caption says "excludes forfeits", so nobody should "fix" it to match. |
| Abandoned / not final | Never stored. W2 never shows them; yearbook live-results totals already exclude them (`summariseResults`). |
| DLS | Stored as won or lost only. No margin, target or overs are shown; the docs say so. |
| Two-day games | Per-innings stats are per innings (a player can have two ducks in a game). Results and partnership lists are per innings; "games" is per game. |
| Win percentage | `won / (won + lost + draw + tie)` over non-forfeit, non-no-result games, only with `winGames` (default 10) such games. A player's `wins` and `winPct` use the same games the player appeared in, forfeits excluded. |
| Imported matches | `source = 'import'`. They carry no fall of wickets and usually no balls, so they feed counts and averages but never partnerships, and their coverage flags are false. |

### 2.8 Minimums at club scale

A club of this size has about 20 regulars per team and roughly 20 to 40 games a season per team, so a three-season window gives a regular 30 to 90 innings and only a handful of innings against any one opponent. Defaults (admin-editable in `site-settings.stats.matchMinimums`, siblings of `qualification`, never literals; seven numbers): `oppositionInnings 3`, `oppositionBalls 72`, `positionInnings 5`, `rateInnings 10` (duck percentage and dismissal shares need 10 dismissals), `winGames 10`, `ballsForBoundary 100`, `partnershipPairGames 2` (a per-player "most successful partner" needs at least two shared partnerships; it is never shown for a hidden partner). Count leaderboards use the existing `count` qualifier (value above zero), so "Most fifties" lists everyone with at least one.

## 3. Caching, performance and revalidation

**Where the data is read.**

- **One pipeline: per-season blobs.** One cached slim columnar blob per season of innings facts (`['match-facts', seasonStartYear]`), exactly the `SlimSeason` pattern in `lib/stats/queries.ts`: a header table of matches (id, date, opposition key and label index, grade index, format, result, flags) plus integer rows for batting, bowling and credit facts per visible club-side player. Estimated size: 80 games a season per club x about 35 rows x 14 integers is roughly 150 KB. A test asserts that a generated worst case of ten teams stays under 1.5 MB (the `unstable_cache` entry cap is 2 MB); if it ever fails, the build fails loudly. There is no "split by grade" loader branch.
- **Player profile sections filter the same blobs by player id.** There is no per-player cache (`player-match-facts`), no second derivation pipeline and no per-request DB scan, so a nightly `revalidatePath('/players/[slug]','page')` cannot make crawlers cold-start N players against the database. A profile reads the season blobs (at most the stored seasons, cached) and filters rows in memory.
- **Profile route rendering is a deliberate decision.** `app/(frontend)/players/[slug]/page.tsx` is `export const dynamic = 'force-dynamic'` today and takes `searchParams`. W2 keeps it dynamic: the match sections read only tag-cached blobs, so the page stays cheap, and hide/404 timing is unchanged (a hidden player 404s on the next request, no purge needed). Moving to ISR is out of scope; if it is ever done it needs `revalidatePath` on hide, since revalidate does not purge a hidden player's cached page (the export route already notes this).
- **Partnerships:** derived inside the per-season loader (needs the full innings), cached as part of the season blob (a few hundred pairs).
- **Parameterised StatLab cannot bust the cache.** `opp`, `fmt` and up to 12 columns are an unbounded query space, but they only select among cached blobs. Parameterised pages are `noindex` with no canonical (already true of `/statlab`, `app/(frontend)/statlab/page.tsx`, **verify** the new `/statlab/export` and any match-mode route), a request touches at most `STATLAB_MAX_SEASONS` (constant, default 8) seasons, and `runStatLab` is memoised per canonical query in a small bounded in-process LRU within a request lifetime.
- Nothing queries match rows per anonymous request without the cache. Admin-only pages (import preview, duplicate suggestions) query uncached, except the duplicate suggestions (6.2) which are cached with the stats tags.

**Tags and a latent inconsistency.** Verified: `revalidatePlayerPages` and `SiteSettings` use only `player-stats`, `payload/collections/Players.ts` has a local `STATS_TAGS = ['player-stats']`, and `lib/players/sync.ts` (line 175) passes `match-store` only. `lib/stats/queries.ts` already exports `STATS_TAG = 'player-stats'` (singular) and nothing reads `match-store` today. A match-derived cache tagged only `match-store` would go stale after a hide, merge or grade-rule change. Rule: **every stats cache (old and new) carries both tags**, defined once in `lib/stats/tags.ts` as `ALL_STATS_TAGS = [STATS_TAG, MATCH_STORE_TAG]` where `STATS_TAG` is re-exported from `lib/stats/queries.ts` (one definition; `queries.ts` imports it from `tags.ts` and re-exports), and one helper `revalidateStats()` replaces the literals. The `Players.ts` constant is deleted (its name would collide with the new one; the name `ALL_STATS_TAGS` is used everywhere new). Files to change: `lib/stats/queries.ts` (`cached()`), `lib/players/revalidate.ts`, `payload/collections/Players.ts`, `payload/globals/SiteSettings.ts`, `payload/endpoints/mergePlayers.ts` (via `revalidatePlayerPages`), `lib/players/sync.ts` (its explicit tag list), and the new import, undo and label-rename paths. A unit test greps that no file passes a bare tag literal to `revalidatePaths`.

**Freshness.** Pages stay ISR 900 s plus tag revalidation after every sync, merge, import, undo and settings save.

## 4. WP-S1 Derived stats, profile sections, leaderboards, records (issues #3 #4 #5 #6 #7)

### 4.1 Library (pure, no DB, no Next)

New `lib/stats/match/`:

| File | Contents |
| --- | --- |
| `types.ts` | `InningsFacts`, `BatFact`, `BowlFact`, `CreditFact`, `MatchHeader`, `MatchCounts`. |
| `facts.ts` | `deriveFacts(bundle, visibleIds)` turns a `StoredBundle` into facts (applies 2.1). |
| `counts.ts` | `matchCountsOf(facts)` returns `MatchCounts` (fifties, hundreds, ducks, goldenDucks, fiveFors, threeFors, tenWicketMatches, runOuts, stumpings, dismissal tallies, position tallies, results, plus the denominators `battingInnings`, `ballInnings`, `bowlingInnings`, `reconciledWicketInnings`). |
| `dismissals.ts` | batter and bowler breakdowns (2.3). |
| `partnerships.ts` | validation, simulation, `bestByWicket`, `topN`, `forPlayer` (2.4). |
| `position.ts` | buckets and per-bucket lines (2.5). |
| `opposition.ts` | key, normalisation, player and club tables (2.6). |
| `coverage.ts` | `MatchCoverage` and `coverageCaption` (rule 0.3). |
| `metrics.ts` | match metric registry (4.3). |

Foundation edits: `batRunsUnballed` (section 1), `lib/stats/labels.ts` (`canonicalGrade`, `canonicalTeam`, `applyLabels`, section 6.3; shipped here because every read below uses it), `lib/stats/tags.ts` (extends the existing `STATS_TAG`).

Server-only queries `lib/match-store/stats-queries.ts` (the only reader of match rows for pages): `getMatchCoverage()`, `getSeasonFacts(seasonStartYear)` (cached), `getFactsFor(seasons)` (bounded by `STATLAB_MAX_SEASONS`), `getPlayerMatchFacts(playerId)` (a filter over the cached season blobs, not its own cache), `getClubPartnerships(filter)`, `getOppositionTable(playerId)`, `getHeadToHead(filter)`. Each restates FINAL-only and non-hidden filtering.

### 4.2 Pages and components

- **Player profile** `app/(frontend)/players/[slug]/page.tsx`: a "Match analysis" block after "Season progression", with an anchor sub-nav (no client tabs, no search params, so ISR stays): Against each opposition, How out / How wickets came, Partnerships, Batting position. Sections are omitted when the player has no match rows; each carries its coverage caption. The route stays `force-dynamic` (section 3). The opposition table is a small client component that sorts by runs or wickets (server renders the default order, so it works without JS). Components in `components/stats/match/`: `opposition-table.tsx`, `dismissal-chart.tsx` (horizontal stacked bar, caught is one segment, inline SVG, `fill-brand-*`, legend and counts in a table in `<details>`, not colour alone), `partnership-list.tsx`, `position-table.tsx` (table, with a small inline SVG bar per bucket).
- **Club head to head:** `app/(frontend)/stats/opposition/page.tsx` (ISR 900; stats sub-nav gains "Opposition"). Per-opposition rows link to `?club=<key>` anchored detail (best scores, last meeting).
- **Partnership records:** a section on `/records` ("Partnerships": best at each wicket 1 to 10) and `app/(frontend)/records/partnerships/page.tsx` (top 25 overall, season selector, category filter), all labelled "inferred from batting order and fall of wickets" with the coverage caption.
- **Leaderboards and records:** `/stats` gains metrics `fifties`, `hundreds`, `ducks`, `fiveFors`, `runOuts`, `stumpings` (and `goldenDucks` only where rows have ball data) in the existing metric select, each with the match-data caption and "counts recorded innings only". Run-out and stumping counts come from the fielding rows (2.3) and show `n/a` where there is no fielding row. `/records` gains the matching "most in the stored matches" lists plus best innings figures and highest score with opposition and date; lowest totals appear only as "lowest completed innings" (2.6). Ducks sit last under a neutral heading. Rank, ties and the `take`/hard-cap rules reuse `rankValues` and `records.ts` helpers.
- **Milestone counters:** new match milestones (50s `[1,5,10,25]`, 100s `[1,2,5]`, five-fors `[1,3,5]`, constants in `lib/stats/match/milestones.ts`) on profile badges and the stats milestone strip. They are explicitly "since <first stored match date>": there is no baseline field for them, so they are never merged into the games/runs/wickets/catches milestones that do have baselines, and they never claim lifetime totals. Admin-configurable thresholds are deferred.
- **StatLab columns** appear in WP-S2 (deviation from the task text, which listed them under WP-S1: the columns are only useful together with the match-mode rule and filters, so they ship with StatLab v2).

### 4.3 Match metrics

`MatchMetric` mirrors `Metric` (`key`, `label`, `short`, `group`, `value`, `format`, `higherIsBetter`, `qualifier`) but takes `MatchCounts` and adds `coverage(c): {known, total} | null` and `needs: 'balls' | 'bowling' | 'fow' | null`. A value is `null` (shown as the dash) when the denominator innings are zero. New qualifier kinds for the rate ones, reading `matchMinimums`.

### 4.4 Access, schema, migrations

- `player-seasons.batRunsUnballed` (number, default 0), `site-settings.stats.matchMinimums` group (seven numbers with defaults). One migration `w2_s1_stats` (schema-qualified, with the `payload.player_seasons` column and the settings columns), `pnpm generate`, `pnpm check:generated`, `pnpm check:migrations`.
- No new collection, no new access rule, no nav entry (the everyday cap of 16 in `tests/admin-visibility.test.ts` is already full and nothing here is everyday).
- The sync (`lib/playhq/players.ts` aggregation and `lib/match-store/aggregate.ts`) fills `batRunsUnballed` from row nulls (section 1, with its verify note); reconcile compares it.

### 4.5 Tests

Unit (`tests/`, no DB): `stats-match-facts`, `stats-match-counts` (every rule in 2.2 with edge rows: 49/50/99/100, 0*, retired hurt on 0, golden duck with null balls, an innings where only some batters have balls (per-row rule), five-for with and without bowling data, two-day ten-wicket match with and without a missing bowling innings, wins excluding forfeits), `stats-match-dismissals` (bowler reconciliation mismatch, dismissal-share denominator with a not-recorded row, run-outs and stumpings from fielding rows with `n/a` where no row, fielding versus event mismatch logged), `stats-match-partnerships` (clean ten-wicket, all-out, declared with unbroken stand, two-day innings 3 with no FoW, retirement, gap in `fowWicket`, non-monotonic runs, hidden partner, a nine-wicket all-out innings, rejection-reason counts in the caption, hidden partner absent from a visible player's list), `stats-match-position`, `stats-match-opposition` (key, locale-neutral normalisation, opponent mapping to an org-id key, lowest completed innings only when all out, minimum rules), `stats-match-coverage`, `stats-batting-runs-unballed`, `stats-tags` (no bare literals). Fixtures come from the W1 seed generator (`payload/scripts/fixtures/match-seed-data.ts`) plus tiny hand-built bundles.
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
- Per-season blob growth (guard test fails loudly; no split branch).
- Imported opponents do not join PlayHQ head-to-head unless an admin maps them to an `oppositionKey` (documented).

## 5. WP-S2 StatLab v2, saved reports, yearbook sections (issues #8 #13)

### 5.1 Filters and columns

New filters in `StatLabParams` (all validated by the existing whitelist parser, which never throws): `opp` (an `oppositionKey` from the known list) and `fmt` (`oneDay|twoDay`), alongside season, grade, categories. A `decade` filter is deferred (season selection already covers it). `statLabHref` canonicalises them (sorted keys, defaults omitted), so equal reports share a URL. Imported matches without a `format` value are excluded when `fmt` is set.

**Mode rule (no silent mixing).** If any selected column is match-only, or `opp` or `fmt` is set, the whole table is computed from match rows: the 26 classic metrics come from `aggregateFromMatchRows` (so they exist for any opponent), the match metrics from `matchCountsOf`, and strike rate and boundary share use `batRunsUnballed`. Otherwise the table is computed from `player-seasons` exactly as today. The table caption says which ("Season totals since 2023/24" or "From match data, <coverage caption>") and match-only column headers carry a "match data" marker. A match-only column in season mode forces match mode; the UI explains this in one line when the column picker toggles it.

**Columns.** 26 existing plus 14 new, about 40 in the registry (the picker still allows 12 at a time): `fifties`, `hundreds`, `ducks`, `goldenDucks`, `fiveFors`, `threeFors`, `runOuts`, `stumpings`, `bowledPct`, `caughtPct`, `lbwPct` (shares of dismissals with a recorded type, minimum `rateInnings`), `notOutPct`, `avgPosition` (as scored), `bestPartnership`, `partnerships50`, `wins`, `winPct` (minimum `winGames`; both exclude forfeits), `ballsPerBoundary` (minimum `ballsForBoundary`, rows with balls, fours and sixes), `fiftyConversion`. Cut from the first draft: `openerAvg`, `middleAvg`, `lowerAvg`, `openerInnings` (use the position buckets on the profile instead), `opponentsFaced`, `runsInWins`, `wicketsInWins`. Each column states its rule in the column picker help text; five-for columns are labelled "recorded".

### 5.2 Presets (18)

Twelve existing plus six match-data presets, each a plain StatLab URL: `fifty-makers`, `century-makers`, `five-for-club` ("recorded"), `run-out-specialists` (from fielding rows), `boundary-hitters` (balls per boundary), `best-partnerships`. Opponent-specific presets are not shipped (an opponent key is data, not code). `PRESETS` stays in `lib/stats/presets.ts`; a unit test asserts at least 18, unique keys, every column exists and every preset parses unchanged through `parseStatLabParams`. Cut from the first draft: `stumpings`, `openers-report`, `middle-order-engine`, `lower-order-runs`, `ducks-club`, `converters`, `wins-when-they-play`, `most-opponents-faced`.

### 5.3 Saved reports (admin-only list, `saved-reports` collection)

Presets and canonical URLs already give shareable reports, so public saved reports and their own share card are deferred. What remains is a small admin bookmark list.

| Field | Notes |
| --- | --- |
| `title` | Required, 80 characters. |
| `slug` | `uniqueSlug`, hook-owned (`nobodyField` create/update). |
| `owner` | Relationship to `users`, set by a `beforeChange` hook from `req.user`, hook-owned. |
| `query` | Text, at most 2000 characters: the canonical StatLab query string. |
| `description` | Optional, 300 characters. |

A `beforeValidate` hook runs the stored string through `parseStatLabParams` and `statLabHref`, replaces it with the canonical form, and rejects an empty column set or anything that is not a query string. No JSON blob, no expressions, no code. Cap of 200 reports (hook). Access: read, create, update, delete are admin only. Classified in `advancedNav` ("Saved reports") with `admin.hidden: hiddenFromEditors`; no everyday entry. UI: on `/statlab`, admins only get a server action "Save this report" and a list of saved reports whose links are the canonical StatLab hrefs (the share link). There is no `/statlab/r/[slug]` route and no OG card.

### 5.4 CSV export

`/statlab/export` keeps its route and cap. Additions: a `Source` column in match mode and a hardened `csvCell`. Today `lib/stats/csv.ts` has `DANGEROUS = /^[=+\-@\t\r]/`, so the hardening is needed.

- **One shared predicate** `needsGuard(s)` in `lib/stats/csv.ts`, defined recursively: true when the string, after trimming leading spaces, starts with `= + - @ | ＝ ＋ － ＠`, tab or carriage return (so space-then-`=` is covered), **or** when it starts with `'` and `needsGuard` holds for the rest (so a literal leading `'` in front of a dangerous character is itself protected). **Export** prefixes one `'` iff `needsGuard(s)`. **Import** (`unescapeCell`) strips exactly one leading `'` iff the string starts with `'` and `needsGuard` holds for the remainder. Examples: `=x` exports as `'=x` and imports as `=x`; real text `'=x` exports as `''=x` and imports as `'=x`; real text `'hello` needs no guard, exports unchanged, and import leaves it alone because `hello` is not guarded. A property test asserts `unescapeCell(unquote(csvCell(x))) === x` for random strings including a literal leading `'`, leading whitespace, full-width forms and `|`.
- Numbers are written as numbers (negatives stay numbers).
- **No `#` comment lines.** Excel shows them as data rows in public downloads and the admin re-import would have to special-case them. The CSV body is a header plus data rows only. The coverage caption is shown on the page, and a plain-text sidecar `GET /statlab/export/caption?<same query>` (`text/plain`) carries the same `coverageCaption` string for anyone who wants it with the file. The admin re-import parser rejects any row whose first cell starts with `#`.
- Public export contains only what the public table shows (visible players, classic and match metrics); no name columns beyond the player name already public.

### 5.5 Yearbook (`/yearbooks/[slug]`, the real route; the issue text says `[season]`)

`app/(frontend)/yearbooks/[slug]/page.tsx` gains four sections, shown only when the season has stored matches, each with the coverage caption and "N of M finished games stored" (M from the existing live fixtures call when it is available), and falling back silently to today's sections otherwise:

1. **Results by grade with scores** (replaces the PlayHQ-only `resultsByGrade` when stored data is complete enough, otherwise both are not mixed: the section states which source it uses). Rows: date, round, opponent, club score and opposition score as `runs/wickets (overs)` from `match-innings` (two-day games show both innings), result letter and word, forfeit mark. Grade names pass through `canonicalGrade`.
2. **Win/loss progression.** One inline SVG per grade: a result strip (a cell per game in date order with a letter `W L D T N`, never colour alone) above a stepped line of cumulative wins minus losses. Title, description and an adjacent table. Brand classes only.
3. **Partnership records for the season:** best pair at each wicket and the top five, inferred and captioned.
4. **Season highlights** (clearly "stat leaders, not club honours"), each line labelled with its source: highest score with opposition and date, best bowling figures, most fifties and best partnership are "from match data". `allRounderScore` (`lib/stats/yearbook.ts`) is computed from `player-seasons` counts, so it stays a separate, existing block labelled "from season totals"; it is not shown inside the match-data highlights. In match mode only, an all-rounder may be computed from match counts (`aggregateFromMatchRows`) with the same rule and labelled "from match data"; the two are never combined on one line (rule 0.4). Honours stay a separate, committee-entered section.

### 5.6 Files

New: `lib/stats/match/*` (S1), `lib/stats/match-statlab.ts`, `payload/collections/SavedReports.ts`, `lib/stats/saved-reports.ts` (canonicalise), `components/stats/match/yearbook-*.tsx`, `components/stats/win-loss-chart.tsx`. Changed: `lib/stats/{statlab,presets,csv,metrics,statlab-queries,query-string}.ts`, `components/stats/{statlab-form,column-picker,filter-bar}.tsx`, the yearbook page and `yearbook-sections.tsx`, `payload.config.ts`, `payload/admin/navigation.ts`.

### 5.7 Migration

`w2_s2_saved_reports` creates `payload.saved_reports` and the `payload_locked_documents_rels` column.

### 5.8 Tests

Unit: `stats-statlab-v2` (parse, canonical href, mode rule, filters, columns exist, minimums, season cap), `stats-presets-v2`, `stats-csv-injection` (leading `= + - @`, tab, CR, space-then-`=`, full-width forms, pipe, negative numbers stay numbers, round-trip property test over random strings with the shared `needsGuard`, `#` rows rejected by the import parser), `saved-reports-canonical`, `stats-yearbook-match` (results lines, progression series, highlights), `win-loss-chart-render`. Integration: `saved-reports.int` (admin only over REST, owner stamped, invalid query rejected, cap, unknown params dropped), `statlab-v2.int` (opponent filter equals manual sum over seeded rows; match mode and season mode captions; export body), `yearbook-match.int` (sections appear with seeded matches, absent without; draft yearbook still 404). Extend `tests/admin-visibility.test.ts` for the new collection.

### 5.9 Docs

Updated `statlab-and-csv-export.mdx` (v2 filters, mode rule, columns), `season-yearbooks.mdx`; new `saved-reports.mdx` (admin bookmarks); `index.mdx`.

### 5.10 Seed

Two admin-only saved reports built from presets; the demo yearbook for the seeded season with published status so the new sections render.

### 5.11 Acceptance (local)

1. `/statlab?opp=<key>&cols=runs,avg,fifties` shows the match-mode caption; clearing the opponent and the match column returns the season-mode caption.
2. All 18 presets open, parse and render without error; the export of each is header plus data rows (no `#` lines) and no cell begins with an unguarded `=`.
3. As admin save a report; it appears in the admin list with its canonical link; signed out there is no list.
4. Seeded yearbook shows results with scores, the progression SVG with letters, partnership records and highlights.

### 5.12 Risks

Match mode versus season mode confusion (mitigated by the caption and the forced-mode note); response size of the per-season blobs in a wide career query (guard test fails loudly, season cap); report cap and query validation drift when metric keys are renamed (a saved report with an unknown key keeps loading because unknown columns are dropped, and the page says so).

## 6. WP-S3 Admin tools (issues #9 #10 #11 #12)

### 6.1 (a) Historical CSV import and export (#9)

**UI and routes.** An admin-only custom view `payload/components/PlayerDataToolsView.tsx` at `/admin/player-data-tools` ("Player data tools", one entry in `advancedNav`, not everyday) with two sections, "Import and export history" and "Duplicate players" (6.2), so the advanced menu gains one entry, not two. Endpoints in `payload/endpoints/historyImport.ts`, all requiring `role = admin`: `GET /api/history-import/template/:kind`, `POST /api/history-import/preview`, `POST /api/history-import/apply`, `POST /api/history-import/undo-batch`, `GET /api/history-import/export/:kind` (`kind` is `season-totals` or `match-rows`).

**Templates** (`lib/history-import/templates.ts`; header plus two clearly fake example rows for `Example Player`, which the importer rejects with "remove the example rows"):

- Season totals: `season, team, grade, first_name, last_name, games, bat_innings, bat_not_outs, bat_runs, bat_high_score, bat_high_score_not_out, bat_balls, bat_fours, bat_sixes, bowl_overs, bowl_maidens, bowl_runs, bowl_wickets, best_wickets, best_runs, catches`. Blank balls, fours and sixes are allowed and mean "not recorded" (the importer sets `batBalls`, `batFours`, `batSixes` to 0 and `batRunsUnballed = batRuns`, so strike rate shows `n/a` for that season, not a wrong number). `bowl_overs` uses cricket notation and goes through `oversToBalls`.
- Match rows (one row per player per game): `date, grade, team, opponent, game_ref (optional), format (one_day|two_day|blank), result, team_runs, team_wickets, opp_runs, opp_wickets, first_name, last_name, batted, runs, balls, fours, sixes, how_out, overs, maidens, runs_conceded, wickets`. Blank means not recorded. There are no `catches`, `run_outs` or `stumpings` columns: imported rows deliberately carry no bowler or fielder, and `aggregateFromMatchRows` derives catches from dismissal events with a fielder, so those columns would never reach match-mode StatLab or the reconcile and imported games would show 0 catches. Season totals keep `catches`; match-mode fielding for imported games is `n/a`. Team and opposition totals, when given, must agree on every row of the same game. Bowler and fielder names are deliberately not importable (club people are never stored as text, W1).

**Parsing and validation** (pure, `lib/history-import/{csv-parse,season-totals,match-rows,plan}.ts`): RFC 4180 parser, BOM stripped, limits of 2 MB, 5,000 rows and 40 columns; every row validated with row-level errors that name the row number, column and plain-English reason (unknown header, bad season shape, number out of range, high score above runs, not-outs above innings, `how_out` not in the list, a date that does not belong to the season, junior grade rejected using the same `JUNIOR_GRADE_RE` rule, `0` wickets with a best figure, unknown or duplicate player). Text cells that satisfy `needsGuard` after one leading `'` is unescaped (section 5.4) are rejected so injection cannot be stored; the exporter and importer share the one predicate. Rows whose first cell starts with `#` are rejected.

**Players.** Resolve by name key through `player_aliases`. An unknown name is a warning that lists the closest existing players (the WP-S3b similarity function); the admin ticks "create new players for unknown names" to proceed, otherwise those rows are errors. Created players use `source: 'manual'`, an alias, and are never hidden by default.

**Dry run.** `preview` returns `{ summary: { create, update, unchanged, errors, warnings }, rowErrors[], newPlayers[], overlaps[], fileHash }` and writes nothing. `apply` re-parses the same file, refuses unless every row is valid, and runs in one drizzle transaction. Idempotency: season totals upsert on `(player, teamId = 'import:<season>:<teamSlug>')` (the existing unique index); matches upsert on `gameId = 'imp:' + sha1(date | grade | team | opponent | game_ref)` (the grade and the optional `game_ref` keep a double-header, or two grades sharing a team name, from colliding; rows of one game must agree on `game_ref`) with children replaced wholesale, like the sync. Re-importing the same file reports `unchanged`. A season that PlayHQ already covers for that player (or a match whose date and opponent exist as a PlayHQ game) is an error ("PlayHQ already has this"), so history is never double counted.

**Schema.** `player-seasons` and `matches` get `source` (`playhq|import`, default `playhq`) and `importBatch` (text, for undo of a whole import). `player-seasons.seasonStartYear` (number, nullable). Imported matches use a synthetic non-null `clubTeamId` of `import:<teamSlug>` (and `clubTeamName` from the file), the same idea as the season rows' synthetic `teamId`. Match innings stubs for imported games set the three coverage flags false and store totals only when supplied (the totals columns are already nullable).

**The sync must never touch imports** (the change that makes the tag true): in `lib/players/sync.ts` the season replace becomes `DELETE ... WHERE source = 'playhq'` (also in the partial-pair branch), and the wipe guard's `existing` count (step 6) counts `source = 'playhq'` rows only, otherwise a club that imports history before its first sync would be refused forever; `pruneStaleMatches`, `relinkMatchPlayers` (still relinks imports through aliases, which is wanted, but never deletes), `reconcileMatchStore`, `storedMatchIndex` and the backfill plan exclude `source = 'import'`. **Season ordering.** Imported rows are sorted by `seasonStartYear` (new nullable column), not renumbered against the sync's `seasonOrder`: there is no `renumberImportedSeasons()` and no synthetic `seasonOrder` coupling. Imported season rows get a `seasonOrder` that never counts as current (a fixed sentinel above any PlayHQ value, `IMPORTED_SEASON_ORDER`), career and progression views order by `seasonStartYear` where it is set, and the derived active flag (`ACTIVE_MAX_SEASON_ORDER`) ignores `source = 'import'` rows. **(verify)** the active-flag code path with a test.

**Export.** `export/season-totals` and `export/match-rows` write the current data with a `source` column, including imported rows, so an export re-imports as a no-op. Hidden players are included (admin-only) with a `hidden` column. Opposition players are never exported. All cells go through `csvCell`.

**Undo of an import:** `undo-batch` deletes the rows tagged with a given `importBatch` (admin, confirmation, one transaction), then `revalidateStats()`.

### 6.2 (b) Duplicate suggestions and merge undo (#10)

**Collection `merge-log`** (internal: `internalCollection`, written by code only, hidden from all roles, listed in `internalCollections`): `kind` (`merge|dismissed`), `status` (`applied|undone|dismissed`), `sourcePlayerId`, `sourceName`, `targetPlayer` (relationship, set null on delete), `snapshot` (json), `createdBy`, `createdAt`, `undoneAt`, `undoneBy`. Reads happen through the admin view with `overrideAccess`.

**Merge refusal (same game).** The merge endpoint (`payload/endpoints/mergePlayers.ts`, used by the field and by the duplicates view) refuses when the two players share a `match` in `match_appearances`: moving all appearances with one UPDATE would put one player on both sides of a partnership, double-count `games` and can make the partnership validator fail (the unique index is `(match, appearanceId)`, not player). The response names the shared games; the admin may confirm "these two are the same person who is listed twice in one game" only after a second explicit confirmation, in which case the colliding appearances are not merged but left with the source name key. A unit and an integration test cover the refusal.

**Snapshot: identity only, taken inside the merge transaction before any write.** The sync deletes and reinserts `player_seasons` nightly and replaces match children wholesale, so recorded season-row and appearance ids do not survive one sync and restoring recorded counts would overwrite fresher numbers with stale ones. The snapshot therefore holds only: the full source `players` row (id, slug, names), its `players_honours` rows (ids and `_order`) and the max `_order` on the target, its `player_aliases` rows (ids, name keys), the target's pre-merge `photo`, `bio`, `isActiveDerived`, and the ids of `people` and `player_sponsors` rows that pointed at the source. No season or appearance snapshot. Size is a few KB.

**Undo** (`POST /api/players/merge-log/:id/undo`, admin): in one transaction, re-insert the source player with its original id and slug, restore its aliases (so future syncs route its name key to it again and not the target), move honours back by recorded ids and restore `_order`, move `people` and `player_sponsors` links back, revert the target patch only for fields still equal to the merged value, mark the log `undone`. After commit, `relinkMatchPlayers` runs by name key (the aliases are back, so the source's appearances relink to it) and `revalidateStats()`. **Season rows are rebuilt, not restored**: the next nightly sync (or "Sync now") recreates them from PlayHQ under the restored alias routing; until then the restored player has no season totals and the note says so. Refused with a plain message when the target no longer exists (merged again: undo that one first) or the log is already undone. There is no 30 day window: nothing stale is restored, so nothing needs to expire (the log keeps a plain retention of one year). Sync routing is correct immediately because alias rows are the routing table.

**Suggestions** (`lib/players/duplicates.ts`, pure, unit-tested; query in `lib/players/duplicate-queries.ts`): **blocking, not all pairs.** Candidates are only players that share a block key: the normalised last name, a phonetic key of the last name (Soundex or Double Metaphone), or the swapped pair (first name equals the other's last name and the reverse). That keeps a 1,500-player club to a few thousand comparisons instead of about 1.1 million Jaro-Winkler calls. Within a block, pairs are scored 0 to 100 from name similarity on the `first|last` key (Jaro-Winkler, swapped first and last, initial versus full first name, edit distance 1 on either part; no nickname table) with weight 0.6, plus overlap with weight 0.4 (same club team in the same or adjacent seasons, never both active in the same season on different teams of the same grade, similar grade). **Veto:** two players who appear in the same game (same `match` in `match-appearances`) cannot be one person and are excluded outright from suggestions, as are pairs dismissed before (`merge-log kind: dismissed`); manual merges get the refusal above. Same-name pairs that never co-appear rank first. Only pairs scoring at least 60 are listed, at most 50, each with reasons in plain English. The result is cached (`unstable_cache` with `ALL_STATS_TAGS` plus `merge-log`) and invalidated by every merge, undo, dismissal and sync. Hidden players are included (admin-only view) with a marker.

**UI:** the "Duplicate players" section of `PlayerDataToolsView` (6.1): ranked pairs, "Merge into ..." (which side keeps the profile is chosen by games played, overridable), "Not the same person", and a "Recent merges" list with an Undo button. The existing merge field on the player edit page is unchanged and now also writes a log row.

### 6.3 (c) Name and grade label overrides (#11)

**Findings.** `players.firstName` and `lastName` are editable and the sync only inserts new players (it never rewrites names, `lib/players/sync.ts` step 5), so an edited name already survives syncs, but editing it does not change the alias key and `displayName` is rederived from the names. The real gap is a display-only preferred name (a nickname) that does not touch identity, and the label problem below.

- **Preferred name.** `players.preferredName` (optional text, 100 characters, editor-editable, helper text "Shown on the site instead of the PlayHQ name"). The `displayName` hook yields `preferredName || fullName`; **(verify)** that `payload/hooks/slug` (`uniqueSlug`) is not re-run from `displayName`, so a preferred name never regenerates the slug or breaks URLs (test: set a preferred name, slug unchanged), and a new `shownName(p) = displayName?.trim() || playerName(p)` replaces `playerName` at every read that selects names (`lib/stats/queries.ts` `loadPlayers`, `lib/match-store/queries.ts` `loadPlayerNames`, players queries, people queries; a grep-based unit test lists remaining direct uses). Aliases, name keys and merges never see it.
- **Grade and team label mapping, single source.** `lib/stats/labels.ts`: `normaliseLabel` (trim, collapse spaces, strip a leading numbering such as `2. `, `2) `, case-fold for comparison), `canonicalGrade(raw, map)`, `canonicalTeam(raw, map)`, and `canonicalOpponent(raw, map)` (the opponent mapping targets an `oppositionKey`, section 2.6). Algorithm: the comparison key is the normalised label; an admin mapping entry `{ kind: 'grade'|'team'|'opponent', from, to }` (matched on the normalised key; for `opponent`, `to` is an `oppositionKey`) wins; otherwise the displayed label is the most frequent original spelling in the data for that key (so "B Grade" and "B grade" collapse deterministically). Stored rows are never rewritten (the sync replaces them every night); the mapping is applied at read time. This is what tidies "2. Senior Men District" versus "Senior Men District", "Senior Men B Grade" versus "Senior Men B grade", "Senior Men E Grade East" versus "Senior Men E grade East".
- **Settings.** `site-settings.stats.labelRenames` array (`kind`, `from`, `to`), under the existing Advanced "Site settings" entry (no new nav). A small admin field component `payload/components/LabelRenamesHelp.tsx` lists the distinct labels currently in the data with counts and what each resolves to, so the admin picks from real names.
- **Consumers (every one changes together, one function):** `classifyGrade` (the canonical label is tested first, then the raw one, so existing grade rules keep working and a rename can intentionally change the category), `filterRows`/`gradeNames`/`availableCategories` in `lib/stats/leaderboard.ts`, `RecordEntry.grades` in `records.ts`, `careerOf`/`mergeBySeason` grade lists, StatLab identity columns and the grade filter, `resultsByGrade` and the new yearbook results, the match-store queries (`matches.gradeName`, `clubTeamName`, opposition labels), saved-report validation (grades are validated after canonicalisation), and the opponent label in 2.6. Applied in `getVisibleStatData` after the cached rows are expanded, using `getStatsSettings()`, which already revalidates with `STATS_TAGS`.
- **Shared links.** `?grade=` values are validated against canonical names, so an existing shared URL that uses a raw spelling falls back to "all grades" once a rename or the default normalisation merges that spelling. The parser therefore also accepts a raw spelling and maps it through `canonicalGrade` before validating, so old links keep working.
- **Risk note in the UI help:** renaming a grade can change its category (that is the point), so the admin sees the resulting category beside each mapping.

### 6.4 (d) Notification centre (#11)

No new collection, migration or nav entry. `payload/components/NotificationCentre.tsx` (RSC) replaces the "Needs your attention" block on `Dashboard.tsx` (the committee still sees a short list, admins also see technical lines). Sources, all existing: the latest `player-sync-runs` rows; `getPendingCounts` (stories and photos, as today); the existing milestones widget link; and, for admins, the duplicate-suggestion count and the import log. **There is no new "milestones crossed" computation in W2**: crossings measured from match rows use the wrong baseline (the games, runs, wickets and catches thresholds have baselines from `player-seasons`, and 4.2 refuses to mix sources), the match rows cover only the stored window, and a rolling 7-day window would re-announce one crossing on seven nightly runs. A correct version would diff `player-seasons` totals before and after the sync, scoped to the previous successful run; it needs an extra column and a sync step for a nicety and is deferred (link to a new issue under #38 when created). Copy lives in `payload/admin/copy.ts` and is plain: committee sees "Player stats were updated last night" or "Last night's stats update did not finish. The site is still showing the previous numbers. Please tell the site administrator." Admins additionally see counts (`matchError`, `matchMismatches`, matches saved) and a link to Sync runs. Never raw error text for editors.

### 6.5 (e) AI-assisted yearbook narrative (#12)

- **Dependency.** Add `ai` (AI SDK) to `package.json`; the call is `generateText({ model, prompt, maxOutputTokens, abortSignal })` with a plain `provider/model` string routed through the Vercel AI Gateway **(verify the exact call shape and current model ids against the `vercel:ai-gateway` and `vercel:ai-sdk` skills at build time)**. The `model` string comes from `process.env.YEARBOOK_AI_MODEL`, falling back to `AI_DEFAULTS.yearbookModel` in `config/site.ts` (it stays there; no model id appears in app or library code).
- **Gate.** `aiConfigured()` is true when `AI_GATEWAY_API_KEY` is set or, on Vercel, the OIDC token is present. When false the admin button is disabled with "AI drafting is not set up on this site" and the endpoint returns 503. No network call is made when unconfigured, in dev, or in tests.
- **Endpoint** `POST /api/yearbooks/:id/draft-summary` (collection endpoint, `role = admin`). Hardening: `maxOutputTokens` (about 600, enough for 300 words), an `AbortSignal` timeout (30 s) and a route `maxDuration`. The prompt is built from published aggregates only: the season record and by-grade results, the leaders already shown on the public yearbook (non-hidden players), highlights from match data, and honours entered for that season. It never receives opposition player names, emails, phones, bios or hidden players. The facts are passed as a delimited data block (for example a fenced JSON block), and the prompt states that the text inside is data, never instructions, because honours and opponent labels are free text; the model is told to use only the supplied facts, never invent events, and write at most 300 words of plain prose in the club's configured locale. The endpoint returns the text and **does not save it**.
- **Rate limit (one counter).** One site-wide daily counter (`AI_DAILY_DRAFT_LIMIT`, default 20) kept in a single row and incremented atomically with `UPDATE ... SET count = count + 1 WHERE day = today AND count < limit RETURNING` (a new day inserts a fresh row), so two concurrent calls cannot both pass. The Gateway spend limit is the backstop. There is no per-yearbook cooldown, no per-yearbook limit and no `aiDraftAt`, `aiDraftCount` or `aiDraftDay` fields on the yearbook. Refusals return a friendly message.
- **Flag lifecycle.** `seasonSummaryAi` (hook-owned) is set when a draft is accepted into the form by the button and cleared by a `beforeChange` hook whenever the saved `seasonSummary` is empty. An editor who discards the draft (empty field, or the "Discard AI draft" button that clears the flag) is never blocked or labelled. An editor who keeps an AI-flagged summary must tick `seasonSummaryChecked` ("I have read and corrected this text") to publish; a new draft resets it.
- **Admin UI.** A button "Draft a season summary" (client field component) fills `seasonSummary` in the form (not saved until the editor saves) and shows "AI-assisted draft, please check". The committee form shows one textarea (`seasonSummary`, 6000 characters) and one checkbox (`seasonSummaryChecked`); `seasonSummaryAi` is `admin.hidden` or `readOnly` for editors (hook-owned). **Never auto-published:** a `beforeChange` validation refuses `status = published` while `seasonSummaryAi && !seasonSummaryChecked`, with a plain message.
- **Public render.** `seasonSummary` is rendered as text (paragraphs split on blank lines, never `dangerouslySetInnerHTML`). The note under an AI-flagged summary reads "Written with AI assistance" (`club.pageCopy.yearbooks.aiNote`, config-driven). It does not claim "checked by the committee": the checkbox only records that the person who ticked it read the text, and the ticking user is stored on the yearbook (`seasonSummaryCheckedBy`, hook-owned) for audit.
- **Tests, mocked:** `lib/ai/yearbook-draft.ts` takes an injected `generate` function; unit tests cover the prompt builder (no hidden names, no personal fields, deterministic ordering, facts delimited and an injected instruction inside an honour stays in the data block), the gate matrix (key, OIDC, neither), the model-id resolution (env over config), the publish gate hook, the atomic counter (two concurrent calls at limit minus one admit exactly one) and text-only render. No test imports the real model; `ai` is mocked at module level.

### 6.6 Files, migrations, access

New: `lib/history-import/*`, `payload/endpoints/{historyImport,mergeUndo,yearbookDraft}.ts`, `lib/ai/draft-counter.ts`, `payload/components/{PlayerDataToolsView,NotificationCentre,LabelRenamesHelp,YearbookDraftButton}.tsx`, `payload/collections/MergeLog.ts`, `lib/players/{duplicates,duplicate-queries,merge-snapshot,same-game}.ts`, `lib/stats/labels.ts`, `lib/ai/yearbook-draft.ts`. Changed: `payload/endpoints/mergePlayers.ts`, `payload/collections/{PlayerSeasons,Matches,Players,Yearbooks}.ts`, `payload/globals/SiteSettings.ts`, `lib/players/sync.ts`, `lib/match-store/{write,reconcile}.ts`, `payload/admin/{navigation,copy}.ts`, `Dashboard.tsx`, `config/site.ts`, `package.json`, `.env.example` (documents `AI_GATEWAY_API_KEY`, `YEARBOOK_AI_MODEL`, `AI_DAILY_DRAFT_LIMIT`; no key is ever committed or put in `.env.local`).

Migrations: `w2_s3_import_tags` (`player_seasons.source/import_batch/season_start_year`, `matches.source/import_batch`), `w2_s3_labels_names` (`players.preferred_name`, `site_settings` label-renames array table), `w2_s3_merge_log` (`payload.merge_log`, locked-docs column), `w2_s3_yearbook_ai` (yearbook fields `seasonSummary`, `seasonSummaryAi`, `seasonSummaryChecked`, `seasonSummaryCheckedBy`, plus the one-row `ai_draft_counter` table). Each is schema-qualified, `check:migrations` replays them, and the `players` hooks and `site-settings` stay on `revalidateStats()`.

Classification for the committee admin: `merge-log` is an `internalCollection`; `saved-reports` (S2) and the one "Player data tools" view are `advancedNav` entries with `hiddenFromEditors` (two new advanced entries in all; the everyday nav is verified at 16 with a test cap of 16, so no everyday entry is added); the notification centre is part of Home. The yearbook AI bookkeeping fields are `admin.hidden` or `readOnly` for editors.

### 6.7 Tests

Unit: `history-import-parse` (limits, BOM, quotes, apostrophe rule), `history-import-season-totals` and `-match-rows` (every error message above, unballed rule, consistency of team totals), `history-import-plan` (idempotency keys, overlap with PlayHQ, new-player warnings), `players-duplicates` (similarity cases, blocking keys, co-appearance veto, dismissed pairs, ranking), `players-merge-same-game` (refusal when the two share a match), `players-merge-snapshot` (identity-only snapshot completeness against `planMerge`), `stats-labels` (normalisation on the real variants, mapping precedence, opponent mapping to an org-id key, category effect, most-frequent-spelling tie rule), `yearbook-draft-prompt`, `yearbook-draft-gate`, `yearbook-draft-rate-limit`, `yearbook-publish-gate`.
Integration: `history-import.int` (preview writes nothing, apply is atomic, re-apply is unchanged, a double-header imports as two games, sync run afterwards leaves imported season and match rows intact, active flags unaffected, undo-batch), `merge-undo.int` (merge, undo, then a simulated sync routes the original name key to the restored player and season rows are rebuilt, not restored; appearances relink by name key; same-game merge refused; refusal after a later merge), `labels.int` (rename changes grade filters, records and category; stored rows unchanged), `preferred-name.int` (survives a sync, absent from aliases), `yearbook-ai.int` (endpoint with an injected generator; 503 when unconfigured; atomic counter; editor cannot call it), plus the access suite additions for `merge-log`, `saved-reports`.

### 6.8 Docs

New: `history-import-export.mdx`, `duplicate-players-and-undo.mdx`, `name-and-grade-labels.mdx`, `admin-notifications.mdx`, `ai-season-summary.mdx`. Updated: `playhq-player-sync.mdx` (merge, import safety), `committee-admin.mdx`, `players-directory-and-profiles.mdx` (preferred name), `season-yearbooks.mdx`, `club-and-site-settings.mdx` (label renames, minimums), `index.mdx`, `help` content in `payload/admin/helpContent.ts`.

### 6.9 Seed (demo)

Invented grade variants ("2. Demo District" and "Demo District", "Demo B Grade" and "Demo B grade") with one label rename; a near-duplicate pair of invented players (different spellings, same team, never in one game) and a same-game pair that the merge refuses plus one merged-and-undoable example (the merge log row created by running the real merge, not hand-written); a preferred name on one player; sample import CSVs under `tests/fixtures/history-import/` (valid, with errors, and an overlap case) used by tests and by the acceptance steps; a hand-written (not AI) season summary on the demo yearbook.

### 6.10 Acceptance (local)

1. Download both templates, import the valid fixtures: preview shows counts, apply creates rows tagged `import`; re-apply reports unchanged; the error fixture lists row numbers and reasons and writes nothing.
2. Run the sync against fixtures (no live PlayHQ): imported rows survive and order below PlayHQ seasons.
3. Open Player data tools, Duplicate players: the seeded pair ranks first with reasons, the same-game pair is absent and a manual merge of it is refused; merge the real pair, then Undo: the player, aliases, honours, people and sponsor links return; run a sync fixture and confirm the original name key routes to the restored player and season rows are rebuilt.
4. Add a label rename: leaderboards, filters, records and the yearbook show one grade name; the category follows the rename.
5. Home shows the plain notification list; force a failed sync run in the test DB and see the committee wording and the admin counts.
6. With no AI env the button is disabled; with a test-only stub generator (int test) a draft fills the field with the notice and publishing is blocked until "checked" is ticked.

### 6.11 Risks

- The sync change (`DELETE ... WHERE source = 'playhq'`) is the safety-critical edit: covered by a dedicated int test and reviewed first. A bug here could delete imported history or leave stale PlayHQ rows.
- Undo restores identity only (player row, aliases, honours, links); season rows and appearances are rebuilt by relink and the next sync, so nothing stale is ever written back.
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

// lib/match-store/stats-queries.ts (server-only; FINAL, non-hidden, cached with ALL_STATS_TAGS)
export function getSeasonFacts(seasonStartYear: number): Promise<SeasonFacts>
export function getPlayerMatchFacts(playerId: number): Promise<PlayerMatchFacts | null> // filters the cached season blobs
export function getMatchCoverage(): Promise<MatchCoverage>

// lib/stats/labels.ts (pure)
export function canonicalGrade(raw: string | null, map: LabelMap): string
export function applyLabels<T extends { gradeName?: string | null; teamName?: string | null }>(rows: T[], map: LabelMap): T[]

// lib/stats/tags.ts (STATS_TAG is the existing export of lib/stats/queries.ts, re-exported)
export const ALL_STATS_TAGS: readonly ['player-stats', 'match-store']
export function revalidateStats(paths?: string[]): Promise<void>

// lib/history-import/plan.ts (pure)
export function planSeasonTotalsImport(rows: ParsedRow[], ctx: ImportContext): ImportPlan
export function planMatchRowsImport(rows: ParsedRow[], ctx: ImportContext): ImportPlan
```

Rules for later waves: use `ALL_STATS_TAGS`; never read `gradeName` raw; never store a club person as text; imported rows are `source = 'import'` and never deleted by sync code; a new match-derived statistic ships with its derivation rule in section 2, a coverage caption and a unit test for each edge case.

## 8. Data-quality assumptions about the real data (inferred from the repo)

- **Grade names are inconsistent.** Captured fixtures show `Senior Men B Grade` (38) and `Senior Men B grade` (6), `Senior Men D Grade` and `D grade`, `Senior Men E Grade East` and `E grade East`, `Senior Men E`, `Senior Men E Grade`, `Premier` versus `Senior Men Premier`, `Senior Men 1 Day Comp` versus `Senior Men One Day`, a bare `Senior Men` and `Senior Competition`; the committee also reported `2. Senior Men District` next to `Senior Men District` in real data (not in the fixtures; a leading numbering). Assumption: case, spacing and leading-number variants are the same grade; East/West and format variants are not, unless an admin maps them.
- **Juniors.** Classification is regex based (`JUNIOR_GRADE_RE`: `u12`, `under 14`, `junior(s)`, `girls`, `boys`, `youth`; `JUNIOR_COMPETITION_RE` also drops winter competitions). A fixture grade `U15 All Star Girls` is junior. Assumption: the sync is senior-only, so the match store has no junior rows; a grade whose name matches no junior word but contains only juniors would leak into senior stats and into the match store, which is why imports reuse the same rule and the label mapping can reclassify. These grade names are data-quality notes only: keep them out of code and test fixtures that are not under seed.
- **Windows.** The existing presets assume stored seasons from 2023/24; the match store starts at whatever the backfill loads, so match-derived figures can cover fewer seasons than season totals and must say so.
- **Names.** No PlayHQ player id; one name can be two people and one person can have two spellings, so duplicates exist in production and some name keys already map via aliases.
- **Real shapes seen:** fall of wickets in some innings only, entire fielding sides with no bowling data, innings with runs but no balls/4s/6s, a 6-run discrepancy, a placeholder second innings in two-day games, forfeit games FINAL with only the playing side listed, abandoned games with no data (not stored). **Unseen:** run out, stumped and retired in real data.
- **Opponents.** `opponentOrgId` is stable; team names vary per grade and season. Imported history has no org id and joins PlayHQ opposition only through an admin opponent mapping (2.6).
- **Format.** Most club grades are one format each, so the format filter is mostly redundant with grade at this club (two-day senior grades versus the one-day competition); it stays because it costs nothing and other clubs mix formats.

## 9. Final Verify step (once, at the end of W2)

1. `pnpm tsc --noEmit`, `pnpm lint`.
2. `pnpm generate`, `git add` the generated files, `pnpm check:generated`, `pnpm check:migrations`.
3. `pnpm test` (unit), then `pnpm test:int` (sequential; both share the test DB, never two vitest processes at once).
4. One `pnpm build` (output tailed).
5. `pnpm seed:demo` against `langlang_dev`, then the acceptance lists in 4.8, 5.11 and 6.10 on a dev server (ports 3700 to 3799), screenshots of a profile section, the partnership records, StatLab match mode, the yearbook sections, the import preview and the duplicates view (both in Player data tools).
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
- Saved reports store a canonical query string rather than a JSON schema because the existing parser is already a strict whitelist and a second validator would drift; they are an admin-only bookmark list in W2.
- Milestone counters for 50s, 100s and five-fors are "since first stored match" with no baseline fields, to avoid claiming lifetime totals.
- Merge undo restores identity only and lets the sync rebuild season rows; the alternative (snapshotting counts and ids) goes stale after one nightly run.
- Label renames are read-time mappings, not data rewrites, because the sync replaces rows nightly.

## Appendix C. Review findings: how each was resolved

A review of the first draft raised 27 findings. Resolutions:

- **Accepted and applied:** 1 (merge undo restores identity only, section 6.2), 2 (same-game merge refusal, 6.2), 3 (per-row ball rule, 2.2a and section 1), 4 (run-outs and stumpings from fielding rows with event reconciliation, 2.3), 5 (caught-behind split cut, 2.3), 6 (lowest totals only when all out, 2.6), 7 (fielding columns dropped from the match-rows template, 6.1), 8 (opponent mapping targets an `oppositionKey`, locale-neutral normalisation, 2.6 and 6.3), 9 (new milestone computation cut from W2, 6.4), 10 (profile route stays `force-dynamic`, section 3), 11 (per-player cache dropped, section 3), 12 (season cap, noindex, memoised `runStatLab`, no split branch, section 3), 13 (blocking and caching for duplicates, 6.2), 14 (one `STATS_TAG` definition re-exported, `ALL_STATS_TAGS`, section 3), 15 to 17 (forfeit rule, dismissal denominator, "recorded" five-fors and ten-in-a-match, 2.2, 2.3, 2.7), 18 (all-out with fewer than ten, rejection counts, 2.4), 19 (yearbook highlights labelled by source, 5.5), 20 (position columns "as scored", buckets only, 2.5 and 5.1), 21 (shared `needsGuard`, round-trip property test, no `#` lines, 5.4), 22 (AI endpoint hardening, atomic single counter, delimited data, text-only render, reworded public note, 6.5), 23 (hidden partners hidden from profile lists too, 2.4), 24 (decade, 8 presets, 7 columns, public saved reports and OG card, `renumberImportedSeasons()` and the nickname table all cut or deferred), 25 (`gameId` includes grade and optional `game_ref`, 6.1), 26 (one "Player data tools" view, AI bookkeeping fields hidden, `preferredName` slug verify, 6.1 and 6.6).
- **Accepted as a verify item, not a design change:** 3 (second half: whether `aggregatePlayers` coerces null `balls` to 0 is recorded as a **(verify)** in section 1; the review's claim is plausible because `lib/playhq/players.ts` adds `b.balls` as a plain number, and the plan is to carry null through or derive from stored rows), 4 (the `RUN_OUTS_*` and `STUMPINGS` names are unverified on real data, rule 0.7, with the fall-back to drop the leaderboard if absent), 12 (noindex on the new export and match-mode routes is verified at build; `/statlab` already has it).
- **Rejected or not changed:**
  - 12, "memoise or cap": both are applied, but a hard cap on the number of columns beyond the existing 12 is not added, since 12 is already the picker's limit.
  - 22, a per-user claim in the public note: not added; the public note makes no claim about people at all, and the checking user is stored for audit only.
  - 26, "menu bloat is acceptable": agreed, no change beyond folding two views into one.
  - 27: no change needed; the review found no hard-coding. The two verifies (locale-neutral `normaliseClubName`, `AI_DEFAULTS` staying in `config/site.ts`) are now stated in 2.6 and 6.5.
  - "Verified as correct" items: no change.
