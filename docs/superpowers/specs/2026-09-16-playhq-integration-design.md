# PlayHQ integration — live fixtures, results, scorecards, teams & players

## Context

PlayHQ has issued Lang Lang Cricket Club a **public API key** (x-api-key / "Client ID",
tenant `ca`, host `api.playhq.com`). It grants read-only access to the club's public data:
seasons, teams, fixtures, ladders and full cricket game summaries (scorecards). The key is
stored in `.env.local` as `PLAYHQ_CLIENT_ID` and must also be set in Vercel project env.

This replaces the admin-entered `fixtures` table introduced in the 2026-09-04 redesign
(which was explicitly a stopgap until PlayHQ access existed).

### Verified API facts (probed 2026-09-16)

- `GET /v1/organisations/{orgId}/seasons` — 14 seasons across 5 competitions (CCCA Junior,
  CCCA Senior, Kookaburra Cup, U15 All Star Girls, Junior Winter). Seasons of different
  competitions share a display name (e.g. "Summer 2026/27" exists for Junior, Senior and
  Girls). Status ∈ `UPCOMING | ACTIVE | COMPLETED`.
- `GET /v1/seasons/{id}/teams` — **all** teams in the season (association-wide), cursor
  paginated at 100 (`metadata.nextCursor`, e.g. `MTAw`). Filter by
  `team.club.id === orgId`. `team.grade` is `null` until the association grades the team.
- `GET /v1/teams/{id}/fixture` — every game for that team: `status`, `round`, `schedule`
  (`date`, `time`, `timezone: Australia/Melbourne` — local strings), `competitors[]`
  (`id`, `name`, `isHomeTeam`, `outcome`, `scoreTotal`), `venue`, PlayHQ `url`,
  `updatedAt`. `scoreSubTotal` is empty for cricket (no wickets here).
- `GET /v2/grades/{id}/ladder` — `ladders[].headers[]` (key/name/shortName) +
  `ladders[].ladder[]` rows with team + stats.
- `GET /v2/games/{id}/summary` — full scorecard: `teams[]` (with `organisation.id`),
  `appearances[]` (per-game `id`, `firstName`, `lastName`, `teamId`, `visible`, `isFillIn`,
  `captainRole`), `periods[]` (`FIRST_INNINGS`/`SECOND_INNINGS`, each with two `teams[]`
  entries: `discipline` BATTING|BOWLING, `status` (ALL_OUT|DECLARED|END_OF_GAME|…),
  team `statistics` (TOTAL_SCORE, TOTAL_OUTS, TOTAL_OVERS, TOTAL_EXTRAS, EXTRA_*),
  `appearances[]` with per-player `statistics` (batting: TOTAL_RUNS, BALLS_FACED, FOURS,
  SIXES, STRIKE_RATE, status OUT|NOT_OUT|DID_NOT_BAT; bowling: OVERS, MAIDENS, RUNS,
  WICKETS, ECONOMY, WIDES, NO_BALLS), `fallOfWickets[]`), `sharedStatistics[]` per period
  (dismissal events: `type` CAUGHT|BOWLED|LEG_BEFORE_WICKET|… with `appearances[]` each
  tagged `role` BATTING|BOWLING|FIELDING), `coinToss`, `playingSurfaces[].venue`.
- `GET /v2/grades/{id}/fixture` returns 404 for this tenant — not needed; per-team fixture
  covers every Lang Lang game.
- **No roster / player endpoint.** Players are only knowable from game appearances.
  Appearance ids are per-game; there is no stable player id in public data.
- No rate-limit headers returned. Limits unknown — design assumes they exist.

Current state (2026/27 UPCOMING): 7 Lang Lang teams — Senior: B Grade, D Grade, E Grade,
One Day; Junior: 10's Black, 12's, U14 Mixed. B and D already have draws; others empty.

## Goals

1. Fixtures page shows live upcoming games and results for every Lang Lang team, any season.
2. Full scorecard page per completed game.
3. Teams page and per-team page with ladder, fixtures/results and season player stats.
4. Zero new infrastructure: no DB tables, no cron. Live fetch + Next.js data cache.
5. Child-safety: junior players never shown by full name.

## Non-goals

- Player profile pages or cross-season player records (no stable player id).
- Games not involving a Lang Lang team.
- Home page fixture widgets (can be added later using the same loaders).
- Any PlayHQ write access.

## Decisions

| Decision | Choice |
|---|---|
| Player names | Seniors: full name. Juniors: first name + last initial ("Jack S."). `visible: false` appearances are omitted entirely. |
| Manual fixtures | Deleted: `fixtures` table, `app/admin/fixtures/*`, admin nav link. |
| Seasons | Season picker over all seasons; grouped by season **name** (spans competitions). |
| Team page depth | Ladder + fixtures/results + aggregated player batting/bowling/fielding stats. |
| Data layer | Live fetch via Next `fetch` cache (approach A). DB sync rejected: Vercel Hobby cron is once/day, too stale for weekend results, and adds tables + sync code. |

Junior/senior classification is per **season** (competition): junior if competition name
matches `/junior|u1\d|girls|winter/i`. Every team inherits it from its season.

## Architecture

### `lib/playhq/` module

- **`client.ts`** — `phqFetch<T>(path, { revalidate, tags })`. Adds `x-api-key`
  (`PLAYHQ_CLIENT_ID`), `x-phq-tenant` (`PLAYHQ_TENANT`, default `ca`), `accept`. Passes
  `next: { revalidate, tags: ['playhq', ...tags] }`. `phqFetchAll` loops
  `metadata.nextCursor` (`?cursor=`). Non-2xx → throws `PlayHQError(status, path)`.
  Concurrency helper `mapLimit(items, 5, fn)` for fan-out.
- **`types.ts`** — raw API shapes (minimal, only fields used) and domain types:
  `SeasonGroup`, `ClubTeam`, `Game`, `Scorecard`, `Innings`, `BattingLine`, `BowlingLine`,
  `Ladder`, `PlayerSeasonStats`.
- **`mappers.ts`** — pure functions, no I/O:
  - `groupSeasons(raw[]) → SeasonGroup[]` sorted newest first; `pickDefaultSeason(groups)`
    = first with any ACTIVE season, else UPCOMING, else newest COMPLETED.
  - `mapGame(rawFixtureGame, clubOrgId) → Game` (home/away split, LL side identified by
    competitor id ∈ club team ids, local date/time strings kept verbatim).
  - `mapScorecard(rawSummary, clubOrgId) → Scorecard`: innings ordered by `sequenceNo`;
    batting lines from BATTING-side appearances ordered by `displayOrder`; dismissal text
    derived from `sharedStatistics` where the batter appears with role BATTING
    (`c Fielder b Bowler`, `b Bowler`, `lbw b Bowler`, `run out`, `st Keeper b Bowler`,
    …; NOT_OUT → `not out`; DID_NOT_BAT → omitted from table, listed as "Did not bat");
    bowling lines from BOWLING-side appearances with any OVERS stat; extras breakdown,
    total `X/Y (Z ov)` or `Y (all out, Z ov)`, declared flag, FOW `1-96 (Name)`.
  - `resultSentence(game, scorecard?) → string`, e.g.
    `Lang Lang B Grade 83 lost to Nar Nar Goon B Grade 4/237 (dec) on first innings`.
    Uses wickets from scorecard when available, else totals only from fixture.
  - `aggregatePlayers(scorecards[], teamId) → PlayerSeasonStats[]` keyed by
    `${firstName}|${lastName}` lower-cased: batting Inns, NO, Runs, HS (with `*`), Avg,
    SR; bowling Overs, Mdns, Runs, Wkts, Best (`w/r`), Avg, Econ; catches. Only FINAL
    games. Overs arithmetic in balls (`13.3` = 81 balls).
  - `mapLadder(raw) → Ladder` (headers + rows, LL rows flagged).
- **`names.ts`** — `displayName({ firstName, lastName }, isJunior)`.
- **`queries.ts`** — composed loaders used by pages (all `async`, all cached via fetch):
  - `getSeasonGroups()` — 6h.
  - `getClubTeams(seasonGroup)` — teams across every season in the group, filtered to club;
    6h.
  - `getTeamGames(teamId)` — 30 min.
  - `getGame(gameId, status?)` — summary; `revalidate` is 7 days when the caller passes
    `status === 'FINAL'` (known from the fixture list), else 15 min. The scorecard page,
    which has no fixture context, calls with no status (15 min) — acceptable.
  - `getLadder(gradeId)` — 1 h.
  - `getTeamPlayerStats(teamId, games)` — fans out `getGame` over FINAL games with
    `mapLimit(…, 5)`, then `aggregatePlayers`.
  - `getClubGames(seasonGroup)` — all teams' games merged, de-duplicated by game id
    (LL-vs-LL games appear in two team fixtures).

Env: `PLAYHQ_ORG_ID`, `PLAYHQ_CLIENT_ID`, `PLAYHQ_TENANT`. `PLAYHQ_CLIENT_SECRET` and the
`getPlayHQAccessToken` stub are removed.

### Caching

Next.js data cache (persisted on Vercel across requests/instances) does the work. Pages
declare `export const revalidate = 1800` so rendered HTML is ISR'd too. Cache tag
`playhq` on every fetch enables one-click invalidation.

Cold team-page load ≈ 1 fixture call + up to ~14 summary calls (capped at 5 concurrent);
warm loads hit no API. Fixtures page ≈ 7 fixture calls cold.

### Admin

`/admin/playhq` — shows nothing but a "Refresh PlayHQ data" button (server action →
`revalidateTag('playhq')` + `revalidatePath` for `/fixtures`, `/teams`). Added to admin
nav in place of Fixtures. Lets the committee force-refresh after weekend results.

### Error handling

- Any loader failure at page level is caught per section: the section renders
  `<PlayHQUnavailable />` (short message + link to the club's PlayHQ page); the rest of the
  page still renders. Errors are `console.error`ed with path + status.
- `/fixtures/[gameId]` → `notFound()` when the game 404s or has no Lang Lang team.
- `/teams/[teamId]` → `notFound()` when the team isn't a club team in any season.
- Missing env vars → loader throws at call time; same unavailable panel.

## Pages

Season selection is a `?season=<name>` query param (URL-encoded season name, e.g.
`Summer 2026/27`); missing/unknown → default season. Team filter `?team=<teamId>`.

| Route | Content |
|---|---|
| `/fixtures` | `PageHeader` as today. Season picker + team chips (All / each club team in season, grouped Senior/Junior). Two columns: **Upcoming** (status ≠ FINAL, ascending by date/time; card: date block, team name eyebrow, "vs Opponent" with home/away marker, round, grade, time, venue) and **Results** (FINAL, descending; card: team eyebrow, "vs Opponent", result sentence, round, date; whole card links to `/fixtures/[gameId]`). Empty states keep the PlayHQ links. |
| `/fixtures/[gameId]` | Scorecard. Header: grade, round, date (Melbourne), venue, toss ("Lang Lang won the toss and elected to bowl"), result sentence, link to PlayHQ game centre. One section per innings: batting table (Batter, dismissal, R, B, 4s, 6s, SR), "Did not bat" line, Extras breakdown, Total, Fall of wickets; bowling table (Bowler, O, M, R, W, Econ). Names via `displayName` with the game's season junior flag. Non-FINAL game → header + "Scorecard available after the match" note. |
| `/teams` | Season picker. Club teams grouped Senior / Junior. Card: team name, grade (or "Grade not yet assigned"), ladder position + W-L-N/R if graded, next fixture (date + opponent) or last result. Links to `/teams/[teamId]`. |
| `/teams/[teamId]` | Header: name, season, grade. Sections: **Ladder** (full grade table, LL row highlighted; hidden if no grade), **Fixtures & results** (same cards as `/fixtures`, this team only), **Players** — batting table and bowling table (see `aggregatePlayers`), catches column; sorted by runs / wickets desc; note "Stats from N completed games". Hidden with a note if no FINAL games. |

**Nav**: add `Teams` (`/teams`) after `Fixtures & Results` in `site-nav.tsx` and
`site-footer.tsx`.

**Components** (`components/playhq/`): `season-picker.tsx` (client; `<select>` that
pushes `?season=`), `team-filter.tsx`, `game-card.tsx` (upcoming + result variants),
`ladder-table.tsx`, `scorecard-innings.tsx`, `player-stats-tables.tsx`,
`playhq-unavailable.tsx`. Built on existing `ui/table`, `page-header`, brand tokens; same
card language as the current fixtures page. No new design system.

**Dates**: always formatted with `timeZone: 'Australia/Melbourne'` (`Intl.DateTimeFormat`,
`en-AU`). Local date/time strings from the fixture are combined into an ISO string with the
Melbourne offset only for sorting/"is upcoming" checks; display uses the local strings.

## Testing

Vitest, `tests/playhq/`. Real API responses captured during the probe are committed as
fixtures in `tests/fixtures/playhq/` (`seasons.json`, `teams-page1.json`,
`team-fixture.json`, `game-summary-two-day.json`, `ladder.json`) — personal names inside
belong to senior games only.

Unit tests (TDD, written before implementation):
- `groupSeasons` / `pickDefaultSeason` — grouping by name, ordering, default choice for
  ACTIVE/UPCOMING/COMPLETED mixes.
- `mapGame` — home/away, LL side detection, LL-vs-LL game, null grade, null venue.
- `mapScorecard` — innings order, batting order, every dismissal type string, not out,
  did-not-bat, extras, totals/declared, FOW, bowling lines only for bowlers who bowled.
- `resultSentence` — won/lost/tied/no-result/upcoming, with and without scorecard.
- `aggregatePlayers` — averages with not-outs, HS with `*`, overs-to-balls arithmetic,
  best bowling, catches, ignores non-FINAL games and invisible appearances.
- `displayName` — senior vs junior, single-character last names, missing last name.
- `phqFetchAll` — cursor pagination loop (mocked `fetch`).

Pages verified by `next build` (type-check) and manual browser check of all four routes in
the 2025/26 season (completed, full data) and 2026/27 (upcoming, partial data).

## Rollout

1. Add `PLAYHQ_CLIENT_ID`, `PLAYHQ_TENANT` to Vercel env.
2. Deploy; drop `fixtures` table via `drizzle-kit push` after deploy.
3. Committee note: "Refresh PlayHQ data" button in admin.
