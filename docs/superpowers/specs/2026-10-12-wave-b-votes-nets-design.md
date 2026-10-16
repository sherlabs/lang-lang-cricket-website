# Wave B: innings save fix, best-player votes, net sessions and the editable player card (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #18 (best-player votes), #19 (net sessions), the remaining part of #20 (editable player card). Plus one bug found by the nightly sync (WP-0). Out of scope: the post designer (#21), scheduled posting (#23), the fantasy competition (#36), anything that needs a new external service.

| WP | Issues | One line |
| --- | --- | --- |
| WP-0 Innings save bug | bug, no issue | Two PlayHQ periods with the same `sequenceNo` made the whole game fail to save. Identify innings by PlayHQ period id and derive our own ordinal. |
| WP-1 Best-player votes | #18 | 3-2-1 ballots through the availability link and PIN, a season leaderboard with a race chart, a public page the committee can switch on (only for games whose voting has closed), and a minimal presentation mode for awards night. |
| WP-2 Net sessions and the player card | #19, #20 (rest) | Check-in, a rotation timer that survives a reload, stored attendance ("turned up at nets", not a rating), and a player card the selectors can edit (role, styles, notes) that shows net attendance. |

Build order is WP-0, WP-1, WP-2. WP-0 is independent and ships first because it is a data-loss bug. WP-1 and WP-2 each get one migration and one feature doc set.

Product goal (applies everywhere): this repository is reused for other clubs. Colours, crest, fonts, names, copy, hosts, cookie names come from the `theme`/`club` globals or env (`config/site.ts`), never from code. Tailwind `brand-*` tokens only, no hex literals, no "Lang Lang" strings outside `config/site.ts` and seed defaults. `tests/no-brand-hex.test.ts` and the club-name guard stay green, and their path lists are extended to the new files (section 1).

## 0. Findings that shape the design

Checked against this branch; the few items still to settle during implementation are in Appendix B.

1. **The bug (read from the local fixture, names not reproduced here).** Game `8360989d-...` (2024/25 District, 2024-10-26) has four periods: ordinal 1 and 2 first innings, then two periods that both say `sequenceNo: 3` / `SECOND_INNINGS`. One (`725fa424`) has both sides present but zero appearances and zero statistics; the other (`2d6a7ea9`) has 11 batters, 6 bowlers and 8 wickets. `mapMatchBundle` (`lib/playhq/match-rows.ts`) copies `p.sequenceNo` straight into `InningsRow.sequenceNo`; `match_innings` has a unique index on `(match, sequenceNo)`; so the batch insert in `writeBundle` (`lib/match-store/write.ts`) violates it and the whole game transaction fails. Nothing else in the store depends on the absolute number: `facts.ts`, `queries.ts` and `aggregate.ts` only match `inningsSeq === sequenceNo` or sort by it. `writeBundle` re-keys children by the inserted `sequenceNo`, which stays correct once the numbers are unique.
2. **Placeholders already exist.** The two-day fixture (`tests/fixtures/playhq/game-summary-two-day.json`) has placeholder third and fourth innings with 0 and 12 appearances and no stats; they are stored today with `played = false` through `isInningsPlayed`. A fully empty period is the same case with fewer rows, so "store, `played = false`, no children" is the existing convention, not a new one.
3. **One mapper feeds every writer.** `mapMatchBundle` is called by `lib/players/sync.ts` (the nightly `/api/cron/players-sync`), `payload/scripts/backfill-matches.ts` and `payload/scripts/fixtures/match-seed-db.ts`. The history import builds rows by hand in `lib/history-import/bundle.ts` (sequence 1 and 2, no period ids). The public scorecard `mapScorecard` (`lib/playhq/scorecard.ts`) also sorts by `sequenceNo` and would show the empty period as a ghost innings.
4. **Votes need the same identification as availability.** `lib/availability-public.ts` already has `resolveLink`, `rememberedPlayer`, `identify` (name, PIN or one-time code, throttled), the `_avail` cookie and `lib/throttle.ts` (`hit`, `isLocked`, `clear`, atomic upsert on `throttle_hits`). Votes reuse all of it and add no second login.
5. **Eligible voters and nominees come from sheets, not guesses.** `team-sheets.publishedSnapshot` holds the published XI for a `selection-fixtures` row; `matches` + `match_appearances` hold who actually played once PlayHQ has the scorecard. Many games will have no published sheet (the tool is new), so the nominee source has a documented fallback (section 3.4).
6. **Ballots are anonymous at normal club sizes, not guaranteed for small pools.** Totals can leak picks when the pool is small: with 3 ballots a nominee on 9 points was picked first by all three voters, and a public board that moves while a window is open, or that shows per-game results, lets anyone difference the board between views. The design therefore (a) counts a game only when it has at least `minBallotsToCount` ballots, default 5 (3.2), (b) shows public and presenter data only for games whose vote window has closed (3.3), and (c) never shows per-game winners or per-game points to the public or in the presenter, only cumulative totals by round (3.8, 3.9). No individual (voter, picks) pair can be read by anyone over REST (3.5). The docs say "anonymous at normal club sizes, not guaranteed for small pools" and never "secret ballot".
7. **#20 is mostly shipped.** The match-day overview, role (stored or guessed), `canKeep`, private `notes`, last-five form and next-month availability are on the card (`docs/features/match-day-overview.mdx`, `lib/selector-profile-queries.ts`, `components/selector/player-forms.tsx`). What remains: batting/bowling style, net attendance, staff-only notes (a visibility tick on the existing notes, Appendix A.1), and making the card edit-in-place.
8. **GraphQL is disabled** (`graphQL: { disable: true }`), so every "REST + GraphQL" row below means REST and the Local API. Public pages read through `lib/*-queries.ts`, which state their own visibility filter because the Local API ignores access rules.
9. **The selector bottom bar already has four tabs** (`lib/selector-nav.ts`: Overview, Availability, Squads, Teams; the account page and the link page are reached from the Overview and the top bar). Section 4.1 keeps four tabs: Votes is reached from the Overview and Nets sits inside the Availability section, so nothing hides everyday tasks behind a "More" tab.
10. **The committee menu is at its cap.** No new collection or global gets an entry in `everydayNav` or `advancedNav`. New collections are selection collections (hidden for every role), vote options are fields on the existing `selection-settings` global, and the work happens in the selector area. Because editors are the committee and a non-technical admin will not look for a selector area, the Overview (and the existing selector link in the admin) gets one Votes link; the committee menu count is unchanged (4.1).

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit paths with `git add`, never `git add -A`, never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`: `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); verify hosts are `127.0.0.1` before any DB work; no Blob token; no remote DB; no Vercel CLI. No live external calls: anything that could reach PlayHQ runs with `PLAYHQ_CLIENT_ID=` empty and tests use fixtures. Facebook, email providers, the AI gateway and social networks are mocked in tests and env-gated. **This wave introduces no new external call.** Dev server ports for this wave are 4000-4099 (the brief overrides the 3400-3499 in `CLAUDE.md`; `CLAUDE.md` is not edited).

**Migrations.** `wp_0_innings_period_id`, `wp_1_votes`, `wp_2_nets_card`, each created with `pnpm payload migrate:create <name>`, schema-qualified (`"payload"."..."`), `.ts` and `.json` committed. After each: `pnpm generate`, `git add payload-types.ts "app/(payload)/admin/importMap.js"`, then `pnpm check:migrations` and `pnpm check:generated` pass. Dev DB reset is `DROP SCHEMA payload CASCADE` via node + pg (push hangs without a TTY), then `pnpm payload migrate`.

**Admin classification.** Every new collection is added to `selectionCollections` in `payload/admin/navigation.ts` (hidden for every role, absent from both menus; REST access as stated per table, with `read` and `write` staff only like the other selection collections, and nobody for ballots). `admin.hidden` does not block direct URLs, so ballots also set `admin.hidden` plus a `read: nobody` access rule so the document view cannot load and `tests/admin-visibility.test.ts` already enforces that list both ways. No new global: vote and nets options are fields on `selection-settings` (Advanced, admin only). Because editors are the committee and must be able to switch the public leaderboard, **vote settings are edited in the selector area by a staff-guarded server action** (`isStaff`: admin or editor; selectors cannot), the same seam by which link rotation writes the admin-only global today (`lib/selector-availability-queries.ts`). The REST `update` on the global stays `isAdmin`, so widening nothing.

**Staff means staff.** `isStaff` is admin or editor only; selectors are a separate role (`isSelection` = admin, editor, selector). New code never writes `Boolean(user)` or `!req.user` as an access check; `tests/staff-guard.test.ts` keeps enforcing it.

**Personal data.** Ballots, picks, attendance, phones and notes are never public over REST or the Local API as used by pages. Field-level `access.read`/`update` is set explicitly on every sensitive field (`hidden` alone does not stop a REST `where` probe). CSV exports are admin-only and formula-injection safe (the exporter shares `needsGuard` from `lib/stats/csv.ts`).

**Server actions are public POSTs.** Each one re-derives who is calling (`requireSelection()` / `isStaff` / the signed availability cookie), validates with a pure function and derives `source`, `setBy` and `castBy` from the session, never from form fields.

**Mobile first and accessible.** 360 px first, 44 px tap targets, no hover-only controls, no colour-only meaning, visible focus, `prefers-reduced-motion` respected, the timer is `role="timer"` and is not announced every second.

**Guard scope.** The brand-hex and club-name guards, `tests/selection-guards.test.ts`, `tests/selector-guards.test.ts` and `tests/staff-guard.test.ts` scan new paths: `app/(frontend)/votes/**`, `app/(frontend)/availability/**` (already), `app/(frontend)/selector/**` (already), `lib/votes/**`, `lib/nets/**`, `lib/votes-queries.ts`, `lib/nets-queries.ts`, `components/votes/**`, `components/nets/**`. The club-name guard test (`tests/no-brand-hex.test.ts` and its name sibling) gets these paths added in WP-1, as part of its path list, not as a follow-up.

**Club vocabulary.** The "Best player" label (some clubs say "player of the match"), the page title, the presenter heading and any share text come from the club glossary or config (`config/site.ts` copy defaults, overridable in the `club` global), never from literals in code. Weekdays and dates are derived from the local date in the club time zone (`lib/selection/weekend.ts` helpers), never typed (no "vote by Sunday" literal). The `_avail` cookie name already comes from config (`availCookieName` in `lib/availability-link.ts` builds it from `COOKIE_PREFIX`); WP-1 adds a test asserting the vote flow uses that function and no literal cookie name.

**Docs.** New: `docs/features/best-player-votes.mdx`, `docs/features/net-sessions.mdx`. Updated: `match-day-overview.mdx` (player card), `match-data-store.mdx` (WP-0), `availability-link.mdx` (the vote section), `selector-accounts.mdx` (Votes link and the Nets sub-nav), and `docs/features/index.mdx`. `tests/feature-docs.test.ts` forces the shape; `collections` and `related` must name real slugs. Docs are written when each WP lands and describe only what is built.

**Efficiency.** Iterate with targeted checks (`tsc --noEmit`, `pnpm generate`, one vitest file, eslint on changed files). Run the full vitest suite once and `next build` once, in the final verify step, never two vitest runs at once.

## 2. WP-0: innings save bug (duplicate PlayHQ period sequence numbers)

### 2.1 Decisions

1. **Identity is the PlayHQ period id.** `InningsRow` gains `periodId: string | null` (null for imported games) and `playhqSequenceNo: number | null`.
2. **Our `sequenceNo` becomes a derived ordinal 1..n.** Periods are ranked by `(playhqSequenceNo, played first, periodId)`. A played period outranks an unplayed one with the same PlayHQ number, so the real third innings keeps ordinal 3 and the empty twin gets 4. The final tie-break is the period id (not array position), so the order, and therefore `sourceHash`, does not flap if PlayHQ reorders the array. For every game that has unique, contiguous numbers today the result is identical to now.
3. **Empty periods are stored, not skipped.** A period with both sides present but no appearances, no statistics, no fall of wickets and no shared events becomes an innings row with `played = false`, zero totals, no `hasFallOfWickets/hasBowlingData/hasBallData`, and no child rows. This is exactly the placeholder convention, so `isInningsPlayed` and the season reconciliation need no change: the aggregates ignore unplayed innings and `reconcileMatchStore` compares per (player, team, season) counts which the empty period cannot move. A period with neither a batting nor a bowling team is still skipped (existing behaviour).
4. **A warning, not a failure.** Two periods sharing a PlayHQ number emit `duplicate_sequence:<n>` in `warnings` (already surfaced by the sync summary); unknown shapes never throw.
5. **Defence in depth, required.** A pure `assertUniqueInnings(bundle)` (duplicate `sequenceNo` or `periodId` throws an error naming the game) runs **before** the transaction opens, in `upsertMatchBundle` and the import path, so a failure never rolls back a half-written game. It is a per-game failure: `lib/players/sync.ts` already counts a failed write in `matchError`, logs it and adds the pair to `skipPairs` (verified), and the sync summary must report the game id and message (not only the count); a test asserts a hand-built duplicate bundle increments `matchError`, names the game, and does not abort the other games.
6. **`MAPPER_VERSION` goes 1 to 2.** The hash includes the version, so the sync rewrites every stored game once (children are replaced wholesale). `lib/players/sync.ts` already bounds a run with `COLLECT_BUDGET_MS` and `WRITE_BUDGET_MS`: past the budget the remaining matches are deferred and stored by the next night (`matchesDeferred`), so a large history is rewritten over several nights and the cron does not time out. WP-0 adds no new batch limit; a test proves the deferral path still reports the deferred count with the bumped version. A second full sync of an unchanged game must return `unchanged` after the bump (test, 2.6). No manual backfill is needed; the dev copy can use `payload/scripts/backfill-matches.ts` with `PLAYHQ_CLIENT_ID=` and a fixture-backed client only for local checks.

### 2.2 Data model and migration `wp_0_innings_period_id`

`match_innings` gains `period_id` varchar (nullable) and `playhq_sequence_no` integer (nullable). New unique index `match_innings_match_period_idx` on `(match_id, period_id)` (Postgres allows many NULLs, so imported rows are fine). The existing `(match, sequenceNo)` unique index stays. `payload/collections/MatchInnings.ts`, `lib/match-store/read.ts` (select + map the two columns) and `lib/history-import/bundle.ts` (set both to null) change with it. Existing rows keep NULLs until the next sync rewrites them.

### 2.3 Mapper change (shape)

`mapMatchBundle` does two passes: pass 1 maps each period to an intermediate record (innings row, its batting/bowling/fielding rows keyed by `periodId`); pass 2 ranks the records, assigns `sequenceNo`, and writes `inningsSeq` on the child rows from the assigned ordinal. Ordering always uses each game's own period ids and PlayHQ numbers, never another game's. A small pure `isEmptyPeriod(period)` is exported and shared with `mapScorecard`: a period is empty only when it has **no appearances at all** (and no statistics, fall of wickets or events). `mapScorecard` then drops empty periods from the public scorecard. The placeholders in the two-day fixture have 12 did-not-bat appearances, are therefore non-empty and stay unchanged; that regression test is kept and pins both cases.

### 2.4 Access, routes, admin

No access, route or admin-navigation change. `match-innings` stays an `internalCollections` entry (hidden, never writable over REST).

### 2.5 Anonymised fixture

The raw summary contains real names and is never committed. A throw-away script in the scratchpad (not in the repo) reads it and writes `tests/fixtures/playhq/game-summary-duplicate-sequence.json`: deterministic fake names (`Home Player 01`.., `Away Player 01`..), fake UUIDs derived by hashing the originals with a fixed salt (relationships between appearances, teams and periods preserved), the club org and team ids replaced by those used by `game-summary-two-day.json` so the existing test context helper (`tests/match-facts-helpers.ts`, `tests/int/match-helpers.ts`) applies (Appendix B.2), fake venue and grade names, and dates kept. A guard test asserts every name in the fixture matches the fake pattern, so a raw name can never be committed by mistake. The script and the raw file are not added.

### 2.6 Tests

Unit (`tests/match-rows-duplicate-sequence.test.ts`): four innings, `sequenceNo` exactly 1..4, `periodId`s unique, `played` is true, true, true, false; the played third period has 11 batting rows and its children point at ordinal 3; the empty period has no children; `duplicate_sequence:3` warning present; `sourceHash` identical when the periods array is reversed; `MAPPER_VERSION` is 2; `assertUniqueInnings` throws on a hand-built duplicate and runs before any transaction (nothing written for that game); the two-day placeholders (12 did-not-bat appearances) are not empty; `mapScorecard` over the fixture shows three innings (no ghost) and the two-day fixture still shows its placeholders; the name guard on the fixture.
Integration (`tests/int/match-store-duplicate-sequence.int.test.ts`): `upsertMatchBundle` returns `created`, the rows are 4 innings with 11 batting rows on ordinal 3, a second full sync of the unchanged game is `unchanged` after the version bump, `reconcileMatchStore` for the pair has zero mismatches and the pair is not in `skipPairs`. Extend `tests/int/match-sync.int.test.ts` (it already runs the sync against fixtures) with this game, proving the nightly path through `lib/players/sync.ts` saves it and the summary counts it as upserted, not failed. History import and `match-seed-db` suites stay green unchanged.

### 2.7 Docs and seed

`docs/features/match-data-store.mdx`: one paragraph (innings are keyed by PlayHQ period id, empty periods are stored as not played). No seed change (the fixture is test-only; the demo match seed uses its own deterministic data).

### 2.8 Acceptance (local)

`pnpm vitest run tests/match-rows-duplicate-sequence.test.ts`; then the int test against `langlang_test`; then, on the dev DB, run the sync summary path with `PLAYHQ_CLIENT_ID=` and the fixture client and read back `select sequence_no, period_id, played from payload.match_innings` for the game.

### 2.9 Risks

The rewrite of every game on the first sync after deploy. Mitigation: it is the same path as every previous mapper bump, the write is per game in its own transaction and the existing write budget spreads it over nights. Ordinal renumbering for games with non-contiguous PlayHQ numbers changes nothing observable because consumers key on id or relative order. An unlisted second source of duplicates (a duplicate `periodId`) is caught by `assertUniqueInnings` before the transaction opens.

## 3. WP-1: best-player votes (#18)

### 3.1 Overview

After a game, players cast a 3-2-1 ballot for the best players of that game, from the same no-login availability link and PIN. Selectors see participation (not picks) and the tally privately. The committee can switch a public leaderboard on; it only counts games whose vote window has closed. Awards night uses a small presentation mode that reveals cumulative totals one closed round at a time. Everything is off until `votesEnabled`.

### 3.2 Settings (fields on `selection-settings`, migration `wp_1_votes`)

A "Best player votes" group, all with `admin.description` plain-English helper text. The label "Best player" comes from the club glossary (see section 1).

- `votesEnabled` checkbox, default false. Off hides every vote surface (availability section, selector links/cards, public page returns 404). The settings screen shows a visible warning when `votesEnabled` is on (and again at the moment it is switched on) while any voter would use a default last-4 PIN: "N players still use a last-4 PIN; a family member could vote as them. Set a manual 6-digit PIN or accept the risk." The count comes from the same profile data the PIN reset flow uses.
- `allowSelfVote` checkbox, default false. Voters are always the players in that game (the `squad_members` rule is dropped until a club asks for it).
- `ballotValues` text, default `3,2,1`. A pure `parseBallotValues` accepts 1 to 5 positive integers in strictly descending order (for example `5,3,1` or `2,1`); the same function is the field `validate`, so the admin form, the action and the tally agree.
- Tie-break: one fixed order, **countback** (most top-value votes, then the next, and so on) and then **shared** (equal ranks are shown as shared, ordered by surname only for display). One toggle, `tieBreakFewestGames`, default **off**: when on, the same points in fewer games ranks higher after countback. It is opt-in because it rewards sparse voting as much as skill (see 3.8). `tieBreaks` as an ordered array is not built.
- `voteWindowDays` number, default 7: ballots open when the fixture is final and close at the end of the local day that is this many days after the game date. The window is a pure function of the date and this setting (3.3), nothing writes the close to the row.
- `editWindowHours` number, default 24: a voter may change their ballot until `min(first cast + hours, window close)`.
- `minBallotsToCount` number, default **5** (clamped to at least 3): a game counts in any displayed total only when it has at least this many ballots. Guidance on the settings screen: roughly 40% of the eligible voters of a typical game (the screen shows the average voters per recent game and the resulting suggestion). A small pool lowers the privacy protection; the screen says so.
- `publicLeaderboard` checkbox, default false; `publicScope` select `club`, `grade`, `both` (default `club`); `publicShowBreakdown` checkbox default true (the 3s/2s/1s columns).
- The public and presenter data only ever include games whose vote window has **closed** (3.3); there is no `publicHoldRounds` setting, "closed only" is the rule.
- Net defaults are constants in `lib/nets/constants.ts`, not settings (4.2).

`getSelectionSettings` (`lib/selection/store.ts`) returns the parsed, defaulted values; a pure `settingsFrom(raw)` clamps bad input so a corrupt row can never crash a page.

### 3.3 Data model

**`best-player-ballots`** (selection collection). **`read`, `create`, `update`, `delete` are all `nobody` over REST for every role including admin**, on the collection and on `picks`, and `admin.hidden` is set; because `admin.hidden` does not block a direct document URL, the `read: nobody` rule is what stops the admin UI document view. Code writes and counts with the Local API after its own checks. The admin gets an **audit action** instead of raw reads: an admin-only Local API function (`auditVoters(fixtureId)`, in `lib/votes-queries.ts`, guarded by `isAdmin`) that returns "voter X has voted (cast time, source `voter`/`selector`)" and never selects `picks`. Each call writes a log line (who, which fixture). A dispute is settled by an admin action that deletes one voter's ballot for a fixture (so they can vote again inside the window), also without reading picks.

- `fixture` relationship to `selection-fixtures`, required, indexed.
- `voterKey` text, required: `player:<id>` for a player voting through the link, `selector:<userId>` for a ballot a selector enters (phone calls, coaches, umpires).
- `voter` relationship to `players`, nullable (set only for `player:` keys).
- `picks` array, required, each `{ place: number (1-5), player: relationship to players }`; field-level `read`/`update` `nobody`. Places must be 1..k with k = number of ballot values (fewer only when fewer eligible nominees exist), players distinct.
- `source` select (`voter`, `selector`), `castBy` user (selector entries only), `castAt`, `editedAt`, `revision`; all derived by actions, never from form fields. Staff see a `selector` ballot in the participation list as "entered by selector" (with the cast time), never with its picks.
- Unique index `(fixture, voterKey)`: one ballot per voter per game.
- Only the **place** of each pick is stored. Points are computed from the current `ballotValues`, so a settings change re-tallies consistently. The public page and the CSV print the values used ("3-2-1"); the doc warns that changing ballot values mid-season changes all totals.

**Fields added to `selection-fixtures`.** `votesState` select `auto` (default), `open`, `closed`; `countsForAwards` checkbox default true. This collection has `update: nobody` over REST, and these two fields are written **only by code** (Local API from the staff actions below). `auto` means "computed": a pure `voteStatus(fixture, settings, now)` returns open or closed from the fixture status, the game date and `voteWindowDays`; no cron or hook ever writes the close to the row. A selector can close a game early, reopen it, or exclude it (for example a washed-out game) from the selector area, which only changes `votesState`/`countsForAwards`.

**Rounds.** A round is the club weekend of a game (`lib/selection/weekend.ts` computes it from the local date), so club and per-grade views share one axis. A round is **public-eligible** only when every game in it that would count has a closed window.

**Counted game** = fixture final, `countsForAwards`, season matches the scope, ballots at least `minBallotsToCount`. A counted game is **public-eligible** only when its window is closed. Selector views list uncounted games with "2 of 5 ballots needed to count", and include open games (with a banner that totals are private until the window closes).

### 3.4 Who may vote and who may be nominated

- **Nominees** are the club's players in the game: the fixture's published `team-sheets.publishedSnapshot` slots with a `player` (guests excluded). If there is no published sheet, fall back to the stored match: club-side `match_appearances` with a resolved `player` for the fixture's `gameId`. If neither exists the game has no player ballots. Hidden players are never nominees.
- **Voters** are the same set. A player cannot vote for themselves unless `allowSelfVote`. Selectors/staff can enter a ballot as `selector:<id>`, one per selector per game.
- Pure `lib/votes/ballot.ts`: `nomineesFor`, `canVote`, `validateBallot(picks, nominees, values, voterPlayerId, allowSelf)`, `editWindowOpen(fixture, ballot, settings, now)`. All unit-tested.

### 3.5 Access matrix (REST + Local API; GraphQL disabled)

| Resource | public (anonymous) | availability-link voter | selector | editor | admin |
| --- | --- | --- | --- | --- | --- |
| `best-player-ballots` rows and `picks` | none | none over REST; own ballot only through the link flow | none | none | none over REST and in the admin UI; `auditVoters` (who voted, no picks) and delete-one-ballot by code |
| ballot cast/replace | no | server action `castBallotAction` (cookie player, within window, own `voterKey` only) | `selectorBallotAction` (own `selector:` key; cannot read others, or its own after saving, beyond "entered") | same as selector | same |
| participation (who has voted, `source`, not for whom) | no | no | yes, via `lib/votes-queries.ts` | yes | yes |
| private leaderboard (counted games, window open or closed, clearly labelled) | no | no | yes | yes | yes |
| public leaderboard (closed windows only) | only if `publicLeaderboard` and scope allowed | same | same | same | same |
| `selection-fixtures.votesState/countsForAwards` | read none | none | change via action | change via action | change via action |
| vote settings fields | none | none | read | change via staff action | change via admin form or action |
| votes CSV export | no | no | no | no | yes (`/api/admin/votes-export`) |

Selector pages never receive a (voter, picks) pair, and nobody does anywhere else: there is no support read of raw ballots. Totals are computed in code from the Local API inside `lib/votes-queries.ts`. The export contains season totals per player (points, counts per place, ballots, games, the ballot values used), never individual ballots. Public vote data goes through one query file whose public functions first check `votesEnabled && publicLeaderboard` and the scope, filter hidden players, keep only public-eligible games (3.3), apply `minBallotsToCount`, and return only cumulative totals.

### 3.6 Throttling, impersonation and enumeration

**Throttle.** Casting reuses identification (the cookie from `identify`); there is no new login. Writes and failed identifications call `hit()` (`lib/throttle.ts`) on three keys: `votes:player:<id>` (20 per hour), `votes:link:<token hash>` (a generous per-link cap, because a clubhouse shares one link), and `votes:ip:<hash of clientIp(headers)>` (`lib/client-ip.ts`, as `selector-oauth` does; shared Wi-Fi is the reason the cap is generous, not strict). A locked key returns the same uniform message as availability. The cookie player id is the only identity used: a form-tampered `voterKey` or `playerId` is ignored. Rotating the link kills cookies as today; ballots stay. Stuffing is bounded by the unique `(fixture, voterKey)` index plus the eligibility check. A concurrency test casts 10 parallel ballots for one voter and expects exactly one row.

**Impersonation.** A last-4 PIN lets one family member vote as another. Mitigations, built and not merely listed: the visible warning on the votes settings screen (3.2), the PIN-strength count shown next to it, and the `source`/"entered by selector" display so a selector's phone-in ballot is distinguishable from a voter's own. The doc recommends manual 6-digit PINs when votes are used.

**Enumeration.** The vote page `/availability/[token]/vote/[fixtureId]` and the ballot action check identity **before any fixture lookup**: resolve the link, then the cookie player, and only then load the fixture and eligibility. Every failure (wrong link, no or expired cookie, votes disabled, unknown fixture, ineligible player, closed game, open game for another grade) goes through one function that renders the same plain not-found response with the same status, headers and body, and runs the same number of queries (a failed identity path runs the fixture lookup against a dummy id) so timing does not separate the cases. An unidentified request never learns which fixtures exist or are open. The selector route `/selector/nets/[id]/state` returns 404 (not 401) to anonymous callers so it does not confirm the route exists. One test fetches the vote page for each failure case and asserts status, headers (minus per-request ones) and body bytes are identical; timing is design intent (same work), not asserted.

### 3.7 UI routes

- **Availability link (public, token in URL, `no-store` and `no-referrer` via `next.config` for `/availability/:path*`):** when `votesEnabled`, `/availability/[token]` shows a "Vote for best player" card (label from the glossary) for each open game the identified player is eligible for ("Round 5 vs {opponent}, vote by {weekday and date}"; the weekday is derived from the local date and club time zone, never typed). `/availability/[token]/vote/[fixtureId]` is the ballot page: one native `<select>` per place (labelled "3 votes", "2 votes", "1 vote" from `ballotValues`) listing nominees. **The form works with plain `<select>` and no JavaScript** (a normal POST with the server action's progressive-enhancement path, like the card form); any enhancement is optional. After saving: an edit link while the edit window is open, then a read-only "Your vote is in".
- **Selector area:** `/selector/votes` is reached from a Votes link/tile on the Overview (the job tiles already show "games needing votes"), not from a new tab (4.1). It holds games needing votes with "7 of 12 voted" and a Chase list with a "Copy a reminder text" that reuses the availability link; open, close and exclude buttons; the private leaderboard with scope tabs (club or grade); the CSV button for admins. `/selector/votes/[fixtureId]` enters a ballot on behalf of someone, replacing without revealing the existing one. `/selector/votes/settings` (staff only, plain-English form for 3.2, with the PIN warning).
- **Committee discoverability.** Editors are the committee and will not look in the selector area. The existing admin dashboard/selector link and the Overview card carry one "Best player votes" link to `/selector/votes`; no new menu entry is added, so the committee menu count is unchanged.
- **Presentation mode:** `/selector/present/votes?scope=club|<gradeId>&season=` lives outside the `(area)` layout (no tab bar), still guarded by `requireSelection()`. See 3.9.
- **Public:** `/votes` (and `?grade=`, `?season=`) renders only when the switch is on and the scope is allowed, else a plain 404; it is added to the stats navigation family (`components/site-nav.tsx` `STATS_FAMILY`), to the sitemap and not disallowed in robots only while on. It shows: the ballot values used ("Points: 3-2-1"), the games count per row, a line "N games not yet counted" (games below the minimum or whose window is still open, without saying which), and cumulative totals by round for closed rounds only. No per-game winners or per-game points anywhere. The themed share image is deferred (follow-up under #38).

### 3.8 Leaderboard, movement and the race chart

Pure `lib/votes/tally.ts`: input `{ ballots (place, player, fixture), fixtures (round, grade, counted, publicEligible), values, tieBreakFewestGames, appearances per player }`; the tally uses the **stored places with the current `ballotValues`**. Output ranked rows `{ player, points, counts[place], ballots, games, rank, shared, movement }` plus `uncountedGames`. `games` is the number of counted games the player was a nominee in, and is shown on every row (public, private, CSV), so a low-games row is visibly different. Movement is previous rank minus current rank, where the previous ranking is the same computation over all rounds before the scope's last public-eligible round (up, down, new, unchanged; arrow plus text). Tie-breaks: countback, then fewest-games when the toggle is on, then shared.

Honest limit: games under the minimum drop out of totals, so players from sparsely voted games are under-ranked. That is why the page says "N games not yet counted" and shows games per row, and why `fewest_games` is opt-in.

Pure `lib/votes/chart.ts` picks the top five (ties at fifth place included up to six) and builds **cumulative series by closed round only**; the data has no per-round or per-game points field (the previous `roundPoints[]` is removed). The cumulative series for a round is published only once every counted game in that round has a closed window. `components/votes/race-chart.tsx` is a server-rendered inline SVG like `components/stats/progression-chart.tsx`: x is rounds, y is cumulative points, one polyline per player. **Colour never carries the meaning**: each series has a distinct dash pattern and marker shape (circle, square, triangle, diamond, cross), a direct end-of-line label with the name and points, and `<title>`/`<desc>` plus a `<details>` table of the numbers. Strokes use classes `stroke-brand-*` cycling a fixed list of five tokens; a unit test asserts no hex literals and that the five tokens differ. The chart scrolls sideways inside its container rather than shrinking at 360 px.

### 3.9 Presentation mode (minimal)

A client component `components/votes/presenter.tsx` fed one server-computed snapshot of public-eligible data only: rounds in order, the cumulative leaderboard after each closed round, the final top five. **No per-game vote winners and no per-game points.** No refetching. A pure `buildRevealSteps(snapshot)` builds: title; for each closed round, a round header and the leaderboard after that round with movement; then the final top five counted down from fifth to first, then the winner. Controls: **next** and **back** (Right/Space and Left keys and 44 px on-screen buttons), **fullscreen** (`F` and a button, Fullscreen API on a user gesture, feature-detected), and **reload resume** (the current step in `sessionStorage`, wrapped in try/catch, falling back to the first step). Not built: `R`, `?` help overlay, Home/End, `#step=` hash. `aria-live="polite"` announces each step's heading; `prefers-reduced-motion` turns movement into an instant change. Sizing uses viewport units with a readable minimum for a projector. The snapshot contains cumulative totals only, never ballots; later steps are readable with developer tools on the presenting laptop, which is acceptable behind a selector login and stated in the doc (the reveal is theatre, not secrecy).

### 3.10 Tests

Unit: `parseBallotValues` (valid, ascending rejected, six values rejected, non-integers), `validateBallot` (duplicate player, self-vote, non-nominee, missing places, fewer nominees than places), `nomineesFor` (published sheet, fallback to appearances, guests and hidden excluded), `editWindowOpen` (inside, boundary, after window close wins), `voteStatus` (auto open/closed from date and `voteWindowDays` with no stored write, `open`/`closed` overrides, time zone boundary), `tally` (points with custom values from stored places, countback, fewest-games toggle off/on, shared ranks, `minBallotsToCount` hiding a game, a game excluded by `countsForAwards`, movement incl. new entrant, grade scope, games per row, `uncountedGames`), **public-eligibility** (a game with an open window contributes nothing to any public total, presenter snapshot or chart; the public board output is identical before and after a ballot is cast in an open game: the differencing test), `chart` (top five with ties, cumulative series by closed round, no per-round points field), `buildRevealSteps` (length, order, last step, no per-game step), settings clamping (`minBallotsToCount` floor 3), PIN-warning count, export cell guard (a player named `=HYPERLINK(...)` is neutralised), distinct-token assertion for the chart, labels from glossary/config (no literal "Best player" in code), weekday derived from local date.

Integration (`tests/int/votes-*.int.test.ts`): cast through the real identify flow (name + PIN, cookie) and edit inside the window, refuse after it; one ballot per voter per game under 10 parallel casts; ineligible player, self-vote and non-nominee refused with the uniform message; throttle lock on the player, link and IP keys and the global pause; closed/excluded games; **enumeration**: the vote page responses for wrong link, no cookie, votes disabled, unknown fixture, ineligible player and closed game are byte-identical in status, headers and body, and an anonymous request runs no fixture lookup before identity (spy); **security**: anonymous, selector, editor **and admin** REST `find`/`count`/`where` probes on `best-player-ballots` return nothing or 403, including `where[picks.player]` and `where[voterKey]`, and the admin document URL does not render a ballot; `auditVoters` returns voter and source without picks and is refused for editor/selector; no Local API page query, selector page query, public query, CSV export or presentation snapshot contains a (voter, picks) pair (snapshot test over the JSON); a `selector:` ballot shows as "entered by selector" without picks; `/votes` is 404 when `publicLeaderboard` is off and when `votesEnabled` is off, and when on contains only totals of closed games, the values used and "N games not yet counted"; hidden players absent from the public board; a game below `minBallotsToCount` contributes nothing to any displayed total but shows in the selector participation list; only staff can change settings or game state (selector and anonymous refused, tampered form fields ignored); admin-only CSV; the player merge cases in 5.1; the availability page and vote page keep `no-store` and `no-referrer`; the vote form renders and posts with plain `<select>` and no JavaScript (form test over the rendered HTML: native selects with labels, a real `action`/submit button). `tests/admin-visibility.test.ts` classifies `best-player-ballots`. Route tests for the selector pages render as selector and refuse anonymous.

### 3.11 Docs and seed

`docs/features/best-player-votes.mdx` (persona: players, selectors, committee). Wording: "anonymous at normal club sizes, not guaranteed for small pools", never "secret ballot". Honest limits: nobody, including the admin, can read who voted for whom; the admin can see who has voted and delete a ballot; last-4 PINs are guessable inside a family (visible warning, 6-digit PINs recommended); changing ballot values changes totals; the public board lists closed games only; games under the minimum are not counted and the page says how many; the presentation snapshot. Updates in section 1. Seed (`seed:demo`, extending `payload/seed/demo-selection.ts`): turn `votesEnabled` on and `publicLeaderboard` on for the demo only; mark the demo finals as `selection-fixtures` rows with `status: 'final'`, publish a team sheet for each (fake demo players), and add deterministic ballots (a seeded generator, 8 to 12 voters per game, a few close finishes to show ties, a movement, one uncounted game below the minimum and one game with a still-open window that the public page must not show) so `/votes`, the race chart and the presenter have real-looking data; log the demo availability link for casting a vote.

### 3.12 Acceptance (local, no external calls)

Seed; open the printed availability link in a private window, identify as a demo player, vote for a finished game and edit it; five wrong PINs lock; a wrong fixture URL looks identical to a wrong link; as the demo selector open `/selector/votes` from the Overview, see participation and the private leaderboard; turn the public switch on via settings (see the PIN warning), open `/votes`, check that the open-window game is absent and "1 game not yet counted" shows, and check the race chart at 360 px with the table fallback; open `/selector/present/votes`, step with the keyboard and the buttons, toggle fullscreen, reload and resume; turn the switch off and see `/votes` return 404; export the CSV as the admin and open it; as the admin try the ballot REST URL and the admin document URL and get nothing.

## 4. WP-2: net sessions and the editable player card (#19, #20)

### 4.1 Navigation

The selector bottom bar **stays at four tabs**: Overview, Availability, Squads, Teams. No "More" tab. **Nets lives inside the Availability section** (a section sub-nav "Availability | Nets | Link" at the top of `/selector/availability`, `/selector/nets` and `/selector/link`, because net days are a weekly job like availability), and the Overview shows a "Nets tonight" card on net days and a "Votes to chase" card (linking to `/selector/votes`) when WP-1 is on. `lib/selector-nav.ts` changes only by an `isTabActive` rule so `/selector/nets` highlights Availability. A real layout check replaces the old risk entry: a unit/render test that the bar renders exactly four items with `min-h-11` targets and labels short enough for 360 px (each at most 12 characters, `grid-cols-4`), plus a 360 px viewport screenshot check in the acceptance run (4.9).

### 4.2 Data model (migration `wp_2_nets_card`)

**`net-sessions`** (selection collection, `read` and `write` staff only like the other selection collections, so a selector writes only through actions that re-derive the user; the rule is the same reason `selection-fixtures` is code-written and keeps the selector area the one place that edits these):

- `title` text, `date` text (`YYYY-MM-DD`, club time zone, same style as `selection-fixtures.localDate`), `startTime` text optional.
- `nets` number 1..12, `minutesPerTurn` number 1..30, `groupSize` number 2..8, defaults from constants in `lib/nets/constants.ts` (3 nets, 10 minutes, 4 per group).
- `state` select `planned`, `running`, `paused`, `finished`.
- Timer state, stored so a reload or a second selector's phone agrees: `round` (index), `roundStartedAt`, `pausedAt`, `revision`. There is no `offsetMs`.
- `rotationPlan` json (code-only access): ordered groups with the round and net each is up in. `finishedAt`, `notes`, `createdBy`.

**`net-attendance`** (selection collection, `read` and `write` staff only): `session`, `playerKey` text (`player:<id>` or `guest:<normalised name>`), `player` relationship nullable, `guestName` text, `checkedInAt`, `checkedInBy`. Unique index `(session, playerKey)`. Checking in records that someone **turned up at nets**; it is not a rating or a form number and is labelled that way everywhere. A no-show is a squad member expected but not checked in (derived).

**Guest names.** Capped at 40 characters and at 10 guests per session (constants); control characters stripped; a leading spreadsheet-formula prefix (`=`, `+`, `-`, `@`, tab, carriage return) stripped (the same `needsGuard` predicate from `lib/stats/csv.ts` decides); escaped on render. Guests are never exported: there is no net attendance CSV, and the StatLab/history exports contain no attendance columns (a test greps the export column sets), so the CSV case is closed by not exporting.

**Fields added to `player-selection-profiles`:** `battingStyle` select (`right-hand`, `left-hand`), `bowlingStyle` select (`none`, `right-arm fast`, `right-arm medium`, `right-arm off-break`, `right-arm leg-break`, `left-arm fast`, `left-arm medium`, `left-arm orthodox`, `left-arm wrist spin`), both selection read/write.

**Notes (decision in Appendix A.1).** No second notes field. The existing `notes` field gets a **`notesStaffOnly`** checkbox (field `access.read`/`update` use the existing `isStaffField` from `payload/access/index.ts`, so only admin and editor can set it). When ticked, only staff can read or edit that note; selectors see "A committee note exists" and nothing else. Server actions and `getSelectorProfile` run on the Local API with `overrideAccess`, so field access does not protect the read there: `getSelectorProfile` (`lib/selector-profile-queries.ts`) strips `notes` when `notesStaffOnly` and the caller is not `isStaff`, and the save action re-checks. A separate `staffNotes` field is added only if the club decides it wants two notes (A.1).

### 4.3 Rotation and timer (pure first)

`lib/nets/rotation.ts`: `buildRotation({ players, nets, groupSize })` splits the checked-in players into balanced groups (ten players with a size of four become 4, 3 and 3), numbers them, and assigns group `j` to round `floor(j / nets)` and net `(j mod nets) + 1`; everyone else in that round is "waiting", the next round's groups are "up next". `addLatecomer(plan, player, currentRound)` places the player in the smallest group of a round after the current one (new group in the last round if all are full) and never changes a started or past round; `removeFromPlan` likewise. `lib/nets/timer.ts`: `timerView({ round, roundStartedAt, pausedAt, minutes, rounds, state }, now)` returns `{ phase: 'not-started'|'running'|'paused'|'done', round, remainingMs, nextRound }`; the round advances by itself from the timestamps (`round + floor(elapsed / turnMs)`, clamped), so no write happens at each roll. Actions, each incrementing `revision`: **start, pause (with resume), next round, finish**. Not built: previous round, `offsetMs`, a seeded fair re-roll (build the rotation again before the first start instead). Resume moves `roundStartedAt` forward by the paused time; next round sets `round` to the effective round plus one and `roundStartedAt` to now.

`components/nets/rotation-timer.tsx` is a client component with server state, a visible countdown and a screen wake lock: it renders from the server snapshot plus `Date.now()` corrected by the server clock returned with the snapshot, ticks with a 250 ms interval only while visible, refetches `GET /selector/nets/[id]/state` (a no-store route handler, selection-guarded) on `visibilitychange` and after each action, and shows a large `role="timer"` countdown (not announced every second), **Up now** (net by net, names), **Up next**, who is waiting, and big Pause/Next/Finish buttons. It requests a wake lock while running (feature-detected, released on pause). Not built: 15-second polling, vibration, Web Audio tones, mute storage. Everything degrades to a plain countdown if the wake lock is missing; no sound file, no library, no network call beyond the state route.

### 4.4 Access matrix (REST + Local API)

| Resource | public | selector | editor | admin |
| --- | --- | --- | --- | --- |
| `net-sessions` | none | via actions and `lib/nets-queries.ts` (create, edit, start, pause, finish, delete own-created planned session); no REST | REST read/write | REST read/write |
| `net-attendance` | none | via actions (check in/out, add guest); no REST | REST read/write | REST read/write |
| `player-selection-profiles` style fields | none | read/write via actions | read/write | read/write |
| a note with `notesStaffOnly` | none | none (stripped on read in `getSelectorProfile`, ignored on write; the card shows "A committee note exists") | read/write | read/write |
| `/selector/nets/[id]/state` | none (404) | yes | yes | yes |

(Here "REST read/write" for editor and admin is the staff-only rule used by every selection collection; selectors have no REST access, which is the rule that keeps the selection collections hidden for every role in the admin menu.) Net attendance is never on a public page, never in the StatLab or history exports, and never exposed by a public query. Guest names are plain text, escaped on render, never linked to a person.

### 4.5 UI routes

- `/selector/nets`: upcoming and past sessions, **New session** with the defaults, "turned up" count per session. Reached from the Availability section sub-nav.
- `/selector/nets/[id]`: three sections on one phone page: **Check in** (squad players first, search for anyone else on the club list, **Add a guest**, a big toggle row per player, a live count, no-shows listed), **Rotation** (the timer in 4.3, with Build rotation before the first start), **Summary** (who turned up, the groups used).
- **Player card** `/selector/players/[slug]` becomes edit-in-place, one section per concern, each saving on its own button and showing a saved/failed message (no JavaScript required for the form, plain `<select>` and `<textarea>`): Cricket (role, can keep, batting style, bowling style), Contact and PIN (unchanged), Notes (the note; the "Staff only" tick only for `isStaff`), and read-only panels for form (last five, unchanged), availability next month (unchanged) and **Nets**: "Turned up at 5 of 8 net sessions in the last 8 weeks, last on 3 Oct" plus a dot row per recent session with the word present or absent. Never an attendance percentage without the window it covers, never a score or form number, and the card never shows vote counts.

### 4.6 Card save path

`saveSelectorFields` in `lib/selector-profile-queries.ts` is extended with an allowlist validator (`lib/selection/card.ts`: role, styles from fixed lists, notes length, plain text); `notesStaffOnly` is accepted only after `isStaff(user)`; each action re-derives the user and ignores any tampered field. Unknown option values are rejected, not coerced.

### 4.7 Tests

Unit: `buildRotation` (balanced sizes, group-to-round-and-net mapping, fewer players than nets, one player, many rounds), `addLatecomer`/`removeFromPlan` (never touch past or current rounds), `timerView` (running, paused, resume, between rounds, done, next-round, clock skew), guest-name sanitiser (length, control characters, formula prefixes, count cap), card allowlist (styles, role, lengths), `netAttendanceSummary` (window, turned up vs held, last date, wording), nav (four tabs, `/selector/nets` highlights Availability) and the 360 px tab-bar check from 4.1.

Integration: create/start/pause/resume/next/finish a session as a selector; refused for anonymous; check-in is idempotent under parallel taps (unique `(session, playerKey)`); guest names escaped and sanitised; two selectors read the same state after a pause (revision increments); the state route returns 404 to anonymous, needs a selection session and sets `no-store`; **`getSelectorProfile` called as a selector (Local API, `overrideAccess`) returns no `notes` when `notesStaffOnly`, and a hand-posted `notesStaffOnly` or edit to a staff note is ignored; the REST path is also refused**; editor can read/write; styles round-trip; net attendance appears on the card and in no public query, REST anonymous probe, StatLab/history export column set; the player merge cases in 5.1; `tests/admin-visibility.test.ts` classifies both new collections. A render test of `RotationTimer` with fake timers covers the roll, the pause and a missing wake lock API.

### 4.8 Docs and seed

`docs/features/net-sessions.mdx` (check-in, the timer, what is stored, honest limits: the timer is a convenience, a backgrounded browser tab may show a stale countdown until you return to it, wake lock is not supported everywhere; attendance means "turned up", not performance) and the player card edits in `match-day-overview.mdx`. Seed: two finished net sessions and one planned for tonight, attendance for about twelve demo players with a spread (one regular, one never), batting/bowling styles and roles on the demo roster, and a staff-only note on one demo player.

### 4.9 Acceptance (local)

Seed; sign in as the demo selector on a 360 px viewport and confirm the four-tab bar fits; Availability > Nets > New session (3 nets, 10 minutes); check in eight players and a guest; Build rotation; Start; reload the page and see the timer resume; open the same session in a second window and pause there; next round; finish; open a player card and see the "turned up" line and edit role and styles; sign in as the demo editor and tick "Staff only" on a note; as the selector confirm the note is hidden and that a hand-posted edit is ignored.

### 4.10 Risks

Rotation fairness is a policy (balanced groups and a fixed order), not a promise of equal batting time; the doc says so. Timers on phones are throttled in background tabs; the design recomputes from timestamps on return and never trusts tick counts. Player merges must repoint the new keys; this is a required task (5.1), not a check.

## 5. Cross-cutting

### 5.1 Player merge safety (required task, in WP-1 and WP-2)

The player merge lives in `lib/players/merge-core.ts` (`mergePlayerInto`, `undoMerge`), called by `payload/endpoints/mergePlayers.ts`. (`lib/club-merge.ts` merges the club globals over defaults and has nothing to do with players; it needs no change.) Today the merge repoints aliases, honours, seasons, people, sponsors and stored match appearances inside one transaction, and writes a `merge-log` snapshot. It does not touch selection data. Because ballot and attendance keys embed the player id as text (`player:<id>`), a relation repoint alone leaves stale keys, so each WP adds a step to the same transaction. For source player S into target T:

1. **Ballots (WP-1).** Update `best_player_ballots.voter` S to T and rewrite `voterKey` `player:S` to `player:T`. **Collision rule:** if T already has a ballot for the same fixture, keep the one with the earlier `castAt` and delete the other (ballots are never summed). Update `best_player_ballots_picks.player` S to T. **Duplicate pick:** if a ballot now names T twice, keep the pick with the better (lower) place and drop the other. **Self-vote:** if a ballot's voter is T and a pick is T (and `allowSelfVote` is off), drop that pick; if no picks remain, delete the ballot. Dropped picks leave a ballot with fewer picks, which the tally already handles.
2. **Net attendance (WP-2).** Update `net_attendance.player` S to T and rewrite `playerKey` `player:S` to `player:T`. **Collision rule:** if T already checked in to that session, keep the earlier `checkedInAt` and delete the other.
3. **Merge result and log.** The merge response and `merge-log` snapshot record the counts (ballots moved, collisions deleted, picks dropped, attendance moved). Undo restores moved rows whose key still equals the rewritten value; deleted collision rows and dropped picks are not restored (stated in the merge confirmation text, like appearances).
4. Adjacent gap, flagged not fixed here: availability answers, squad members and team-sheet slots are also not repointed by the merge today. WP-1 adds the ballots/attendance steps with a shared helper and files this as a follow-up under #38 so it is not forgotten.

Tests (integration): merge with no collision (keys rewritten, counts in the response); same-fixture collision keeps the earlier ballot; duplicate pick; self-vote created by the merge; attendance collision; undo; unique indexes never violated.

### 5.2 Files and verification

**Files (new unless noted).** WP-0: edits to `lib/playhq/match-rows.ts`, `lib/playhq/scorecard.ts`, `lib/match-store/write.ts`, `lib/match-store/read.ts`, `lib/history-import/bundle.ts`, `payload/collections/MatchInnings.ts`; new fixture and two tests. WP-1: `payload/collections/BestPlayerBallots.ts`, edits to `payload/globals/SelectionSettings.ts`, `payload/collections/SelectionFixtures.ts`, `payload/admin/navigation.ts`, `lib/players/merge-core.ts`, `lib/votes/{ballot,tally,chart,present,settings,status}.ts`, `lib/votes-queries.ts`, `app/(frontend)/availability/[token]/vote/[fixtureId]/page.tsx` + actions, `app/(frontend)/votes/page.tsx`, selector pages and actions for votes, `app/(frontend)/selector/present/votes/page.tsx`, `components/votes/{race-chart,presenter,ballot-form,leaderboard-table}.tsx`, `app/api/admin/votes-export/route.ts`, sitemap and robots edits, seed, docs. WP-2: `payload/collections/{NetSessions,NetAttendance}.ts`, edits to `PlayerSelectionProfiles.ts` and `lib/players/merge-core.ts`, `lib/nets/{rotation,timer,summary,constants}.ts`, `lib/nets-queries.ts`, `lib/selection/card.ts`, selector pages and actions for nets, the state route, `components/nets/*`, `lib/selector-nav.ts`, seed, docs.

**Verification order.** Per WP: targeted unit file(s), `tsc --noEmit`, `pnpm generate` + `git add` of generated files, `pnpm check:generated`, `pnpm check:migrations`, eslint on changed files, targeted int files. Once at the end of the wave: full `pnpm test`, full `pnpm test:int` (one run), one `next build`.

**External decisions and credentials.** None. This wave adds no third-party service, key or env secret. Policy choices for the club (not blockers, all have safe defaults): the minimum ballots per game (default 5), whether the public leaderboard is ever switched on (default off), whether staff-only notes need a second field (A.1), and whether committee members who are not admin or editor should see staff-only notes (they would need an editor account). Posting a leaderboard image to a social network is part of #21/#23 and would be built there as an env-gated seam, not here.

## Appendix A. Decisions worth challenging

1. **Notes.** Default: one `notes` field plus a "staff only" tick (`notesStaffOnly`). A second `staffNotes` field is added only if the club decides it wants selector-visible and staff-only notes side by side; until then it is not built.
2. **Nominee source fallback.** Published team sheet first, stored match appearances second. Alternative: published sheets only, which is stricter but blocks voting for every game before the tool was used. Chosen: the fallback, documented.
3. **`minBallotsToCount` default 5.** Protects anonymity better than 3 but means a game with four ballots does not count anywhere yet, and under-ranks players from sparsely voted games. The page says how many games are not counted. Clubs may lower it (floor 3) knowing the privacy cost.
4. **No one reads raw ballots.** There is no support read; the admin gets an audit of who voted and can delete a ballot. Cost: a disputed ballot cannot be inspected, only reset.
5. **Vote settings in the selector area, not a new menu entry.** Keeps the committee menu at its cap; discoverability comes from one Overview/admin link.
6. **Ordinal ties in WP-0 put played first.** Alternative is array order; played-first keeps the real third innings as ordinal 3. Either is stable; played-first reads better in the data.
7. **Timer state on the server, no polling.** Slightly more writes than a purely local timer, but a reload or a second phone agrees on return. Alternative: local only, rejected for the reload case.
8. **Presentation data in the page payload.** Simple and offline-tolerant; later steps are readable with developer tools by whoever holds the presenting laptop. The data holds cumulative closed-round totals only.
9. **Four tabs, Nets under Availability.** Keeps everyday tasks one tap away and avoids a "More" tab.

## Appendix B. Verify list (settle during implementation, in order)

1. `mapScorecard` behaviour on the new fixture and the two-day placeholders; the existing scorecard tests and `tests/matches-queries.test.ts` stay green after `isEmptyPeriod`.
2. Org and team ids in `game-summary-two-day.json` and the test context helpers, so the anonymised fixture reuses them.
3. That the sync summary shows the failed game id and message for a per-game write failure (the `matchError` counter and log exist; add the detail if the summary only has the count).
4. When `selection-fixtures.status` becomes `final` (refresh path) and that the 14-day retention window plus `voteWindowDays` default of 7 leave no gap for the first week of voting.
5. Array-field `access` on `picks` under Payload 3.90.2 (`nobody` must also block `where[picks.player]`).
6. The exporter in `lib/stats/csv.ts` that shares `needsGuard` and the file-name prefix helper (`EXPORT_FILENAME_PREFIX`).
7. The path lists in `tests/no-brand-hex.test.ts`, `tests/selection-guards.test.ts`, `tests/selector-guards.test.ts` and `tests/staff-guard.test.ts`, and the `selectionCollections` assertions in `tests/admin-visibility.test.ts`.
8. `next.config` headers cover `/availability/:path*` (including the nested vote route) and `/selector/:path*` (including the state route); add a test.
9. The sitemap and robots helpers so `/votes` appears only while the switch is on.
10. That `clientIp` (`lib/client-ip.ts`) and `ipHit` work for the vote routes behind the Vercel proxy as they do for selector sign-in.

Resolved while writing this spec: `isStaffField` exists in `payload/access/index.ts`; the `_avail` cookie name is built by `availCookieName` from config; the player merge is `lib/players/merge-core.ts` (5.1).

## Appendix C. Risks

- **First sync after WP-0 rewrites every game.** Expected and bounded by the existing write budget (2.9).
- **De-anonymising a ballot through small totals.** Mitigated by a default minimum of 5 ballots, closed-window-only public data, cumulative-only series, no per-game results and a snapshot test. Residual risk with very small voter pools or a player with a single game in a round is stated in the doc ("anonymous at normal club sizes, not guaranteed for small pools").
- **Shared families and PINs.** Last-four-digit PINs are guessable inside a family and a player could vote as a relative; mitigated by the visible settings warning, per-player, per-link and per-IP throttles, and the doc recommends manual 6-digit PINs.
- **Chart legibility across clubs.** Five series from a gold-and-grey palette depend on markers, dashes and labels rather than colour.
- **Settings drift.** Changing `ballotValues` or the tie-break toggle re-tallies history; the settings screen warns and the export records the values used.
- **Timer reliability on phones.** Background throttling and no wake lock on some browsers; recompute from timestamps and say so.
- **Scope creep.** Deferred and recorded as follow-ups under #38: the votes share image, player self check-in to nets via a QR, voting for umpires and coaches, form-trend scoring on the card, public player styles, a `squad_members` voter rule, configurable tie-break order, presenter shortcuts and help overlay, repointing availability/squad/team-sheet keys on player merge.

## Appendix D. Review findings: what was resolved and what was rejected

Resolved as written: all of findings 1 to 13, with the following exceptions and adjustments.

- **Finding 7, file name.** Rejected in part: `lib/club-merge.ts` merges club globals over defaults and has no player logic. The player merge is `lib/players/merge-core.ts`, which `payload/endpoints/mergePlayers.ts` calls; the repoint work is specified there (5.1).
- **Finding 12, batch limit per night.** Not needed: `lib/players/sync.ts` already stops fetching and writing past `COLLECT_BUDGET_MS` and `WRITE_BUDGET_MS` and the next run continues. A test pins the deferral with the bumped version.
- **Finding 12, per-game failure.** Partly already true: a failed write is counted in `matchError`, logged and its pair skipped. The spec adds the pre-transaction `assertUniqueInnings` and the game id in the summary.
- **Finding 6, identical timing.** Byte-identical responses are asserted by a test; equal timing is a design rule (same queries on every path) rather than an asserted property, since wall-clock timing tests are flaky.
- **Finding 10, "two tabs".** Adjusted: the bar stays at four tabs with Nets under Availability and Votes from the Overview, which removes the More tab without merging existing tabs.
- **Finding 1, "roughly 40% of the pool".** Adopted as settings-screen guidance with a default of 5 and a floor of 3, not as an enforced formula, because an enforced share would stop small clubs counting any game.
- **Finding 8, notes.** Adopted the single-field plus toggle; the second field waits for the club's decision (A.1).
- **Finding 11, `_avail` and the seed.** Confirmed already config-driven; the seed's club data stays acceptable.
