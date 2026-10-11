# Wave B: innings save fix, best-player votes, net sessions and the editable player card (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #18 (best-player votes), #19 (net sessions), the remaining part of #20 (editable player card). Plus one bug found by the nightly sync (WP-0). Out of scope: the post designer (#21), scheduled posting (#23), the fantasy competition (#36), anything that needs a new external service.

| WP | Issues | One line |
| --- | --- | --- |
| WP-0 Innings save bug | bug, no issue | Two PlayHQ periods with the same `sequenceNo` made the whole game fail to save. Identify innings by PlayHQ period id and derive our own ordinal. |
| WP-1 Best-player votes | #18 | 3-2-1 ballots through the availability link and PIN, a season leaderboard with a race chart, a public page the committee can switch on, and a presentation mode for awards night. |
| WP-2 Net sessions and the player card | #19, #20 (rest) | Check-in, a rotation timer that survives a reload, stored attendance, and a player card the selectors can edit (role, styles, notes) that shows net attendance. |

Build order is WP-0, WP-1, WP-2. WP-0 is independent and ships first because it is a data-loss bug. WP-1 and WP-2 each get one migration and one feature doc set.

Product goal (applies everywhere): this repository is reused for other clubs. Colours, crest, fonts, names, copy, hosts, cookie names come from the `theme`/`club` globals or env (`config/site.ts`), never from code. Tailwind `brand-*` tokens only, no hex literals, no "Lang Lang" strings outside `config/site.ts` and seed defaults. `tests/no-brand-hex.test.ts` and the club-name guard stay green, and their path lists are extended to the new files (section 1).

## 0. Findings that shape the design

Checked against this branch unless marked **(verify)**; verify items are in Appendix B.

1. **The bug (read from the local fixture, names not reproduced here).** Game `8360989d-...` (2024/25 District, 2024-10-26) has four periods: ordinal 1 and 2 first innings, then two periods that both say `sequenceNo: 3` / `SECOND_INNINGS`. One (`725fa424`) has both sides present but zero appearances and zero statistics; the other (`2d6a7ea9`) has 11 batters, 6 bowlers and 8 wickets. `mapMatchBundle` (`lib/playhq/match-rows.ts`) copies `p.sequenceNo` straight into `InningsRow.sequenceNo`; `match_innings` has a unique index on `(match, sequenceNo)`; so the batch insert in `writeBundle` (`lib/match-store/write.ts`) violates it and the whole game transaction fails. Nothing else in the store depends on the absolute number: `facts.ts`, `queries.ts` and `aggregate.ts` only match `inningsSeq === sequenceNo` or sort by it. `writeBundle` re-keys children by the inserted `sequenceNo`, which stays correct once the numbers are unique.
2. **Placeholders already exist.** The two-day fixture (`tests/fixtures/playhq/game-summary-two-day.json`) has placeholder third and fourth innings with 0 and 12 appearances and no stats; they are stored today with `played = false` through `isInningsPlayed`. A fully empty period is the same case with fewer rows, so "store, `played = false`, no children" is the existing convention, not a new one.
3. **One mapper feeds every writer.** `mapMatchBundle` is called by `lib/players/sync.ts` (the nightly `/api/cron/players-sync`), `payload/scripts/backfill-matches.ts` and `payload/scripts/fixtures/match-seed-db.ts`. The history import builds rows by hand in `lib/history-import/bundle.ts` (sequence 1 and 2, no period ids). The public scorecard `mapScorecard` (`lib/playhq/scorecard.ts`) also sorts by `sequenceNo` and would show the empty period as a ghost innings.
4. **Votes need the same identification as availability.** `lib/availability-public.ts` already has `resolveLink`, `rememberedPlayer`, `identify` (name, PIN or one-time code, throttled), the `_avail` cookie and `lib/throttle.ts` (`hit`, `isLocked`, `clear`, atomic upsert on `throttle_hits`). Votes reuse all of it and add no second login.
5. **Eligible voters and nominees come from sheets, not guesses.** `team-sheets.publishedSnapshot` holds the published XI for a `selection-fixtures` row; `matches` + `match_appearances` hold who actually played once PlayHQ has the scorecard. Many games will have no published sheet (the tool is new), so the nominee source has a documented fallback (section 3.4).
6. **Votes are secret ballots; only totals can ever be public.** Per-game totals with one voter would reveal that voter's picks, so a per-game minimum is part of the design (3.3). The committee admin can technically read raw ballots over REST (admin only, for support); this is stated in the doc.
7. **#20 is mostly shipped.** The match-day overview, role (stored or guessed), `canKeep`, private `notes`, last-five form and next-month availability are on the card (`docs/features/match-day-overview.mdx`, `lib/selector-profile-queries.ts`, `components/selector/player-forms.tsx`). What remains: batting/bowling style, net attendance, staff-only notes, and making the card edit-in-place.
8. **GraphQL is disabled** (`graphQL: { disable: true }`), so every "REST + GraphQL" row below means REST and the Local API. Public pages read through `lib/*-queries.ts`, which state their own visibility filter because the Local API ignores access rules.
9. **The selector bottom bar already has four tabs** (`lib/selector-nav.ts`). Adding Votes and Nets would make six at 360 px; section 4.1 fixes this with a fifth "More" tab, not two more.
10. **The committee menu is at its cap.** No new collection or global gets an entry in `everydayNav` or `advancedNav`. New collections are selection collections (hidden for every role), vote options are fields on the existing `selection-settings` global, and the work happens in the selector area.

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit paths with `git add`, never `git add -A`, never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`: `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); verify hosts are `127.0.0.1` before any DB work; no Blob token; no remote DB; no Vercel CLI. No live external calls: anything that could reach PlayHQ runs with `PLAYHQ_CLIENT_ID=` empty and tests use fixtures. Facebook, email providers, the AI gateway and social networks are mocked in tests and env-gated. **This wave introduces no new external call.** Dev server ports for this wave are 4000-4099 (the brief overrides the 3400-3499 in `CLAUDE.md`; `CLAUDE.md` is not edited).

**Migrations.** `wp_0_innings_period_id`, `wp_1_votes`, `wp_2_nets_card`, each created with `pnpm payload migrate:create <name>`, schema-qualified (`"payload"."..."`), `.ts` and `.json` committed. After each: `pnpm generate`, `git add payload-types.ts "app/(payload)/admin/importMap.js"`, then `pnpm check:migrations` and `pnpm check:generated` pass. Dev DB reset is `DROP SCHEMA payload CASCADE` via node + pg (push hangs without a TTY), then `pnpm payload migrate`.

**Admin classification.** Every new collection is added to `selectionCollections` in `payload/admin/navigation.ts` (hidden for every role, absent from both menus, REST-readable only as stated per table) and `tests/admin-visibility.test.ts` already enforces that list both ways. No new global: vote and nets options are fields on `selection-settings` (Advanced, admin only). Because editors are the committee and must be able to switch the public leaderboard, **vote settings are edited in the selector area by a staff-guarded server action** (`isStaff`: admin or editor; selectors cannot), the same seam by which link rotation writes the admin-only global today (`lib/selector-availability-queries.ts`). The REST `update` on the global stays `isAdmin`, so widening nothing.

**Staff means staff.** `isStaff` is admin or editor only; selectors are a separate role (`isSelection` = admin, editor, selector). New code never writes `Boolean(user)` or `!req.user` as an access check; `tests/staff-guard.test.ts` keeps enforcing it.

**Personal data.** Ballots, picks, attendance, phones and notes are never public over REST or the Local API as used by pages. Field-level `access.read`/`update` is set explicitly on every sensitive field (`hidden` alone does not stop a REST `where` probe). CSV exports are admin-only and formula-injection safe (the exporter shares `needsGuard` from `lib/stats/csv.ts`).

**Server actions are public POSTs.** Each one re-derives who is calling (`requireSelection()` / `isStaff` / the signed availability cookie), validates with a pure function and derives `source`, `setBy` and `castBy` from the session, never from form fields.

**Mobile first and accessible.** 360 px first, 44 px tap targets, no hover-only controls, no colour-only meaning, visible focus, `prefers-reduced-motion` respected, the timer is `role="timer"` and is not announced every second.

**Guard scope.** The brand-hex and club-name guards, `tests/selection-guards.test.ts`, `tests/selector-guards.test.ts` and `tests/staff-guard.test.ts` scan new paths: `app/(frontend)/votes/**`, `app/(frontend)/availability/**` (already), `app/(frontend)/selector/**` (already), `lib/votes/**`, `lib/nets/**`, `components/votes/**`, `components/nets/**`.

**Docs.** New: `docs/features/best-player-votes.mdx`, `docs/features/net-sessions.mdx`. Updated: `match-day-overview.mdx` (player card), `match-data-store.mdx` (WP-0), `availability-link.mdx` (the vote section), `selector-accounts.mdx` (More tab), and `docs/features/index.mdx`. `tests/feature-docs.test.ts` forces the shape; `collections` and `related` must name real slugs. Docs are written when each WP lands and describe only what is built.

**Efficiency.** Iterate with targeted checks (`tsc --noEmit`, `pnpm generate`, one vitest file, eslint on changed files). Run the full vitest suite once and `next build` once, in the final verify step, never two vitest runs at once.

## 2. WP-0: innings save bug (duplicate PlayHQ period sequence numbers)

### 2.1 Decisions

1. **Identity is the PlayHQ period id.** `InningsRow` gains `periodId: string | null` (null for imported games) and `playhqSequenceNo: number | null`.
2. **Our `sequenceNo` becomes a derived ordinal 1..n.** Periods are ranked by `(playhqSequenceNo, played first, periodId)`. A played period outranks an unplayed one with the same PlayHQ number, so the real third innings keeps ordinal 3 and the empty twin gets 4. The final tie-break is the period id (not array position), so the order, and therefore `sourceHash`, does not flap if PlayHQ reorders the array. For every game that has unique, contiguous numbers today the result is identical to now.
3. **Empty periods are stored, not skipped.** A period with both sides present but no appearances, no statistics, no fall of wickets and no shared events becomes an innings row with `played = false`, zero totals, no `hasFallOfWickets/hasBowlingData/hasBallData`, and no child rows. This is exactly the placeholder convention, so `isInningsPlayed` and the season reconciliation need no change: the aggregates ignore unplayed innings and `reconcileMatchStore` compares per (player, team, season) counts which the empty period cannot move. A period with neither a batting nor a bowling team is still skipped (existing behaviour).
4. **A warning, not a failure.** Two periods sharing a PlayHQ number emit `duplicate_sequence:<n>` in `warnings` (already surfaced by the sync summary); unknown shapes never throw.
5. **Defence in depth.** `writeBundle` calls a pure `assertUniqueInnings(bundle)` before inserting: duplicate `sequenceNo` or `periodId` throws an error naming the game, so a future mapper regression fails loudly and per game instead of as a bare constraint error. Both writers (`upsertMatchBundle` and the import path) share it.
6. **`MAPPER_VERSION` goes 1 to 2.** The hash includes the version, so the next nightly sync rewrites every stored game once (the existing convention; cost is one slow night, children are replaced wholesale). No manual backfill is needed; the dev copy can use `payload/scripts/backfill-matches.ts` with `PLAYHQ_CLIENT_ID=` and a fixture-backed client only for local checks.

### 2.2 Data model and migration `wp_0_innings_period_id`

`match_innings` gains `period_id` varchar (nullable) and `playhq_sequence_no` integer (nullable). New unique index `match_innings_match_period_idx` on `(match_id, period_id)` (Postgres allows many NULLs, so imported rows are fine). The existing `(match, sequenceNo)` unique index stays. `payload/collections/MatchInnings.ts`, `lib/match-store/read.ts` (select + map the two columns) and `lib/history-import/bundle.ts` (set both to null) change with it. Existing rows keep NULLs until the next sync rewrites them.

### 2.3 Mapper change (shape)

`mapMatchBundle` does two passes: pass 1 maps each period to an intermediate record (innings row, its batting/bowling/fielding rows keyed by `periodId`); pass 2 ranks the records, assigns `sequenceNo`, and writes `inningsSeq` on the child rows from the assigned ordinal. A small pure `isEmptyPeriod(period)` is exported and shared with `mapScorecard`, which then drops empty periods from the public scorecard (a placeholder with 12 did-not-bat appearances is not empty and is unchanged; a regression test pins both).

### 2.4 Access, routes, admin

No access, route or admin-navigation change. `match-innings` stays an `internalCollections` entry (hidden, never writable over REST).

### 2.5 Anonymised fixture

The raw summary contains real names and is never committed. A throw-away script in the scratchpad (not in the repo) reads it and writes `tests/fixtures/playhq/game-summary-duplicate-sequence.json`: deterministic fake names (`Home Player 01`.., `Away Player 01`..), fake UUIDs derived by hashing the originals with a fixed salt (relationships between appearances, teams and periods preserved), the club org and team ids replaced by those used by `game-summary-two-day.json` so the existing test context helper (`tests/match-facts-helpers.ts`, `tests/int/match-helpers.ts`) applies **(verify)**, fake venue and grade names, and dates kept. A guard test asserts every name in the fixture matches the fake pattern, so a raw name can never be committed by mistake. The script and the raw file are not added.

### 2.6 Tests

Unit (`tests/match-rows-duplicate-sequence.test.ts`): four innings, `sequenceNo` exactly 1..4, `periodId`s unique, `played` is true, true, true, false; the played third period has 11 batting rows and its children point at ordinal 3; the empty period has no children; `duplicate_sequence:3` warning present; `sourceHash` identical when the periods array is reversed; `MAPPER_VERSION` is 2; `assertUniqueInnings` throws on a hand-built duplicate; `mapScorecard` over the fixture shows three innings (no ghost) and the two-day fixture still shows its placeholders; the name guard on the fixture.
Integration (`tests/int/match-store-duplicate-sequence.int.test.ts`): `upsertMatchBundle` returns `created`, the rows are 4 innings with 11 batting rows on ordinal 3, a second call is `unchanged`, `reconcileMatchStore` for the pair has zero mismatches and the pair is not in `skipPairs`. Extend `tests/int/match-sync.int.test.ts` (it already runs the sync against fixtures) with this game, proving the nightly path through `lib/players/sync.ts` saves it and the summary counts it as upserted, not failed. History import and `match-seed-db` suites stay green unchanged.

### 2.7 Docs and seed

`docs/features/match-data-store.mdx`: one paragraph (innings are keyed by PlayHQ period id, empty periods are stored as not played). No seed change (the fixture is test-only; the demo match seed uses its own deterministic data).

### 2.8 Acceptance (local)

`pnpm vitest run tests/match-rows-duplicate-sequence.test.ts`; then the int test against `langlang_test`; then, on the dev DB, run the sync summary path with `PLAYHQ_CLIENT_ID=` and the fixture client and read back `select sequence_no, period_id, played from payload.match_innings` for the game.

### 2.9 Risks

The rewrite of every game on the first sync after deploy. Mitigation: it is the same path as every previous mapper bump and the write is per game in its own transaction. Ordinal renumbering for games with non-contiguous PlayHQ numbers changes nothing observable because consumers key on id or relative order. An unlisted second source of duplicates (a duplicate `periodId`) is caught by `assertUniqueInnings`.

## 3. WP-1: best-player votes (#18)

### 3.1 Overview

After a game, players cast a 3-2-1 ballot for the best players of that game, from the same no-login availability link and PIN. Selectors see participation and the full tally privately. The committee can switch a public leaderboard on. Awards night uses a presentation mode that reveals the count one round at a time. Everything is off until `votesEnabled`.

### 3.2 Settings (fields on `selection-settings`, migration `wp_1_votes`)

A "Best player votes" group, all with `admin.description` plain-English helper text:

- `votesEnabled` checkbox, default false. Off hides every vote surface (availability section, selector tabs/cards, public page returns 404).
- `voterRule` select: `players_in_game` (default: a voter must be in that game's team) or `squad_members` (anyone in a current squad of that grade).
- `allowSelfVote` checkbox, default false.
- `ballotValues` text, default `3,2,1`. A pure `parseBallotValues` accepts 1 to 5 positive integers in strictly descending order (for example `5,3,1` or `2,1`); the same function is the field `validate`, so the admin form, the action and the tally agree.
- `tieBreaks` array of selects, ordered, default `countback, most_ballots, fewest_games`: `countback` (most top-value votes, then the next, and so on), `most_ballots` (votes received in more games), `fewest_games` (fewer appearances in the scope, so the same points in fewer games ranks higher), `latest_round` (more points in the latest counted round), `shared` (stop; equal ranks are shown as shared, ordered by surname only for display). The list may be shortened; unresolved ties are shared.
- `voteWindowDays` number, default 7: ballots open when the fixture is final and close this many days after the game date.
- `editWindowHours` number, default 24: a voter may change their ballot until `min(first cast + hours, window close)`.
- `minBallotsToCount` number, default 3: a game counts in any displayed total only when it has at least this many ballots (privacy of the secret ballot, see 3.3). Clubs with a small voter pool lower it.
- `publicLeaderboard` checkbox, default false; `publicScope` select `club`, `grade`, `both` (default `club`); `publicShowBreakdown` checkbox default true (the 3s/2s/1s columns).
- `netsDefaultCount`, `netsDefaultMinutes`, `netsDefaultGroupSize` are added by WP-2 in its own migration.

`getSelectionSettings` (`lib/selection/store.ts`) returns the parsed, defaulted values; a pure `settingsFrom(raw)` clamps bad input so a corrupt row can never crash a page.

### 3.3 Data model

**`best-player-ballots`** (selection collection, `read`, `create`, `update`, `delete` all admin only; code writes with the Local API after its own checks):

- `fixture` relationship to `selection-fixtures`, required, indexed.
- `voterKey` text, required: `player:<id>` for a player voting through the link, `selector:<userId>` for a ballot a selector enters (phone calls, coaches, umpires), so a null voter never breaks uniqueness.
- `voter` relationship to `players`, nullable (set only for `player:` keys).
- `picks` array, required, each `{ place: number (1-5), player: relationship to players }`; field-level `read`/`update` admin only. Places must be 1..k with k = number of ballot values (fewer only when fewer eligible nominees exist), players distinct.
- `source` select (`voter`, `selector`), `castBy` user (selector entries only), `castAt`, `editedAt`, `revision`; all derived by hooks/actions, `create`/`update` nobody over REST.
- Unique index `(fixture, voterKey)`: one ballot per voter per game.
- The fixture snapshot of values is not stored; picks store the place, and points are computed from the current `ballotValues`, so a settings change re-tallies consistently. The doc warns that changing ballot values mid-season changes all totals.

**Fields added to `selection-fixtures`** (code-written collection): `votesState` select `auto` (default), `open`, `closed`; `countsForAwards` checkbox default true. `auto` follows the window above. A selector can close a game early, reopen it, or exclude it (for example a washed-out game) from the selector area; the action writes with the Local API.

**Rounds.** A round is the club weekend of a game (`lib/selection/weekend.ts` already computes it from the local date), so club and per-grade views share one axis. A scope's "last round" and "movement" use the rounds in which that scope has at least one counted game.

**Counted game** = fixture final, `countsForAwards`, season matches the scope, and ballots at least `minBallotsToCount`. Selector views list uncounted games with "2 of 3 ballots needed to count".

### 3.4 Who may vote and who may be nominated

- **Nominees** are the club's players in the game: the fixture's published `team-sheets.publishedSnapshot` slots with a `player` (guests excluded). If there is no published sheet, fall back to the stored match: club-side `match_appearances` with a resolved `player` for the fixture's `gameId`. If neither exists the game has no player ballots (selectors can still enter one from the nominee list they pick from the grade squad). Hidden players are never nominees.
- **Voters** follow `voterRule`: `players_in_game` = the same set as the nominees; `squad_members` = members of a current squad of the fixture's grade. A player cannot vote for themselves unless `allowSelfVote`. Selectors/staff can enter a ballot as `selector:<id>`, one per selector per game.
- Pure `lib/votes/ballot.ts`: `nomineesFor`, `canVote`, `validateBallot(picks, nominees, values, voterPlayerId, allowSelf)`, `editWindowOpen(fixture, ballot, settings, now)`. All unit-tested.

### 3.5 Access matrix (REST + Local API; GraphQL disabled)

| Resource | public (anonymous) | availability-link voter | selector | editor | admin |
| --- | --- | --- | --- | --- | --- |
| `best-player-ballots` rows and `picks` | none | none over REST; own ballot only through the link flow | none over REST | none over REST | read (support) via REST/Local API; write by code |
| ballot cast/replace | no | server action `castBallotAction` (cookie player, within window, own `voterKey` only) | `selectorBallotAction` (own `selector:` key; cannot read others) | same as selector | same |
| participation (who has voted, not for whom) | no | no | yes, via `lib/votes-queries.ts` | yes | yes |
| private leaderboard (all counted games) | no | no | yes | yes | yes |
| public leaderboard | only if `publicLeaderboard` and scope allowed | same | same | same | same |
| `selection-fixtures.votesState/countsForAwards` | read none | none | change via action | change via action | change via action |
| vote settings fields | none | none | read | change via staff action | change via admin form or action |
| votes CSV export | no | no | no | no | yes (`/api/admin/votes-export`) |

Selector pages never receive a (voter, picks) pair. The export contains season totals per player (points, counts per place, ballots, games), never individual ballots. Public vote data goes through one query file, `lib/votes-queries.ts`, whose public functions first check `votesEnabled && publicLeaderboard` and the scope, filter hidden players, apply `minBallotsToCount`, and return only totals.

### 3.6 Throttling and abuse

Casting reuses identification (the `_avail` cookie from `identify`); there is no new login. Writes call `hit()` with `votes:player:<id>` (20 per hour) and the existing per-link global pause covers guessing; a locked key returns the same uniform message as availability. The cookie player id is the only identity used: a form-tampered `voterKey` or `playerId` is ignored. Rotating the link kills cookies as today; ballots stay. Ballot stuffing is bounded by the unique `(fixture, voterKey)` index plus the eligibility check. A concurrency test casts 10 parallel ballots for one voter and expects exactly one row.

### 3.7 UI routes

- **Availability link (public, token in URL, headers already `no-store` and `no-referrer` via `next.config` for `/availability/:path*`):** when `votesEnabled`, `/availability/[token]` shows a "Vote for best player" card for each open game the identified player is eligible for ("Round 5 vs Opponent, vote by Sunday") and `/availability/[token]/vote/[fixtureId]` is the ballot page: one native `<select>` per place (labelled "3 votes", "2 votes", "1 vote" from `ballotValues`) listing nominees, or a tap list, submit, edit link while the edit window is open, then a read-only "Your vote is in" after. Plain 404 for a wrong link, an ineligible player or a closed game with no ballot.
- **Selector area:** `/selector/votes` (games needing votes with "7 of 12 voted" and a Chase list with a "Copy a reminder text" that reuses the availability link; open, close and exclude buttons; the private leaderboard with scope tabs club or grade; CSV button for admins), `/selector/votes/[fixtureId]` (enter a ballot on behalf of someone, replace without revealing the existing one), `/selector/votes/settings` (staff only, plain-English form for 3.2). Reached from the new More tab (4.1) and an Overview card when games need votes.
- **Presentation mode:** `/selector/present/votes?scope=club|<gradeId>&season=` lives outside the `(area)` layout (no tab bar), still guarded by `requireSelection()`. See 3.9.
- **Public:** `/votes` (and `?grade=`, `?season=`) renders only when the switch is on and the scope is allowed, else a plain 404; it is added to the stats navigation family (`components/site-nav.tsx` `STATS_FAMILY`), to the sitemap and not disallowed in robots only while on. A themed share image (`/votes/opengraph-image`, top three, via `themedImageResponse` and `getTheme()`) is included as a small extra and is the only share surface; posting it to social networks stays with #21/#23.

### 3.8 Leaderboard, movement and the race chart

Pure `lib/votes/tally.ts`: input `{ ballots (place, player, fixture), fixtures (round, grade, counted), values, tieBreaks, appearances per player }`; output ranked rows `{ player, points, counts[place], ballots, games, rank, shared, movement, roundPoints[] }`. Movement is previous rank minus current rank where the previous ranking is the same computation over all rounds before the scope's last counted round (up, down, new, unchanged; shown as arrow plus text). Tie-breaks apply in the configured order; ties that survive are shared ranks.

Pure `lib/votes/chart.ts` picks the top five (ties at fifth place included up to six) and builds cumulative series by round. `components/votes/race-chart.tsx` is a server-rendered inline SVG like `components/stats/progression-chart.tsx`: x is rounds, y is cumulative points, one polyline per player. **Colour never carries the meaning** (the brand tokens are gold shades, greys and black, which are not reliably distinguishable): each series has a distinct dash pattern and marker shape (circle, square, triangle, diamond, cross), a direct end-of-line label with the name and points, and `<title>`/`<desc>` plus a `<details>` table of the numbers. Strokes use classes `stroke-brand-*` cycling a fixed list of five tokens; a unit test asserts no hex literals and that the five tokens differ. The chart scrolls sideways inside its container rather than shrinking at 360 px.

### 3.9 Presentation mode

A client component `components/votes/presenter.tsx` fed one server-computed snapshot (rounds in order with per-game vote winners, cumulative leaderboard after each round, final top five), no refetching. The reveal sequence is built by a pure `buildRevealSteps(snapshot)`: title; for each round: round header, each game's vote winners revealed lowest value first, then the leaderboard after that round with movement; then the final top five counted down from fifth to first, then the winner. Controls: Right arrow, Space or Enter next; Left arrow or Backspace back; `F` fullscreen toggle (Fullscreen API on a user gesture, feature-detected); `Esc` leaves fullscreen; `R` restart; `?` toggles a help overlay; Home/End jump. The same actions exist as on-screen buttons (44 px) so a phone or clicker works. The current step is mirrored in `#step=` so a reload resumes. `aria-live="polite"` announces each step's heading; `prefers-reduced-motion` turns movement into an instant change. Sizing uses viewport units with a readable minimum for a projector. The snapshot contains totals only (no ballots); because it holds results for later steps, anyone with developer tools on the presenting laptop could read ahead, which is acceptable behind a selector login and is stated in the doc (the reveal is for theatre, not secrecy).

### 3.10 Tests

Unit: `parseBallotValues` (valid, ascending rejected, six values rejected, non-integers), `validateBallot` (duplicate player, self-vote, non-nominee, missing places, fewer nominees than places), `nomineesFor` (published sheet, fallback to appearances, guests and hidden excluded), `editWindowOpen` (inside, boundary, after window close wins), `tally` (points with custom values, countback and each tie-break in order, shared ranks, `minBallotsToCount` hiding a game, a game excluded by `countsForAwards`, movement incl. new entrant, grade scope), `chart` (top five with ties, cumulative series), `buildRevealSteps` (length, order, last step), settings clamping, export cell guard (a player named `=HYPERLINK(...)` is neutralised), distinct-token assertion for the chart, nav constants (More tab).

Integration (`tests/int/votes-*.int.test.ts`): cast through the real identify flow (name + PIN, cookie) and edit inside the window, refuse after it; one ballot per voter per game under 10 parallel casts; ineligible player, self-vote and non-nominee refused with the uniform message; throttle lock and the global pause behave as availability; closed/excluded games; **security**: anonymous, selector and editor REST `find`/`count`/`where` probes on `best-player-ballots` return nothing or 403, including `where[picks.player]` and `where[voterKey]` probes; no Local API page query, selector page query, public query, CSV export or presentation snapshot contains a (voter, picks) pair (snapshot test over the JSON); `/votes` is 404 when `publicLeaderboard` is off and when `votesEnabled` is off, and when on contains only totals; hidden players absent from the public board; a game below `minBallotsToCount` contributes nothing to any displayed total but shows in the selector participation list; only staff can change settings or game state (selector and anonymous refused, tampered form fields ignored); admin-only CSV; merging two players repoints ballots and picks and does not break the unique key (collision keeps the earlier ballot) **(verify the merge endpoint, Appendix B)**; the availability page and vote page keep `no-store` and `no-referrer`. `tests/admin-visibility.test.ts` classifies `best-player-ballots`. Route tests for the selector pages render as selector and refuse anonymous.

### 3.11 Docs and seed

`docs/features/best-player-votes.mdx` (persona: players, selectors, committee; honest limits: the committee admin can read raw ballots, last-4 PINs are guessable inside a family, changing ballot values changes totals, the minimum-ballots rule, the presentation snapshot) and the updates in section 1. Seed (`seed:demo`, extending `payload/seed/demo-selection.ts`): turn `votesEnabled` on and `publicLeaderboard` on for the demo only; mark the five demo finals as `selection-fixtures` rows with `status: 'final'`, publish a team sheet for each (fake demo players), and add deterministic ballots (a seeded generator, 8 to 12 voters per game, a few close finishes to show ties, a movement and an uncounted game) so `/votes`, the race chart and the presenter have real-looking data; log the demo availability link for casting a vote.

### 3.12 Acceptance (local, no external calls)

Seed; open the printed availability link in a private window, identify as a demo player, vote for a finished game and edit it; five wrong PINs lock; as the demo selector open `/selector/votes`, see participation and the private leaderboard; turn the public switch on via settings, open `/votes` and check the race chart at 360 px, with the table fallback; open `/selector/present/votes`, step with the keyboard and the buttons, toggle fullscreen, reload and resume; turn the switch off and see `/votes` return 404; export the CSV as the admin and open it.

## 4. WP-2: net sessions and the editable player card (#19, #20)

### 4.1 Navigation

The selector bottom bar becomes five items: Overview, Availability, Squads, Teams, **More**. `/selector/more` lists Votes, Nets, Availability link, Account (and Selectors for staff), each a large card; the Overview also shows a "Nets tonight" card on net days and a "Votes to chase" card when WP-1 is on. `lib/selector-nav.ts` and its test change; the existing four paths are unchanged.

### 4.2 Data model (migration `wp_2_nets_card`)

**`net-sessions`** (selection collection; REST read staff, create/update/delete staff, selectors write only through actions):

- `title` text, `date` text (`YYYY-MM-DD`, club time zone, same style as `selection-fixtures.localDate`), `startTime` text optional.
- `nets` number 1..12, `minutesPerTurn` number 1..30, `groupSize` number 2..8 (players per net per turn), defaults from `selection-settings` (`netsDefaultCount` 3, `netsDefaultMinutes` 10, `netsDefaultGroupSize` 4).
- `state` select `planned`, `running`, `paused`, `finished`.
- Timer state, stored so a reload or a second selector's phone agrees: `startedAt`, `pausedAt`, `pausedMs`, `offsetMs` (manual skip/back adjustments), `revision`. The client only derives from these and the server clock.
- `rotationPlan` json (code-only access): ordered groups with the round and net each is up in. `finishedAt`, `notes`, `createdBy`.

**`net-attendance`** (selection collection): `session`, `playerKey` text (`player:<id>` or `guest:<normalised name>`), `player` relationship nullable, `guestName` text (max 40) for people not on the club list, `checkedInAt`, `checkedInBy`. Unique index `(session, playerKey)`. Checking in is attendance; a no-show is a squad member expected but not checked in (derived).

**Fields added to `player-selection-profiles`:** `battingStyle` select (`right-hand`, `left-hand`), `bowlingStyle` select (`none`, `right-arm fast`, `right-arm medium`, `right-arm off-break`, `right-arm leg-break`, `left-arm fast`, `left-arm medium`, `left-arm orthodox`, `left-arm wrist spin`), both selection read/write; `staffNotes` textarea (max 1000) with field-level `read`/`update` admin and editor only (`isStaff`, a field helper added next to `isSelectionField` if missing **(verify)**). The existing `notes` stays "private to selectors".

### 4.3 Rotation and timer (pure first)

`lib/nets/rotation.ts`: `buildRotation({ players, nets, groupSize })` splits the checked-in players into balanced groups (ten players with a size of four become 4, 3 and 3), numbers them, and assigns group `j` to round `floor(j / nets)` and net `(j mod nets) + 1`; everyone else in that round is "waiting", the next round's groups are "up next". `addLatecomer(plan, player, currentRound)` places the player in the smallest group of a round after the current one (new group in the last round if all are full) and never changes a started or past round; `removeFromPlan` likewise. `lib/nets/timer.ts`: `timerView({ startedAt, pausedAt, pausedMs, offsetMs, minutes, rounds }, now)` returns `{ phase: 'not-started'|'running'|'paused'|'done', round, remainingMs, nextRound }`, computed from timestamps so no write is needed at each roll. Actions: start, pause, resume, next round now (adds the remaining time to `offsetMs`), previous round, finish, re-roll the remaining rounds (fair shuffle seeded by the session id, past rounds fixed). Each increments `revision`.

`components/nets/rotation-timer.tsx` is a client component: it renders from the server snapshot plus `Date.now()` corrected by the server clock returned with the snapshot, ticks with `requestAnimationFrame`/a 250 ms interval only while visible, polls `GET /selector/nets/[id]/state` (a no-store route handler, selection-guarded) every 15 seconds and after each action, and shows a large `role="timer"` countdown, **Up now** (net by net, names), **Up next**, who is waiting, and big Pause/Next/Back buttons. At a roll it vibrates (`navigator.vibrate`, feature-detected), plays one short tone through the Web Audio context created by the Start tap (mute remembered in `localStorage`, wrapped in try/catch) and announces the new round through a polite live region once. It asks for a screen wake lock while running (feature-detected, released on pause). All of it degrades to a plain countdown if an API is missing. No sound file, no third-party library, no network call.

### 4.4 Access matrix (REST + Local API)

| Resource | public | selector | editor | admin |
| --- | --- | --- | --- | --- |
| `net-sessions` | none | via actions and `lib/nets-queries.ts` (create, edit, start, pause, finish, delete own-created planned session) | REST read/write | REST read/write |
| `net-attendance` | none | via actions (check in/out, add guest) | REST read/write | REST read/write |
| `player-selection-profiles` style fields | none | read/write via actions | read/write | read/write |
| `staffNotes` | none | none (field read denied; the card hides the control) | read/write | read/write |
| `/selector/nets/[id]/state` | none (401) | yes | yes | yes |

Net attendance is never on a public page, never in the StatLab or history exports (a test greps the export column sets), and never exposed by a public query. Guest names are plain text, escaped on render, never linked to a person.

### 4.5 UI routes

- `/selector/nets`: upcoming and past sessions, **New session** with the defaults, attendance count per session.
- `/selector/nets/[id]`: three sections on one phone page: **Check in** (squad players first, search for anyone else on the club list, **Add a guest**, a big toggle row per player, a live count, no-shows listed), **Rotation** (the timer in 4.3, with Build rotation before the first start and Re-roll), **Summary** (who attended, the groups used).
- **Player card** `/selector/players/[slug]` becomes edit-in-place, one section per concern, each saving on its own button and showing a saved/failed message (no JavaScript required for the form): Cricket (role, can keep, batting style, bowling style), Contact and PIN (unchanged), Notes (selector notes; staff notes only when `isStaff`), and read-only panels for form (last five, unchanged), availability next month (unchanged) and **Nets**: "5 of 8 sessions in the last 8 weeks, last attended 3 Oct" plus a dot row per recent session with the word present or absent. The card never shows vote counts.

### 4.6 Card save path

`saveSelectorFields` in `lib/selector-profile-queries.ts` is extended with an allowlist validator (`lib/selection/card.ts`: role, styles from fixed lists, notes length, plain text) and a separate `saveStaffNotes` that first checks `isStaff(user)`; each action re-derives the user and ignores any tampered field. Unknown option values are rejected, not coerced.

### 4.7 Tests

Unit: `buildRotation` (balanced sizes, group-to-round-and-net mapping, fewer players than nets, one player, many rounds), `addLatecomer`/`removeFromPlan` (never touch past or current rounds), `timerView` (running, paused, between rounds, done, skip and back offsets, clock skew), settings clamps, card allowlist (styles, role, lengths), `netAttendanceSummary` (window, held vs attended, last date), nav constants.

Integration: create/start/pause/resume/next/finish a session as a selector; refused for anonymous; check-in is idempotent under parallel taps (unique `(session, playerKey)`); guest names escaped; two selectors read the same state after a pause (revision increments); the state route needs a selection session and sets `no-store`; selector cannot read or write `staffNotes` (REST and action), editor can; styles round-trip; net attendance appears on the card and in no public query, REST anonymous probe, StatLab/history export column set; merging two players repoints attendance without breaking uniqueness (earlier check-in kept) **(verify)**; `tests/admin-visibility.test.ts` classifies both new collections. A render test of `RotationTimer` with fake timers covers the roll, the pause and a missing Web Audio API.

### 4.8 Docs and seed

`docs/features/net-sessions.mdx` (check-in, the timer, what is stored, the honest limits: the timer is a convenience on one selector's phone, a closed browser tab can miss the tone, wake lock is not supported everywhere) and the player card edits in `match-day-overview.mdx`. Seed: two finished net sessions and one planned for tonight, attendance for about twelve demo players with a spread (one regular, one never), batting/bowling styles and roles on the demo roster, and a staff note on one demo player.

### 4.9 Acceptance (local)

Seed; sign in as the demo selector on a 360 px viewport; More > Nets > New session (3 nets, 10 minutes); check in eight players and a guest; Build rotation; Start; reload the page and see the timer resume; open the same session in a second window and pause there; skip to the next round; finish; open a player card and see the attendance line and edit role and styles; sign in as the demo editor and see the staff notes field; as the selector confirm it is absent and that a hand-posted `staffNotes` is ignored.

### 4.10 Risks

Rotation fairness is a policy (balanced groups and a fixed order, with a fair shuffle on request), not a promise of equal batting time; the doc says so. Timers on phones are throttled in background tabs; the design recomputes from timestamps on return and never trusts tick counts. Player merges must repoint the new relationships; the merge endpoint is checked and extended with tests.

## 5. Cross-cutting

**Files (new unless noted).** WP-0: edits to `lib/playhq/match-rows.ts`, `lib/playhq/scorecard.ts`, `lib/match-store/write.ts`, `lib/match-store/read.ts`, `lib/history-import/bundle.ts`, `payload/collections/MatchInnings.ts`; new fixture and two tests. WP-1: `payload/collections/BestPlayerBallots.ts`, edits to `payload/globals/SelectionSettings.ts`, `payload/collections/SelectionFixtures.ts`, `payload/admin/navigation.ts`, `lib/votes/{ballot,tally,chart,present,settings}.ts`, `lib/votes-queries.ts`, `app/(frontend)/availability/[token]/vote/[fixtureId]/page.tsx` + actions, `app/(frontend)/votes/{page,opengraph-image}`, selector pages and actions for votes, `app/(frontend)/selector/present/votes/page.tsx`, `components/votes/{race-chart,presenter,ballot-form,leaderboard-table}.tsx`, `app/api/admin/votes-export/route.ts`, sitemap and robots edits, seed, docs. WP-2: `payload/collections/{NetSessions,NetAttendance}.ts`, edits to `PlayerSelectionProfiles.ts`, `lib/nets/{rotation,timer,summary}.ts`, `lib/nets-queries.ts`, `lib/selection/card.ts`, selector pages and actions for nets and `more`, the state route, `components/nets/*`, `lib/selector-nav.ts`, seed, docs.

**Verification order.** Per WP: targeted unit file(s), `tsc --noEmit`, `pnpm generate` + `git add` of generated files, `pnpm check:generated`, `pnpm check:migrations`, eslint on changed files, targeted int files. Once at the end of the wave: full `pnpm test`, full `pnpm test:int` (one run), one `next build`.

**External decisions and credentials.** None. This wave adds no third-party service, key or env secret. Policy choices for the club (not blockers, all have safe defaults): who may vote (default: players in the game), the minimum ballots per game, whether the public leaderboard is ever switched on (default off), and whether committee members who are not admin or editor should see staff notes (they would need an editor account). Posting a leaderboard image to a social network is part of #21/#23 and would be built there as an env-gated seam, not here.

## Appendix A. Decisions worth challenging

1. **Staff notes.** The brief says "staff-only notes" and staff means admin or editor, which excludes selectors, while the existing `notes` is private to selectors. Default chosen: keep `notes` for selectors and add `staffNotes` for admin/editor. If the club wants one notes field, drop `staffNotes` and rename the existing helper text.
2. **Nominee source fallback.** Published team sheet first, stored match appearances second. Alternative: published sheets only, which is stricter but blocks voting for every game before the tool was used. Chosen: the fallback, documented.
3. **`minBallotsToCount` default 3.** Protects the secret ballot but means a game with two ballots does not count anywhere yet. Clubs with 4 voters should set it to 1 or 2; the selector view always shows the shortfall.
4. **Admin can read raw ballots.** Needed for support and disputes; REST is admin only and the doc says so. Alternative: no one can read them, which removes any audit.
5. **Vote settings in the selector area, not a new menu entry.** Keeps the committee menu at its cap; costs one more screen under More. Alternative: a new Advanced entry, rejected.
6. **Ordinal ties in WP-0 put played first.** Alternative is array order; played-first keeps the real third innings as ordinal 3. Either is stable; played-first reads better in the data.
7. **Timer state on the server.** Slightly more writes than a purely local timer, but a reload or a second phone agrees. Alternative: local only, rejected for the reload case.
8. **Presentation data in the page payload.** Simple and offline-tolerant; later steps are readable with developer tools by whoever holds the presenting laptop.

## Appendix B. Verify list (settle during implementation, in order)

1. `mapScorecard` behaviour on the new fixture and the two-day placeholders; the existing scorecard tests and `tests/matches-queries.test.ts` stay green after `isEmptyPeriod`.
2. Org and team ids in `game-summary-two-day.json` and the test context helpers, so the anonymised fixture reuses them.
3. How `lib/players/sync.ts` records a per-game write failure (counter, warning, admin notification) so the original bug would have been visible; add it to the run summary if it was only logged.
4. `payload/endpoints/mergePlayers.ts` and `lib/club-merge.ts`: which relations are repointed today (availability, squad members, team sheet slots) and extend to ballots, picks, attendance with collision handling.
5. When `selection-fixtures.status` becomes `final` (refresh path) and that the 14-day retention window plus `voteWindowDays` default of 7 leave no gap for the first week of voting.
6. A field-level `isStaffField` (or equivalent) in `payload/access`; array-field `access` on `picks` under Payload 3.90.2.
7. The exporter in `lib/stats/csv.ts` that shares `needsGuard` and the file-name prefix helper (`EXPORT_FILENAME_PREFIX`).
8. The path lists in `tests/no-brand-hex.test.ts`, `tests/selection-guards.test.ts`, `tests/selector-guards.test.ts` and `tests/staff-guard.test.ts`, and the `selectionCollections` assertions in `tests/admin-visibility.test.ts`.
9. `next.config` headers cover `/availability/:path*` (including the nested vote route) and `/selector/:path*` (including the state route); add a test.
10. The sitemap and robots helpers so `/votes` appears only while the switch is on.

## Appendix C. Risks

- **First sync after WP-0 rewrites every game.** Expected and bounded (2.9).
- **De-anonymising a ballot through small totals.** Mitigated by `minBallotsToCount`, totals-only public data and a snapshot test; residual risk with very small voter pools is stated in the doc.
- **Shared families and PINs.** Last-four-digit PINs are guessable inside a family and a player could vote as a relative; the doc repeats the availability limits and recommends manual 6-digit PINs when votes are used.
- **Chart legibility across clubs.** Five series from a gold-and-grey palette depend on markers, dashes and labels rather than colour; a theme with very similar tokens still reads correctly.
- **Settings drift.** Changing `ballotValues` or `tieBreaks` re-tallies history; the settings screen warns and the export records the values used.
- **Timer reliability on phones.** Background throttling and no wake lock on some browsers; recompute from timestamps and say so.
- **Selector bottom bar.** A fifth tab at 360 px must keep 44 px targets; checked by a layout test.
- **Scope creep.** Deferred and recorded as follow-ups under #38: player self check-in to nets via a QR, hiding the latest N rounds from the public board until awards night, voting for umpires and coaches, form-trend scoring on the card, public player styles.
