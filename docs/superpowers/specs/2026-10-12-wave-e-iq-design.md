# Wave E: reliable tests and the IQ analytics module (design)

Date: 2026-10-12. Branch: feat/payload-cms. Tracking issue: #38. Issues in scope: #31, #32, #33, #34, #35 (the "Analytics and match prep" block, minus the fantasy competition #36 and the template extraction #37). Out of scope: ball-by-ball or live scoring, wagon wheels and shot maps, AI-written scouting text, forecasts of any kind, any new external service or credential, any change to the committee admin menu.

| WP | Issues | One line |
| --- | --- | --- |
| WP-0 | none (test infrastructure) | Find why full-suite int runs fail different files that pass alone, make each int file hermetic and the file order deterministic, prove it with 5 consecutive green full runs plus 20 loaded loops of each previously failing file (with a stop rule, 2.6). |
| WP-1 | #31 | Opposition scouting report in the selector area: head to head, their numbers against us, typical totals, toss patterns, our best against them, a rule-based plan, one-page print. |
| WP-2 | #32 | Best XI suggester on the team page: ordered, explained picks from availability, role and recent form; overrides; lands as a draft, never published. |
| WP-3 | #33, #34 | One public "Insights" entry in the stats menu: player and team trends (inline SVG) and team analysis. |
| WP-4 | #35 | Investigate ball and over data; close out phases, wagon wheels and radars with evidence; build only fall-of-wicket profiles and collapses. |

Build order: WP-0 first (it changes how every later test runs, but it is time-boxed, see 2.6), WP-1, WP-2, WP-3, WP-4. WP-2 goes before WP-3 so the wave's only migration and the `teamWarnings` change land early and settle: WP-2 uses `loadInsights` unchanged (4.1 item 3) and needs nothing from WP-3. Each WP ships alone with its own doc and commit. **Minimum viable set: WP-0 (as far as the stop rule allows), WP-1, WP-3; WP-1 and WP-3 never block on WP-0's unproven remainder.** WP-2 needs the wave's only migration. WP-4 ships the close-out documentation and guard test first; the fall-of-wicket pages are optional and built only once WP-0, WP-1 and WP-3 are done.

## 0. Findings that shape the design

Checked against this branch on 2026-10-12.

1. **The match store is staff-read only, on purpose.** `matches`, `match-innings`, `match-appearances`, `match-batting`, `match-bowling`, `match-fielding` are `internalCollection`s: REST read is `isStaff` (admin or editor) because `match-appearances` holds opposition players' full names. Selectors are a separate role and get nothing over REST. So the selector tools follow the pattern already used by `lib/selector-team-queries.ts`: a `requireSelection` page, a `lib/selector-*-queries.ts` function that starts with `assertSelection(user)`, then the Local API with `overrideAccess: true`.
2. **The public facts layer drops opposition people.** `lib/stats/match/facts.ts` builds a `FactSet` (club side only, visible players only, hidden players null even inside partnerships) and `lib/match-store/stats-queries.ts` caches it per season under `match-facts` with the public stats tags. `lib/stats/match/opposition.ts` says "Opposition players are never listed". Scouting needs opposition names, so it gets its own selector-only loader over `isClubSide: false` rows, **never** added to the cached public blob.
3. **Opposition identity is a name string.** `match-appearances` stores `displayName` and a `nameKey` for opposition players with no person record; PlayHQ gives no stable opposition player id here. Two people with the same name merge; a spelling change splits one person. Every opposition player figure is labelled "by name, approximate".
4. **Selection fixtures have no opposition organisation id.** `selection-fixtures` carries `opponentName` only. The matches table has `opponentOrgId` and `oppositionKey()` (org id, else `n:<normalised name>`). The upcoming-game link to a scouting report therefore resolves by `normaliseClubName` against the stored opponents; if nothing matches the page says "No stored games against this club" rather than guessing.
5. **Fall of wickets exists; ball and over data does not.** From `tests/fixtures/playhq/game-summary-one-day.json` (a captured PlayHQ game summary) and the mapper `lib/playhq/match-rows.ts`: innings-level statistic types are `TOTALS`, `TOTAL_OUTS`, `TOTAL_EXTRAS`, `EXTRA_LEG_BYES`, `EXTRA_WIDES`, `EXTRA_BYES`, `EXTRA_NO_BALLS`, `EXTRA_PENALTY_RUNS`, `OVER_LIMIT`; each appearance has a `statistics` list and `displayOrder`; `fallOfWickets[]` has exactly `sequenceNo`, `appearanceId`, `runs`. There is no over, ball, minute, delivery list or shot field anywhere. The stored `hasBallData` flag means only "a batter has a `BALLS_FACED` figure", not ball-by-ball. Details and the decision are in WP-4.
6. **Team balance rules are hard-coded.** `MIN_BOWLERS = 5` and `MIN_BATTERS = 5` live in `lib/selection/warnings.ts` (grep over `lib app components tests payload` finds them only there; WP-2's first step repeats the grep, including the publish action, builder UI and tests, before changing anything); role thresholds (`BOWLER_MIN_BALLS`, `LOW_BAT_AVERAGE`) in `lib/selection/roles.ts`. Issue #32 as written ("Best XI from current availability and form with balance warnings, compared against the saved selection") does **not** say the rules must be configurable; the issue body has no such line. Making them settings is therefore a small, justified extra, not a requirement: it is the only reason for a migration, so **if WP-2 is cut or the owner declines settings, no migration is made** and the constants stay. If WP-2 ships, the settings are the minimum set in 4.2 (fields on an existing global, so no menu change).
7. **Reusable pieces:** `loadInsights` (last-five lines and suggested role), `effectiveRole`, `balanceCounts`, `teamWarnings`/`blockingWarnings`, `buildSnapshot`/`diffSnapshots`, `currentSquads`/`membersBySquad`/`loadPlayers`/`getSelectionSettings` (`lib/selection/store.ts`), `loadAvailabilityBoard` (`lib/selector-availability-queries.ts`), `assertSelection`, `requireSelection`, `selectorPaths`, `SelectorShell`, `components/stats/*` (FilterBar, progression and win/loss charts, print button), `StatsSubNav`, `assembleFacts`/`deriveFacts`/`partnerships.ts`, `matchMinimums` and `approachWindow` in site settings, `toCsv` (not needed: no export in this wave), `getTheme()`, `themedImageResponse()`.
8. **GraphQL is disabled** (`graphQL.disable`, pinned by a test). Each access table therefore covers REST and the Local API. The Local API ignores access unless `overrideAccess: false`, so every query states its own filter.
9. **The committee menu is untouched.** No new collection or global. The existing `selection-settings` global (admin-only update, hidden from editors) gains fields; it is already classified.
10. **No vitest results-cache protection exists.** `node_modules/.vite/vitest/<hash>/results.json` holds per-file durations and failures; vitest's default sequencer runs failed files first and then the longest files first. A failure therefore changes the next run's file order. This is measured, not guessed, and is central to WP-0.

## 1. Rules for the whole spec

**Commits and safety.** Conventional commits, explicit `git add` paths (never `-A`), never push, last line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `.env.local` is local only (Postgres `127.0.0.1:54329`; `langlang_dev`, `langlang_test`, `langlang_mig`, `langlang_legacy`); check hosts are `127.0.0.1` before any DB work; never read the main checkout's `.env.local`, never set a Blob token, never run the Vercel CLI. Run anything that could reach PlayHQ with `PLAYHQ_CLIENT_ID=` empty. This wave needs **no** external call at all: everything derives from stored rows. Dev server ports 4300-4399.

**Honest numbers (hard).**
- `null` means not recorded and is shown as "not recorded" or "No data", never 0. Every figure shows its sample (`n` games, innings or spells) beside it.
- A rate or average needs a minimum sample (the existing `matchMinimums` setting for player rates, constants in `config/site.ts` for team figures); below it the raw counts show and the rate is omitted.
- An average of runs needs at least one dismissal; with none, show "not out" runs, not an infinite or zero average.
- Strike rate and economy count only innings or spells where balls are recorded for every row counted (the existing "runs scored without recorded balls" rule).
- No composite or invented score anywhere. Ranking uses ordered, visible rules (WP-2); text is generated from thresholds that cite the number they used. No AI text in this wave.
- Imported history games (`source: import`) have no opposition people, no fall of wickets and no ball data; they count in team totals where totals exist and are excluded, with a count, wherever the needed field is missing.

**Club-neutral.** Names, colours, fonts, copy and grade labels come from `getClub()`, `getTheme()`, `config/site.ts` or settings. Charts use `bg-/stroke-/fill-brand-*` utilities only (the no-hex guard test applies), grade labels pass through the existing label renames (`getLabelMap`). Strings such as "Lang Lang" stay out of code (guard tests exist). New defaults live in `config/site.ts` (`SELECTION.xi`, `SCOUTING`, `INSIGHTS`).

**Staff and selector access.** Staff is admin or editor (`isStaffUser`); selectors are separate (`isSelectionUser` includes admin, editor and selector). New code never writes `Boolean(user)` or `!req.user` as an access check. `tests/staff-guard.test.ts` scope is extended to every new `lib/selector-*-queries.ts`, action and route file.

**Access vocabulary:** public (anyone), selector (admin, editor or selector, checked in code), staff, admin, nobody (code-only). Every table below states REST and Local API behaviour.

**Privacy.** Opposition player names are third-party personal data held for scouting only: they appear on selector pages only, never in a public page, a public cache entry, an OG image, a shared link, a log line, an export or a social graphic. Hidden club players appear nowhere, not as a name, a partner or a count that identifies them. Personal details of club players (phones, notes in `player-selection-profiles`) are not used by this wave.

**Mobile first and accessible.** One column at 360px; tables become stacked rows or scroll inside their own box (`overflow-x-auto`, no page scroll); touch targets 44px; every chart is an inline SVG with `role="img"`, a `<title>` and `<desc>` that state the takeaway, colour never carries meaning alone (labels or patterns), and a "Show as table" `<details>` with the same numbers. Empty and one-game states are written out ("Only 1 game stored, not enough for a trend").

**Docs, seed, tests.** Each module has `docs/features/<slug>.mdx` in the required shape plus an `index.mdx` row; `match-stats.mdx` and `match-data-store.mdx` get a short pointer. `pnpm seed:demo` is extended (section 7). Every WP lists unit tests, int tests and security tests; targeted tests while building, the full suite once in the final Verify step (WP-0 is the single exception).

**Generated files.** The one migration is made with `pnpm payload migrate:create e1_selection_rules`, schema-qualified, club-neutral, `.ts` and `.json` committed; then `pnpm generate`, `pnpm check:migrations` and `pnpm check:generated` pass after `git add`.

## 2. WP-0: flaky full-suite int tests

### 2.1 What is known

Seen failing in full runs while passing alone: `media-register`, `site-settings`, `etl`, `club-apparel`, `office-email` ("stopping ends sending"), `announcements`. The failing file differs between runs. That the residue below causes this is a **hypothesis** (H1 to H6), not a finding.

Evidence gathered (no root cause is claimed yet; this section is a protocol, WP-0's first commit records the proven cause):

- **Configuration:** the int project runs `pool: 'forks'`, `singleFork: true`, `isolate: true`. `isolate: true` resets the module registry per file but **not** `process.env`, `globalThis`, the Postgres database or open sockets. All 76 int files share one process, one database and Payload's `global._payload` cache.
- **Two earlier patches already treated symptoms** (`a122ae5` env and `_payload` reset plus the run lock, `c5e1c72` smaller pool and a real sheet author). `isolate.ts` deletes a **fixed** list of env names; any other leaked name survives. 11 files assign `process.env.X = ...` directly (`stories`, `etl`, `office-email`, `media-register`, `social-publisher`, `social-cron-route`, `event-photos`, `email-reset`, `yearbook-ai`, `wp1-verification`, `social-posts`); `vi.stubEnv` is used with no `unstubEnvs` in the config; `restoreMocks` is not set.
- **Files do not clean up after themselves.** After a passing four-file run (`club-apparel`, `site-settings`, `announcements`, `media-register`) the test database still held `media: 6`, `announcements: 3`, `users: 1`, `documents: 1`, `club_apparel: 1`, `users_sessions: 3`. The next file starts on top of that. The failing files above are exactly the ones sensitive to shared singleton or counted rows (globals, media registration, announcements) or to leaked env.
- **File order is not stable.** The default sequencer sorts by the cached results of the previous run (failed first, then longest). One failure therefore reshuffles the next run, so "a different file fails each time" is *consistent with* residue-dependence (not proof of it). `DATABASE_POOL_MAX=3` with one Payload per file is a second pressure (connection exhaustion or slow boot under load shows up as a hook timeout).
- **"Full vitest" means `pnpm vitest run`**, which runs the unit and int projects in one invocation. The unit project is DB-free, but its CPU use can lengthen int hook times; this is checked, not assumed (hypothesis H6).

### 2.2 Hypotheses and the check that decides each

| # | Hypothesis | Discriminating check |
| --- | --- | --- |
| H1 | Cross-file DB residue (rows or singleton globals left by an earlier file) breaks later files. | A `TRUNCATE` of every `payload` table before each file makes the failure disappear; a leak report (2.4) names the file that left rows. Replay a failing pair `<predecessor> <failing>` in isolation to confirm. |
| H2 | File order varies with the vitest results cache, so residue meets a different victim each run. | Capture order from a failing run with `--reporter=verbose`; replay with a fixed sequencer and with `--sequence.shuffle --sequence.seed=<n>`. Delete the cache directory and compare. |
| H3 | Leaked process state: env set directly or stubbed and not restored, globals (in-memory throttles, mail mock registry, module-level caches on `globalThis`). | Snapshot `process.env` and the own keys of `globalThis` at the start of every file and diff at the end; list added or changed keys per file. |
| H4 | Time or async (the `office-email` "stopping ends sending" case is the prime suspect and is **expected to be a real time or async race that truncation will not cure**; it gets its own targeted fix and its own loop evidence, never credit from the truncate): a test racing a timer, a batch or an unawaited promise (the `office-email` stop test runs `startSend`, `runBatchFor`, `stopSend` back to back; announcements expire by date; any `new Date()` near a boundary). | Run the single file 20 times under CPU load (`yes > /dev/null` x cores); search for `setTimeout`, `Date.now`, `void` calls and fire-and-forget in the code under test; check `pg_stat_activity` and open handles after the file. |
| H5 | Connection exhaustion or slow Payload boot (pool 3, a previous instance not destroyed, `destroyTestPayload` failing inside a timed-out `afterAll`). | Count `pg_stat_activity` for `langlang_test` at the start and end of every file; log `getPayload` boot time per file; compare against the hook timeout. |
| H6 | Unit and int projects competing for CPU in the same invocation. | Run `pnpm vitest run --project int` alone and `pnpm vitest run` several times; compare the failure rate and boot times. |

### 2.3 Reproduction protocol

1. Record the failure: `pnpm vitest run --reporter=verbose --reporter=json --outputFile=<scratch>/run.json 2>&1 | tail -200`, saving file order and failing assertions. Pipe the log through `tail`/`grep`; never print it whole.
2. Bisect by pairs: `pnpm vitest run --project int <predecessor> <failing>`; then by the set of all earlier files in recorded order.
3. Replay with a fixed order, then `--sequence.shuffle --sequence.seed=1..3`.
4. For the flaky time-based test, run it repeatedly alone under load.
5. Write the proven cause and its evidence at the top of `tests/int/isolate.ts` (the file already explains the earlier causes).

### 2.4 The fix (structural, no retries, no `--retry`, no raised timeouts as a cure)

1. **Deterministic order.** A small custom sequencer (`tests/int/sequencer.ts`, extending vitest's `BaseSequencer`, sorting by path) set at the root `test.sequence.sequencer` (vitest reads it from the root config, not a project; verified when implementing). **Because it is root-level it also fixes the unit project's order**; that is acceptable (unit files are DB-free) and is stated in the commit. The repo is on vitest 3.2.x (`^3.2.4` in `package.json`, 3.2.7 installed): implement `sort(files)` and `shard(files)` with the 3.x `TestSpecification` signatures (specs have `moduleId`/`project`, not bare paths) and confirm against the installed types; a unit test pins the ordering. The cache can no longer reorder files.
2. **Hermetic database per file, truncate only.** In `tests/int/isolate.ts` (a `setupFiles` entry; vitest runs setup-file hooks before the test file's own hooks, so the reset precedes any `beforeAll` seeding; files that call `getPayload` at module scope still hold a stale `_payload`, which `isolate.ts` already clears): after `assertTestDb`, connect with a short-lived `pg` client and `TRUNCATE` every table in schema `payload` except `payload_migrations` with `RESTART IDENTITY CASCADE`, in one statement built from `pg_tables`. There is **no baseline schema and no second restore mechanism** (a hidden `payload_baseline` copy would be one more flaky moving part). Instead `globalSetup` runs `pnpm payload migrate` once against `langlang_test` and then checks every non-migration table for rows. Expected result: zero (the migrations create schema, they do not seed). A **sentinel assertion** in `globalSetup` fails the whole run, naming the table and count, if any non-migration table is non-empty after migrate. If that ever fires, the data-migration is fixed or the baseline decision is revisited in a new spec; it is not silently papered over.
   **Lock risk.** `TRUNCATE ... CASCADE` takes `ACCESS EXCLUSIVE` locks, so a connection left open by a previous file's timed-out `afterAll` makes it hang. The reset client sets `lock_timeout` (5 s) and `statement_timeout` (15 s) at connect time; on a timeout it queries `pg_stat_activity` for the database and fails with an error naming the blocking pid, its `state`, `query` and `application_name` (and `pg_blocking_pids` for the waiting backend), so the culprit file is obvious instead of the run hanging.
3. **Hermetic process state.** `isolate.ts` stores `process.env` once on `globalThis` (first file) and restores it before every file (delete added keys, reset changed ones) instead of deleting a fixed list; it keeps clearing `_payload`. The int project sets `unstubEnvs: true` and `unstubGlobals: true`; `restoreMocks: true` is tried last and adopted only if the suite stays green with it, otherwise files keep their own `afterEach`.
4. **Leak and handle detector.** `pnpm test:int:leaks` (an env switch read by `isolate.ts`) turns the same code into an auditor: instead of truncating silently it **fails the file that starts on leftovers**, naming the previous file, table and row count, and reports env keys and `globalThis` keys a file added, plus `pg_stat_activity` connections still open after `destroyTestPayload`. Offending files are fixed to clean up after themselves. This converts "flaky" into deterministic attribution and is part of the acceptance evidence.
5. **Targeted fixes** for whatever H3-H5 prove (for example: a fake clock or an injected `sleep`/`now` where a test races time, awaiting the work the code under test starts, `destroyTestPayload` made unconditional in a `finally`). Each fix has a comment naming the failure it prevents.
6. The advisory run lock stays; its scope is the `langlang_test` database (Postgres advisory locks are per database). Any script that opens `langlang_test` outside the lock is found with a grep and either takes the lock or is moved to `langlang_mig`.

### 2.5 Acceptance (runnable locally; the one place several full runs are allowed)

- Root cause and evidence written in `tests/int/isolate.ts` and in the commit message, with each hypothesis marked proven or rejected.
- **Five consecutive green** `pnpm vitest run 2>&1 | tail -30` runs. (Three is not enough: a flake of about 20 percent passes three runs about half the time. Five brings that to roughly a one in three chance, so it is paired with the loops next.)
- **20 loops of each previously failing file** (`media-register`, `site-settings`, `etl`, `club-apparel`, `office-email`, `announcements`) run alone **under CPU load** (`yes > /dev/null` once per core, killed afterwards), all green. `office-email` "stopping ends sending" is judged by these loops and by its own fix (H4), not by the full-suite runs.
- **Shuffle applies to the int project only** (`pnpm vitest run --project int --sequence.shuffle --sequence.seed=<fixed>`, plus two more seeds). Unit-project files and any files sharing fixtures on disk are out of its scope and are not shuffled. If shuffle fails after the green runs, that is a **defect to fix** (an order dependence the truncate did not cover, or a shared on-disk fixture), reported by `test:int:leaks`; it is never a gate to drop or a reason to weaken the acceptance.
- `pnpm test:int:leaks` clean.
- `pnpm tsc --noEmit` and eslint on changed files pass. Unit tests for the sequencer ordering and the env snapshot/restore helper.
- No schema change, so no migration; no product code changes unless a real product race is found (then it is fixed there and noted).

### 2.6 Stop rule

WP-0 is the largest unknown and the five WPs are not otherwise dependent on it. Fixed budget: **one working day of effort** (about eight hours, of which at most two on reproduction before the structural fixes start). If the proven root cause is not found inside the budget, ship the structural pieces that need no diagnosis (the sequencer, the per-file truncate with the sentinel and lock diagnostics, the env restore) with the acceptance evidence gathered so far, record the **unproven remainder** (which hypotheses are still open, which files still flake and at what measured rate) in `tests/int/isolate.ts` and on #38, and move on. WP-1 and WP-3 do not wait for WP-0's remainder; they are verified with targeted runs plus the final single full run, and a flake in an unrelated old file is recorded, not chased.

## 3. WP-1: opposition scouting report (#31)

### 3.1 What it shows (all from stored matches)

For one opposition club (identified by `oppositionKey`; the key is URL-encoded):

1. **Head to head:** played, won, lost, drawn, tied, no result, forfeits (n each), by season and home/away; last meeting (date, grade, result, scores, link to the existing scorecard).
2. **Their results against us:** their last five meetings as a W/L strip (the store holds only games against the club, so this is "their recent results against us", stated that way; their results against others are not stored).
3. **Typical totals:** their innings totals against us (mean, highest, lowest, n) and ours against them, first innings and chasing separately where n allows; all-out rate; average wickets lost. Needs `totalRuns`; imported games without totals are excluded with a count.
4. **Toss and decision:** how often they won the toss against us, what they chose, and the result after. Only games with `tossChoice` recorded count, with n.
5. **Their danger batters and bowlers:** top opposition batters (innings, runs, dismissals, average only when there is at least one dismissal, high score, fifties) and bowlers (balls, wickets, runs, economy only when balls recorded) from games against us, with the last five of each as a line, **by name, approximate** (finding 3). A player appears only at or above `SCOUTING.minInnings`/`minBalls`. Names can be hidden entirely by the `scouting.showOppositionNames` setting (shows "Opening batter, 3 games" style rows by batting position instead). **That toggle is a club-wide, admin-only setting, not a per-selector choice:** it lives on the `selection-settings` global (Advanced > Selection settings), which has `read: isSelection` and `update: isAdmin` and is hidden from editors. Selectors can read the value but not change it, so it governs what every selector sees. The doc and the UI never describe it as something a selector picks. Default is `true` (names shown) because selectors need them to plan; the page carries a standing notice, "Third-party names, for selection use only", beside every list of opposition people (top of the danger section and on the print view).
6. **Our best against them:** visible club players' runs and wickets against this opposition, reusing the existing opposition aggregation (`lib/stats/match/opposition.ts`) so the numbers match the public Opposition page.
7. **Venue history:** results by venue.
8. **Game plan (shown first, see mobile order below):** a short list of sentences produced by fixed rules, each citing its number and n and omitted below `SCOUTING.minSample` (for example "They chose to bowl in 6 of the 8 tosses they won (n=8)", "Their innings ended all out in 5 of 9 (n=9)", "Opening partnership against them: 3 of 9 started with a wicket inside 10 runs"). No AI, no speculation; if no rule fires the section says so.
9. **Print:** the same page with a print stylesheet and the existing print button gives a one-page cheat sheet (A4 portrait, no navigation, theme tokens only, club name from `getClub()`). **Print is the primary share output** (a captain prints or saves a PDF; the page has no share link, by design), so the print view opens every `<details>` section.

**Mobile order for volunteers.** Nine sections is a long scroll at 360px for a captain on the sideline. Order: (a) a plain-language status line first, (b) **Game plan**, (c) **Danger batters and bowlers**, then everything else (head to head, their results against us, totals, toss, our best against them, venue history) as collapsed `<details>` sections with a one-line summary each. **Empty state leads:** most clubs have fewer than `SCOUTING.minSample` games against a given opponent, so the common page opens with "Only N games stored against X. That is not enough for a plan yet; here are the results so far." followed by the raw ledger, not with a stack of empty tables. Colour never carries meaning alone.

### 3.2 Data model and migration

None. New read-only loader `lib/match-store/scouting-read.ts` (opposition rows for matches whose `oppositionKey` equals the opponent, FINAL only, capped at the newest `SCOUTING.maxMatches`, default 60, with a visible "newest N games" caption when capped) and pure functions in `lib/scouting/*.ts` (`head-to-head.ts`, `totals.ts`, `toss.ts`, `danger.ts`, `plan.ts`, `resolve-opponent.ts`) that take plain rows, so they are unit tested without a DB. Query module `lib/selector-scouting-queries.ts` is the only caller; it starts with `assertSelection(user)`. Results are **not** placed in `unstable_cache` or any tag shared with public pages (the data contains opposition names); a request reads fresh. The page is `dynamic` (no static or ISR output, `export const dynamic = 'force-dynamic'`) and every response sets `Cache-Control: private, no-store`.

**Per-request cost bound.** Besides the 60-game cap:
- The opponent list (`/selector/scouting`) is **one aggregate query over `matches` only** (group by `oppositionKey`: count, last date, display label), with no appearance, batting or bowling rows.
- The report loads the (at most 60) match ids first, then uses **batched `in` queries with `pagination: false`** for `match-innings`, `match-appearances`, `match-batting`, `match-bowling`, one query per collection, not one per match. `overrideAccess: true`, `depth: 0`, and `select` limited to the fields the pure functions use.
- No rate limit. A PIN-throttle-style limiter is only worth adding if a selector session is cheap to mint; it is not (selector sign-in already sits behind the PIN throttle and an availability-link flow), so a limiter here would be over-engineering. Revisit only if load is measured.

**Opponent key.** `[opp]` is the raw `oppositionKey` (an org id, or `n:<normalised name>`), URL-encoded, on a selector-only page, so enumeration is limited to selectors. An unknown key renders the standard 404 (`notFound()`) and **neither the response nor any log line echoes the key** (no `console` call with it, no error message containing it, no `<title>` or heading built from it); the test asserts the 404 body does not contain a probe key.

### 3.3 Access per operation

| Operation | Public | Token | Selector | Editor | Admin |
| --- | --- | --- | --- | --- | --- |
| View the scouting list and report (page, GET) | no (redirect to selector login) | no | yes | yes | yes |
| Print page | no | no | yes | yes | yes |
| Read `match-*` over REST/Local API with access | no | no | no (selectors get nothing over REST) | yes (existing) | yes (existing) |
| Create/update/delete anything | no | no | no | no | no (nobody; no writes at all) |
| GraphQL | disabled | | | | |

The page is `noindex, nofollow`, excluded from the sitemap (a sitemap test already enumerates routes; it gains an assertion for `/selector/*`), has no share button, no OG image, no CSV and no social graphic.

### 3.4 Routes

- `/selector/scouting`: opponents with games played, last meeting; search box; reached from an Overview card ("Match prep") because the selector tab bar stays at four tabs.
- `/selector/scouting/[opp]`: the report (`opp` = URL-encoded key; an unknown key is a 404 that does not echo the key, see 3.2).
- A "Scout <opponent>" link on each upcoming-game card in `/selector/teams` and the builder header, using `resolve-opponent.ts` (finding 4; ambiguous names list the candidates).
- `selectorPaths.scouting` and `scoutingFor(key)` in `config/site.ts`.

### 3.5 Admin classification

No collection or global is added; nothing in `payload/admin/navigation.ts` changes; `tests/admin-visibility.test.ts` stays green. New `selection-settings` fields (shared with WP-2, section 4.3): `scouting.showOppositionNames` (admin-only, club-wide, 3.1 item 5), `scouting.minInnings`.

### 3.6 Tests

- **Unit:** each pure function with boundary cases (tie, no result, forfeit, imported game, null totals, null toss, one game, min-sample thresholds); name-key merging of two same-named opposition players is surfaced as a caveat, not hidden; two different clubs whose names normalise to the same string (for example two "Warragul" clubs with different org ids) make `resolve-opponent` return both candidates, never one; plan rules fire only at threshold and cite n; `resolve-opponent` (org id, name fallback, ambiguous, none); no-hex and no-club-name guards.
- **Int (local `langlang_test`):** a seeded store with several opponents returns the right ledger; a hidden club player is absent from "our best against them" and from any count that could identify them; an imported game is counted for the ledger only.
- **Security (required):**
  - The scouting page response sets `Cache-Control: private, no-store` (asserted on the rendered route's headers) and the route is `dynamic`.
  - No query that feeds a public tag or `unstable_cache` includes `isClubSide: false` rows (a static scan of the cached readers under `lib/match-store/` and `lib/stats/` for `unstable_cache`/tag usage, plus a test that the scouting loader module is never imported by a cached reader). This is in addition to the blob-grep below.
  - The unknown-key 404 body and captured logs do not contain the probe key.
  - **Static import check:** `lib/scouting/**` and `lib/insights/**` import no `payload`, no `next/*` and no `lib/*-queries.ts` module (pure functions on plain rows; the loader and query modules are the only I/O).
  - **Seed constant:** the invented opposition player name is one exported constant in the seed module (`DEMO_OPPOSITION_PLAYER`), imported by the test. The test first asserts that name **exists in the database** (so it cannot pass vacuously on an empty seed) and only then greps public routes and the `match-facts` blob for its absence.
  - An anonymous request and a logged-out request are redirected; a `selector` user can load the page; an editor and admin can; REST `GET /api/match-appearances` as selector returns 403 (unchanged) and the page output never contains an opposition name when `showOppositionNames` is off; opposition names are absent from every public route's HTML and from the `match-facts` blob (a test decodes a blob and greps for a known opposition name); the staff-guard scan covers the new files.

### 3.7 Docs and seed

`docs/features/opposition-scouting.mdx` (persona: selectors and captains; not included: opposition players' results against other clubs, venue conditions, anything not recorded). Seed: the demo store already has 3 invented opponents over about 25 games; add enough tossed games with `tossChoice` and a few opposition appearances with batting and bowling lines (invented names only) so every section has data and one section shows the "not enough data" state.

### 3.8 Acceptance (local)

`PLAYHQ_CLIENT_ID= pnpm seed:demo` on `langlang_dev`, `pnpm dev -p 43xx`, sign in as the demo selector, open `/selector/scouting/<key>`; check at 360px and print preview; `pnpm vitest run tests/<scouting files>`; `curl` the page signed out and see the redirect.

## 4. WP-2: best XI suggester (#32)

### 4.1 Behaviour

On a game's team page the selector presses "Suggest an XI" and gets a proposal built by **ordered rules, not a score**:

1. **Pool:** the grade's squad for the current season (`squad-members`), minus hidden players. Availability for this game (`availability` rows): `in` first, then `maybe`, then no answer (treated as `maybe` when `treatNoAnswerAsMaybe` is on, the default; otherwise excluded). `out` is excluded and listed with the reason (the answer is visible to selectors only, which is the existing availability rule). A player already picked on the same day in another grade is excluded and listed ("Already in A Grade"). Selectors are club-wide (not scoped to a grade), so showing another grade's draft pick to a selector leaks nothing; this is stated in the doc. If grade scoping is ever added, that reason must degrade to "Unavailable" for grades the selector cannot see.
2. **Fill order:** keeper (if `requireKeeper`): the best available player whose effective role is keeper; then bowling options up to `minBowlers`; then batters up to `minBatters`; then the best remaining until the team size (`defaultXiSize` or the game's size). A pick can satisfy several needs (an all-rounder counts as batter and bowler), exactly as `balanceCounts` does.
3. **Ranking inside a need** uses an ordered tuple shown to the selector: availability tier, then "has enough recent data" (at least 3 innings or spells in the form window), then the role-relevant last-five line (batting: runs over the last 5 innings, bowling: wickets then runs conceded over the last 5 spells; the form window is fixed at 5, not a setting), then games played this season, then name. Batting and bowling lines come from `loadInsights` unchanged. A player with no stored games ranks below players with data and is explained as "No data".
4. **Explanation per pick:** a plain sentence built from those inputs, for example "Keeper (role set by selectors). In. Last five bats: 34, 12*, 0, 51, 8." and, for every reserve and exclusion, why not picked ("Out", "Already in A Grade", "Next bowler in line: 2 wickets in last five spells"). No adjectives that imply a score ("best", "form 8.2") are generated.
5. **Batting order:** suggested from each player's median stored batting position over the form window (`pos` from facts, `0` meaning no data), **only for players with at least `matchMinimums` innings (the same `minGames` threshold used elsewhere, default at least 3)**; a median of a handful of innings is weak, so below the threshold (one innings is not data) the player is placed last and marked "order not suggested". The order is labelled "from stored batting positions" and the rule is visible on the page. Captain is never suggested; the selector sets captain and keeper tags in the builder as today (the keeper pick pre-sets the keeper tag).
6. **Warnings and comparison:** the same `teamWarnings` function the builder and publish use runs on the suggestion; the page also shows the difference from the saved team (`diffSnapshots`: in, out, order changes).
7. **Overrides:** "Must play" and "Leave out" toggles per player re-run the rules (state in the query string, not stored; the proposal and its explanations say "Pinned by you" and "Left out by you"). Pinning an `out` player is allowed (selectors have the last word) and shows the usual warning. Pins and leave-outs are **validated server-side against the pool**: every id in `?pin=` / `?leave=` must belong to the current squad pool for this game's grade and not be hidden; ids not in the pool are ignored and hidden ids are never rendered (not as a name, a chip or an error echoing the id). Swapping the keeper is one tap.
8. **Apply:** "Use this XI" calls the existing `saveSheet` (`lib/selector-team-queries.ts`, exported, called from `app/(frontend)/selector/team-actions.ts`) with the page's `expectedRevision` (stale saves are refused as today). Checked in this branch: `saveSheet` creates the sheet or claims the next `revision` and writes slots in one transaction; it does not set `publishedAt`, create an announcement or notify; those live only in `publishSheets`. The suggestion module and its action import neither (a test asserts it). If the team is already published, the published snapshot stays public until a selector publishes again; the int test asserts that a previously published sheet **keeps its public snapshot (and `publishedAt`) unchanged after "Use this XI"** by reading the snapshot before and after.

### 4.2 Data model

No new collection. `selection-settings` gains a small group `xi` and a group `scouting` (section 3.5). The `xi` set is cut to what a volunteer committee will actually change; maybe-behaviour, a form-window length and similar knobs are over-engineering and are not built (the form window is fixed at 5).

| Field | Default (from `config/site.ts`) | Notes |
| --- | --- | --- |
| `xi.minBowlers` | 5 | Also read by `teamWarnings` (replaces the `MIN_BOWLERS` default). |
| `xi.minBatters` | 5 | Same (`MIN_BATTERS`). |
| `xi.requireKeeper` | true | Fills a keeper first and warns when none. |
| `xi.treatNoAnswerAsMaybe` | true | When off, players who have not answered are excluded. `maybe` always ranks after `in`. |
| `scouting.showOppositionNames` | true | WP-1; admin-only, club-wide. |
| `scouting.minInnings` | 2 | WP-1 danger list threshold. |

`warnings.ts` takes the rules as a parameter and **keeps `MIN_BOWLERS`/`MIN_BATTERS` exported as the defaults**, so every other importer found by the grep (4.1, section 0 item 6) and the old tests keep passing unchanged.

### 4.3 Migration

Made only if WP-2 ships (section 0 item 6). `e1_selection_rules`: nullable/defaulted columns on `"payload"."selection_settings"`, SQL function defaults only (club-neutral), schema-qualified, replayed by `pnpm check:migrations`. `payload-types.ts` and the import map regenerate and are committed.

### 4.4 Access per operation

| Operation | Public | Selector | Editor | Admin |
| --- | --- | --- | --- | --- |
| View suggestion page | no | yes | yes | yes |
| Apply as draft (server action, existing save path, `assertSelection`, revision check) | no | yes | yes | yes |
| Publish | unchanged: existing publish action, selector/editor/admin | | | |
| Read `selection-settings` (REST) | no | yes (`isSelection`, existing) | yes | yes |
| Change the rules | no | no | no (global is hidden from editors) | yes (admin update, existing) |
| `availability`, `squad-members`, `team-sheets` over REST | unchanged (staff only; selectors use the area) | | | |

### 4.5 Routes and UI

`/selector/teams/[gameId]/suggest` (inside the existing team route, `requireSelection`, noindex), linked from the builder; mobile layout is a vertical list of picks with a reason line each, then Reserves and Left out accordions, a sticky "Use this XI" bar. `selectorPaths.suggestFor(gameId)`.

### 4.6 Tests

- **Unit:** the ranking tuple (each tier), role needs satisfied by all-rounders, keeper required and absent, fewer available than the size, pins and exclusions, `maybe` and no-answer behaviours, ties broken by name, deterministic output for the same input, explanation text contains only recorded numbers, "No data" players never get zero lines, rules parameter flows into `teamWarnings`.
- **Int:** seeded squad and availability produce the expected XI; apply writes a draft with the right slots and does not touch `publishedAt` or announcements; a stale revision is refused; changing a rule in `selection-settings` changes the result; a hidden player is never suggested; a crafted `?pin=<id>` for a hidden player or a player from another grade is ignored and the id never appears in the HTML; a previously published sheet keeps its public snapshot and `publishedAt` after apply.
- **Security:** anonymous and unauthenticated server-action calls are refused; the suggestion module and its action never import publish, announce or social code (import-graph test); an editor cannot change the rules over REST while an admin can; `Boolean(user)` is absent from the new files (staff-guard scope).

### 4.7 Docs and seed

`docs/features/best-xi-suggester.mdx` and a short update to `team-selection-and-announce.mdx` (link, and the configurable balance numbers). Seed (`demo-selection.ts`): availability answers (in, maybe, out, none) for the upcoming demo fixtures across the squad, a role set for a keeper and bowlers, and enough stored games that most squad players have at least five innings or spells so the form lines are not empty; one new player with no games to show "No data".

### 4.8 Acceptance (local)

Seed, open the builder for an upcoming A Grade game, press Suggest, toggle a pin, Use this XI, confirm the team is a draft and nothing is public; change `xi.minBowlers` in Advanced > Selection settings (as admin) and see the result change; run the unit and int files above.

## 5. WP-3: trends and team analysis under Insights (#33, #34)

### 5.1 Navigation

One new entry `Insights` (`/stats/insights`) in `components/stats/stats-sub-nav.tsx`. `/stats/insights/...` already belongs to the Stats item in the site nav (`STATS_FAMILY` matches by `/stats` prefix; a navigation test is added to pin it). Inside Insights, a small second row (three in-page tabs, not a menu entry) switches between **Team analysis**, **Trends** and (WP-4) **Wickets**.

### 5.2 Player trends (#33), public

Route `/stats/insights/players/[slug]`, linked from the player profile ("Form and trends"):

- **Batting:** per-innings bars (runs; not-out marked with a mark and a label, ducks shown), a rolling average line over the last `INSIGHTS.rollingInnings` (default 5) **completed** innings, drawn only where the window has at least `INSIGHTS.minOuts` (default 3) dismissals; gaps are real gaps. Balls-based strike rate only when balls are recorded for the counted innings.
- **Bowling:** wickets and runs per spell, rolling economy over spells with balls and runs recorded.
- **Season against season:** a table of seasons (games, innings, runs, average or "not out", strike rate where recorded, wickets, economy where recorded) with `n` per cell, and a "compare with" picker (`?vs=<season>`). A direction label ("higher", "lower", "about the same") appears only when both seasons meet the existing `matchMinimums` and the difference exceeds a stated threshold (shown in the caption); otherwise "not enough games to compare".
- **#33 scope decision:** the issue's breakout/decline flags are delivered only as that labelled comparison with its threshold and sample sizes, not as a verdict. Milestone forecasts are **not built** (they would be extrapolation); the existing milestones page already shows who is approaching a milestone. Both are recorded as "not included" in the doc and left on #33.
- Hidden players, and players with fewer than `INSIGHTS.minGames` stored games, get no page content beyond "Not enough games stored yet". **A hidden player's slug returns 404** (not an empty page), and a player who hides themselves after the cache was built disappears through the existing hide/unhide tag expiry on the public stats tags (tested: build, hide, re-read).
- **Juniors.** Per-innings bars with dates and opposition labels are a privacy risk for minors. The stats layer already classifies grades (`GradeCategory`, including `junior`; public stats exclude juniors unless `?juniors=1` or the site default includes them, `lib/stats/categories.ts`, `lib/stats/query-string.ts`). Player trend pages **reuse that same classification and the existing profile's suppression**: per-innings detail (dates, opposition labels) is shown only for players whose counted games are in non-junior categories under the site's default categories; for a player with junior games only, the page shows season totals with no per-innings dates or opposition. Where the existing player profile already suppresses juniors differently, that behaviour wins and is copied exactly. If implementing finds no suppression the profile relies on, this is recorded as an **open question for the committee** and the default is adult grades only for Insights player pages. A test covers a junior-grade player (invented).

### 5.3 Team trends, public

On `/stats/insights`: last-ten results strip, average runs for and against per season, rolling average first-innings total, each with n and seasons capped by the existing `STATLAB_MAX_SEASONS` caption (`seasonCap`).

### 5.4 Team analysis (#34), public

Filters by season and grade (existing FilterBar and query-string helpers, labels through the rename map), computed in memory from the cached `FactSet` (club-side only; opposition shown by club label, which `/matches` already shows publicly; no opposition player names):

- **Results:** record; batting first against batting second (n each); record when winning the toss (toss data only where recorded); **margin distribution** in buckets set in `INSIGHTS.marginBuckets`, only for single-innings-each games (runs margin when the winner batted first, wickets-in-hand margin when the winner chased). "Winner batted first" comes from the stored `match-innings` rows (their `inningsNumber`/batting-side fields for the game), not from the toss; any game where the innings order is missing or ambiguous, multi-innings games and imported games go into "margin not comparable (n)". The first commit of WP-3 confirms the store has the order for every FINAL played game and records the count that does not. A bucket and any number is shown only at or above `INSIGHTS.minGames`.
  - **Deviation (recorded after the WP-3 review):** the build puts an imported game into a margin bucket when it has both innings totals and the totals fit the recorded result (section 1 says imports count wherever the field exists), instead of "margin not comparable" as written above. An import with no totals, or totals that contradict the result, is still not comparable. If imported innings order turns out to be unreliable, change `marginOf` to return `not comparable` for `source: import`.
- **Batting profile:** mean, highest, lowest completed total; all-out rate; mean wickets lost; extras per innings; fifties and hundreds; partnerships (existing inferred partnerships, labelled "inferred", with the existing coverage caveat).
- **Bowling profile:** mean runs conceded, how often the opposition was bowled out, wickets by dismissal type from `byType` (run outs separately), wides and no balls conceded per innings.
- **Par scores:** per grade, the median first-innings total in games won and in games lost, with n, **hidden below `INSIGHTS.minGames` (default 5 games in that bucket)** with the raw count shown instead; labelled "typical winning total", never "par" without the n.
- **Fielding:** catches and, where recorded, stumpings and run outs (the store holds only what the scorer entered; drops are not recorded, stated).
- **Post-match review** from #34 is not built (see 5.8).

### 5.5 Data model and caching

No new collection and **no change to the facts codec or cache key in WP-3**. (The `fow` field and the `['match-facts','v2',year]` bump belong to WP-4's FOW commit only, section 6.2; if WP-4's FOW pages are not built, the public stats hot path is never touched.) All insight pages call `getVisibleStatData`-style cached readers with the public stats tags, so a sync or a hide/unhide expires them like every other stats page. Pure functions in `lib/insights/*.ts` (`rolling.ts`, `season-compare.ts`, `margin.ts`, `team-profile.ts`, `par.ts`), no database or Next imports.

### 5.6 Access per operation

| Operation | Public | Token | Selector | Editor | Admin |
| --- | --- | --- | --- | --- | --- |
| View Insights, team analysis, a player's trends | yes (club-side aggregates and visible players only) | n/a | yes | yes | yes |
| Read `match-*` over REST | no | no | no | yes (existing) | yes (existing) |
| Any write | nobody | | | | |
| CSV/export | none in this wave | | | | |

### 5.7 Charts

`components/stats/trend-chart.tsx` (server component, pure SVG): bars and a line, scales computed from the data, axis labels from the data, series styled with `stroke-brand-*`/`fill-brand-*` classes written literally in source so Tailwind sees them, `currentColor` for axes, `role="img"` + `<title>` + `<desc>`, a "Show as table" `<details>`, dark-mode safe through the theme tokens, no hex (guard test), labels never colour-only. Reuse the layout approach of `progression-chart.tsx`.

### 5.8 Tests

- **Unit:** rolling window edges (fewer than window, all not out, zero dismissals gives gap), season compare thresholds and minimums, margin bucketing (runs, wickets, not comparable), toss splits with null toss, par score median with n, chart builder returns no NaN, empty and single-point series, null balls handling for strike rate and economy.
- **Int:** pages render against the seeded store; a hidden player's slug returns 404, a player hidden after the cache was built disappears, a junior-grade player's page shows no per-innings dates, and the player is absent from every aggregate that would reveal them; an imported game is counted only where its fields exist; grade labels follow renames.
- **Security:** no opposition player name in any insight HTML (grep a known demo name); no `/selector` data on public pages; the new routes have no write handler; the public pages cache entries do not contain names beyond visible club players.
- Existing `site-nav`/`navigation` tests extended: `/stats/insights/...` highlights Stats. `tests/no-brand-hex.test.ts` walks the roots `app`, `components`, `lib`, `payload`, `config`, so `components/stats/trend-chart.tsx` and `lib/insights/**` are already covered; a one-line assertion pins that those two paths are in the scanned file list. Wording on the pages says "compare seasons", never "form", and no direction label appears unless its threshold and minimums are met.

### 5.9 Docs and seed

`docs/features/insights-trends-and-team-analysis.mdx`; pointer lines in `match-stats.mdx`, `stats-leaderboards.mdx` (sub-nav), `players-directory-and-profiles.mdx` (link). Not included: forecasts, a post-match review, per-delivery anything (see WP-4), match-by-match opposition strength adjustment. Seed: the demo store spans two seasons; ensure at least one invented player has six or more innings in each season (for rolling lines and a season comparison) and one has too few (to show the empty state).

### 5.10 Acceptance (local)

Seed, open `/stats/insights`, a demo player's trends, change the grade and season filters, view at 360px and with the table toggle open, check no layout scroll, check dark mode, and run the files above.

## 6. WP-4: innings phases (#35)

### 6.1 Investigation (done in this spec; re-verified in the WP's first commit)

The question: does PlayHQ data for the club's grades carry ball-by-ball or over-level data?

Evidence, all from code and captured responses in this repo:

- `tests/fixtures/playhq/game-summary-one-day.json` (also the two-day, forfeit, abandoned and duplicate-period fixtures share the schema): the only per-delivery-adjacent fields are the innings statistic types `TOTALS`, `TOTAL_OUTS`, `TOTAL_EXTRAS`, `EXTRA_LEG_BYES`, `EXTRA_WIDES`, `EXTRA_BYES`, `EXTRA_NO_BALLS`, `EXTRA_PENALTY_RUNS`, `OVER_LIMIT`; per appearance a `statistics` list (runs, balls faced, fours, sixes, bowling figures, dismissals) and `displayOrder`; and `fallOfWickets[]` with exactly `sequenceNo`, `appearanceId`, `runs`.
- No over number, ball number, delivery list, timestamp, field-position or shot field exists anywhere in the response. The mapper (`lib/playhq/match-rows.ts`) stores everything the response offers; its `hasBallData` is computed as "some batter has `BALLS_FACED`", which is a batter total, not a delivery record.
- A bowler's balls and runs are totals per bowler per innings; bowling changes are not timed, so an over range per bowler cannot be derived (spells are not contiguous in general). Fall of wickets gives the team score at each wicket but not the over.
- `match-data-store.mdx` already records "Not available from PlayHQ and so never stored: ball-by-ball, over-by-over scores, powerplay or death-over phases, dot balls, wagon wheels and who was on strike".

Decision: **powerplay/middle/death phases, wagon wheels, strike rotation and dot-ball analysis cannot be derived honestly and are not built.** Any "phase" derived from, say, the fraction of the innings total would be an invented number. A "radar" over arbitrary normalised axes is also invented scaling; the existing Compare page already shows the real metrics side by side. The issue's own text ("Do not approximate") is followed.

Close-out artefacts:

- The spec section above, `docs/features/innings-phases.mdx` ("Not available from PlayHQ data": the field names above, the date checked, what would unblock it) and a one-line pointer in `match-data-store.mdx`.
- A unit test over the **stored fixtures** that fails if a fixture ever gains an over/ball/delivery key. It guards the fixtures only; it cannot detect a change in the live PlayHQ response (that would need a refreshed fixture). The doc says exactly that.
- **External decision (no credential built):** whether PlayHQ offers a ball-by-ball feed to the club's API tier, or the club wants live scoring in-house. Neither is assumed; if one appears, it enters through a new, env-gated adapter behind the same mapper seam and this WP is reopened.

### 6.2 What is built (optional; only what FOW supports)

**Sequencing.** Ship the close-out first (6.1: the "not available" doc, the match-data-store pointer, the fixture guard test). The fall-of-wicket pages below are modest value for a codec change, a cache bump, a new page and a seed addition, so they are built **only after WP-0, WP-1 and WP-3 are done**; the WP may legitimately end as one small documented page. `fow` and its cache bump are added in the FOW commit, not earlier.

On `/stats/insights/wickets` (public, club-side aggregates only, no names):

1. **Score at each wicket:** for a team, grade and season filter, the mean (and range) of the team score when wicket 1..10 fell, over innings with valid fall of wickets, with n per wicket and "N innings without fall of wickets excluded". Also the same for the opposition's innings against the club (a bowling view: how quickly we take wickets). Grouped by format: limited-overs and timed (two-day) games are **never averaged together**, because a score at wicket 3 means different things in 20 overs and over two days. Format comes from the stored match fields (innings count / overs limit / `OVER_LIMIT`), not from the grade name, and two-day games are excluded from this table (with the count shown) unless there are enough of them (`INSIGHTS.minGames`) to be their own group. Filtering by grade alone is not relied on, since grade does not always map to format.
2. **Collapse detection:** a collapse is `INSIGHTS.collapse.wickets` (default 4) wickets falling while the team adds at most `INSIGHTS.collapse.runs` (default 20) runs, computed from consecutive FOW entries; list count per season and the innings where it happened; the thresholds in use ("4 wickets for 20 runs or fewer") are printed on the page, since a collapse is a threshold, not a fact, (date, opponent label, link to the scorecard), for our batting and for the opposition's.
3. **Recovery stands:** reuse the existing inferred partnerships to show the biggest stand after a collapse, labelled "inferred".

Honesty rules: an innings counts only when FOW runs are non-decreasing and the wicket count matches `totalWickets` (the same validation `partnerships.ts` already applies; its reason codes are reused, and the count of rejected innings is shown). Scores at wickets are team scores, not over counts, and the page says so ("when" is never "in which over").

Data: a derived `fow: number[] | null` per played innings in the slim facts blob (runs at each wicket, no names), added **in this WP's FOW commit only**. The codec layout and the cache key version bump together (`['match-facts','v2',year]`), tags unchanged, one codec round-trip test updated. **Size:** at most 10 numbers per innings, about 40 to 60 bytes of JSON each innings before compression. With a few hundred innings a season that is tens of KB per season entry; the first FOW commit measures the encoded blob for the largest seeded season and for a synthetic `STATLAB_MAX_SEASONS` worst case and asserts it stays well under the Next data cache item limit (2 MB), recording the numbers in the commit. No collection, no migration.

### 6.4 Outcome (2026-10-13)

The investigation was re-run against every `game-summary-*` fixture and confirmed 6.1. One correction to the evidence list: innings-level statistics also include `TOTAL_SCORE` and `TOTAL_OVERS` (the totals the mapper already reads); neither is per over. The fixture guard is `tests/playhq-no-ball-data.test.ts`. The FOW pages were built after WP-0, WP-1, WP-2 and WP-3 were committed: `fow` and `fowReject` on the innings meta (`lib/stats/match/fow.ts`), cache key `['match-facts','v2',year]`, pure logic in `lib/insights/wickets.ts`, page `/stats/insights/wickets` (third Insights tab), thresholds in `INSIGHTS.fow`, demo game Round 23 with a collapse in both innings. Deviations from 6.2: the opposition "bowling view" uses the opposition's innings against the club (both sides' fall of wickets is derived from the batting rows of the innings); two-day games get their own table from `INSIGHTS.fow.minTimedGames` (3) games rather than `INSIGHTS.minGames`; a collapse is detected in every format and labelled with its format; the rejected-innings count shows the partnership reason text.

### 6.3 Access, tests, docs, seed

- **Access:** public read of aggregates, no writes, no staff-only data; REST unchanged.
- **Unit:** collapse detection boundaries (exactly N wickets, exactly M runs, overlapping windows counted once, unbroken innings), score-at-wicket means with missing FOW, invalid FOW rejected, codec round trip; the fixture guard test above.
- **Int:** the page renders from seeded innings with and without FOW; imported games excluded with the count.
- **Security:** no names in output; hidden-player partnerships stay null.
- **Docs:** `docs/features/innings-phases.mdx`. `tests/feature-docs.test.ts` requires `status: shipped` on every doc in `docs/features/` (no deferred status exists), so the doc is `shipped` and describes what exists: the close-out ("Not available from PlayHQ data", evidence, the date checked, the stored-fixtures guard) and, only if built, the FOW pages; the unbuilt parts sit under "Not included / deferred" with a link to #35, which stays open as "blocked on data". If the FOW pages are not built, `routes` lists none that do not exist (the test's route check is read before writing the frontmatter).
- **Seed (FOW commit only):** a few demo innings with FOW, one collapse, one with no FOW, including one two-day game to exercise the format grouping.
- **Acceptance:** seed, open `/stats/insights/wickets`, confirm the collapse list matches the seeded one; run the unit and int files.

## 7. Cross-cutting

**Club-name guard.** The print stylesheet and the OG-less selector pages take the club name from `getClub()`; a test greps the scouting and suggestion routes for any literal club name. `STATS_FAMILY` and the nav label "Insights" are neutral copy, grade labels go through `getLabelMap`.

**Admin classification.** No new collection or global in this wave; `tests/admin-visibility.test.ts` and the menu caps are unchanged (committee menu stays as is). New fields sit on `selection-settings`, which is `hiddenFromEditors` and under Advanced.

**Feature docs and index.** New: `opposition-scouting.mdx`, `best-xi-suggester.mdx`, `insights-trends-and-team-analysis.mdx`, `innings-phases.mdx`; updated: `team-selection-and-announce.mdx`, `match-stats.mdx`, `match-data-store.mdx`, `index.mdx`. Frontmatter keys (`title, status, routes, collections, admin, owner, related, added`) and the five required headings per `tests/feature-docs.test.ts`; describe only what is built.

**Seed.** Extend `payload/seed/demo-selection.ts` and the match seed as listed per WP; invented names only; idempotent; local database only.

**Security test summary.** Selector pages: redirect when signed out, 200 for selector/editor/admin. Public pages: no opposition name, no hidden player, no write route. REST: `match-*` stay staff-read, selectors still get 403. Import-graph test (also pins `lib/scouting/**` and `lib/insights/**` free of `payload`, `next/*` and `lib/*-queries.ts` imports): suggestion and scouting code import no publish, announce, email or social code and make no network call (`fetch` is stubbed to throw in these int files).

**Risks.**
- WP-0's TRUNCATE-per-file could hide a real shared-state bug that production hits. Mitigated by the leak detector (it still names offenders) and by keeping the migration check separate.
- Facts-layer change (`fow`, WP-4 FOW commit only, optional) invalidates cached blobs on deploy; the first public request recomputes (bounded by the season cap); the blob-size check in 6.2 guards the data cache limit.
- Opposition name matching is approximate; the UI says so and the setting can hide names.
- Fixture-to-opposition resolution by name can miss (renamed clubs); the fallback is an explicit "no stored games".
- Small samples: nearly all clubs have few games per grade; the design prefers showing counts to showing a number, so some panels will often read "not enough data". That is intended.
- `restoreMocks: true` may change `vi.fn(impl)` behaviour in old tests; adopt only if green (tried last).
- WP-0 may overrun; the 2.6 stop rule caps it and WP-1/WP-3 do not wait.

**Needs an external decision or credential.**
- Ball-by-ball or over data from PlayHQ for the club's API tier (ask PlayHQ or choose live scoring); nothing is built against it.
- Product choices with safe defaults, changeable in settings: show opposition names to selectors (default yes), whether no-answer counts as maybe in the XI, minimum balance numbers.
- No credential, token, mail, AI gateway or social network is touched by this wave.

**Final Verify (once, at the end of the wave).** `pnpm tsc --noEmit`, eslint on changed files, `pnpm generate` + `pnpm check:generated`, `pnpm check:migrations`, one full `pnpm vitest run`, one `pnpm build`, a manual pass of the acceptance steps per WP at 360px, light and dark.

## Appendix: review findings not adopted

- Finding 14 (another grade's draft leaking to a selector): no change to behaviour, because selectors are club-wide; recorded as a stated assumption in 4.1.
- Finding 18 (breakout/decline and forecasts): already handled by the spec; no change beyond the wording rule added in 5.8.
- Finding 22 (no-hex coverage): the guard already walks `app`, `components`, `lib`, `payload`, `config`; only a pin assertion was added.
- Finding 24 (menus), 27 (`hasBallData`): confirmed accurate, no change.
- Finding 13/30 wording "same `minGames`": the repo's existing setting is `matchMinimums`; the spec uses that name for players and `INSIGHTS.minGames` for team figures, with a default of 3 for the batting-order threshold.
- Finding 3: a rate limiter is deliberately not specified (rationale in 3.2).
- Finding 5: the baseline-schema design is dropped in favour of the migrate-then-sentinel check, conditional on the sentinel passing; if it ever fails, a new decision is needed, not a silent baseline.
