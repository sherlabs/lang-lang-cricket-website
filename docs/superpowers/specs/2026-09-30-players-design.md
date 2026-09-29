# Players — active & past player lists and profiles

## Context

The History page (`/history`) tells the club's story and lists published Stories. The club
wants a **Players** section there: every senior player, split into **Active** and **Past**,
each linking to a profile page with their club contribution and career stats.

Player data comes from PlayHQ (see `2026-09-16-playhq-integration-design.md`). Constraints
from that integration:

- PlayHQ's public API has **no roster endpoint and no stable player id**. Players exist only
  as per-game appearances (`firstName`, `lastName`, per-game `id`). The existing
  `aggregatePlayers` (`lib/playhq/players.ts`) already identifies a player within a team by
  `${firstName}|${lastName}` lower-cased — the same key is used here, club-wide.
- PlayHQ covers only the seasons since the club moved onto it (~14 seasons across all
  competitions). Earlier players are not in it.
- Junior players are shown only as "Jack S." for child safety.

Building career stats needs every FINAL scorecard of every senior season — hundreds of API
calls on a cold cache — so stats are synced into the DB rather than fetched live on page
render.

## Goals

1. `/history` shows a Players section (after Stories) with Active and Past sub-sections.
2. Each player has a profile page: photo, club contribution (seasons/grades played, honours,
   bio) and career + per-season batting and bowling stats.
3. Club admin can upload/crop a player photo, write a bio, manage honours, override
   active/past, hide a player, merge duplicate identities, and add pre-PlayHQ past players.
4. Player stats stay current without admin effort (daily sync) and can be refreshed on demand.

## Non-goals

- Junior players (never synced, never listed, no profile, no photo).
- Manually-entered stats for pre-PlayHQ players.
- Linking stories to players.
- Player self-service editing.

## Decisions

| Decision | Choice |
|---|---|
| Who is included | Seniors only — players appearing in senior-competition seasons. Junior appearances are ignored entirely. |
| Pre-PlayHQ players | Admin-created "manual" players: name, photo, years text, bio, honours. No stats. |
| Club contribution | Auto: seasons and grades played (from PlayHQ). Admin: honours/roles list and bio. |
| Stats method | Same as fixtures season stats: `aggregatePlayers` per team per season, stored per season × team, summed for career. |
| Active rule | Played in the latest or previous senior season group. Admin override (`active` / `past`) wins. Manual players are always Past unless overridden. |
| Data approach | DB sync (tables below), admin button + daily Vercel cron. Live fetch rejected: index page would need a full scan of all seasons on every cold cache. |
| Identity | Name key via `player_aliases`; admin merge folds duplicates ("Jon Smith" + "Jonathan Smith") and survives future syncs. |

## Data model (`db/schema.ts`, applied with `npm run db:push`)

```
players
  id              serial pk
  slug            text unique not null
  firstName       text not null
  lastName        text not null
  photoUrl        text null
  bio             text null            -- plain text, paragraphs split on blank lines
  source          text not null        -- 'playhq' | 'manual'
  manualYears     text null            -- manual players only, e.g. "1978–1992"
  activeOverride  text null            -- null | 'active' | 'past'
  isActiveDerived boolean not null default false   -- set by sync
  hidden          boolean not null default false
  createdAt, updatedAt timestamps

player_aliases
  nameKey   text pk                   -- `${first}|${last}` lower-cased, trimmed
  playerId  integer not null → players.id (cascade delete)

player_honours
  id, playerId → players.id (cascade), years text not null, title text not null, sortOrder integer not null default 0

player_seasons
  id, playerId → players.id (cascade)
  seasonName   text not null          -- SeasonGroup.name, e.g. "Summer 2025/26"
  seasonOrder  integer not null       -- 0 = newest season group; used for sort + active rule
  teamId       text not null          -- PlayHQ team id
  teamName, gradeName (null ok)
  games, batInnings, batNotOuts, batRuns, batHighScore, batHighScoreNotOut (bool), batBalls, batFours, batSixes,
  bowlBalls, bowlMaidens, bowlRuns, bowlWickets, bowlBestWickets, bowlBestRuns, catches   -- integers
  unique (playerId, teamId)

player_sync_runs
  id, startedAt, finishedAt null, status text ('running'|'ok'|'error'), playersCreated int, seasonRows int, error text null
```

Derived values (averages, strike rate, economy, overs string) are computed at read time from
the stored raw counts, using the existing helpers in `lib/playhq/players.ts`
(`ballsToOvers`, same rounding) so they match the fixtures stats tables exactly. The helpers
get extracted to shared functions rather than duplicated.

## Sync (`lib/players/sync.ts`)

`syncPlayers(): Promise<SyncResult>`

1. Refuse if a `player_sync_runs` row is `running` and started < 10 min ago (concurrent
   admin click + cron). Otherwise insert a `running` row.
2. `getSeasonGroups()` → keep groups whose seasons are senior (`!isJunior`), newest first;
   assign `seasonOrder` by index. Only the senior seasons inside each group are walked.
3. For each group: `getClubTeams` → senior teams → `getTeamGames` → FINAL games →
   `getGameSummary(id, false, 'FINAL')` with `mapLimit(…, 5)` (7-day fetch cache makes
   completed seasons cheap on repeat runs) → `aggregatePlayers(scorecards, team.id)`.
4. Pure step `buildSyncPlan(aggregates, existingAliases)` (unit-tested): resolves each
   `PlayerSeasonStats.key` via aliases; unknown keys become new players (name from
   title-cased appearance names, slug via `slugify` with `-2`, `-3` dedupe against existing
   slugs); produces `player_seasons` rows and each player's `isActiveDerived`
   (`min(seasonOrder) <= 1`).
5. Write: insert new players + aliases; delete all `player_seasons` rows; insert the new
   rows; update `isActiveDerived` for every `source = 'playhq'` player (false when they have
   no rows). Photo, bio, honours, override, hidden and manual players are never written.
6. Mark run `ok` with counts, or `error` with message (caught, logged, run row updated).
7. `revalidatePath('/history')`, `/history/players`, `/history/players/[slug]`.

`aggregatePlayers` needs the raw first/last name for new players, not only the display name —
`PlayerSeasonStats` gains `firstName` / `lastName` fields.

### Triggers

- **Admin**: "Sync from PlayHQ" button on `/admin/players` → server action (session-cookie
  guard as in `app/admin/(shell)/playhq/actions.ts`) → `syncPlayers()`; shows result counts.
- **Cron**: `app/api/cron/players-sync/route.ts` `GET` — requires
  `Authorization: Bearer ${CRON_SECRET}`, else 401. New `vercel.json`:
  `{"crons":[{"path":"/api/cron/players-sync","schedule":"0 17 * * *"}]}` (≈3–4am
  Melbourne). `export const maxDuration = 300`. `CRON_SECRET` must be set in Vercel env.

## Queries (`lib/players/queries.ts`)

- `listPlayersForHistory()` → `{ active: PlayerCard[], past: PlayerCard[] }`, excluding
  hidden. `PlayerCard` = slug, name, photoUrl, yearsLabel, grades (distinct gradeName/teamName),
  sort key. Active sorted by name; Past sorted by most recent season then name (manual
  players last, by name).
- `getPlayerProfile(slug)` → player + honours (by sortOrder) + seasons (newest first) +
  career totals; `null` if missing or hidden.
- `yearsLabel`: manual → `manualYears`; playhq → first–last season years derived from season
  names (e.g. "2019/20 – 2025/26"), single season shown alone.
- `isActive(player)` = `activeOverride ? activeOverride === 'active' : isActiveDerived`.

All public pages call `noStore()` like `/history`, since they read Neon.

## Pages

### `/history` (edit `app/history/page.tsx`)

After the Stories section, a **Players** section styled like Stories (display heading + rule):
- "Active players" sub-heading + responsive card grid (all active players).
- "Past players" sub-heading + grid capped at 12, with "See all past players" →
  `/history/players#past` when more exist.
- Section omitted entirely when there are no players.

Card (`components/players/player-card.tsx`): square photo or initials avatar on brand-stone,
name, years label, grades line; links to profile.

### `/history/players` (`app/history/players/page.tsx`)

`PageHeader` + full Active and Past grids (no cap).

### `/history/players/[slug]` (`app/history/players/[slug]/page.tsx`)

- Header: photo, name, Active/Past badge, years label, grades played.
- Career tiles (PlayHQ players with seasons): Games, Runs, HS, Bat avg, Wickets, Best,
  Catches.
- "About" — bio paragraphs (if any).
- "Honours & roles" — list of `years · title` (if any).
- "Season by season" — Batting table (Season, Team, M, Inns, NO, Runs, HS, Avg, SR, 4s, 6s)
  and Bowling table (Season, Team, O, M, R, W, Best, Avg, Econ), plus Ct in batting table.
  Reuses the table styling in `components/playhq/player-stats-tables.tsx`. Rows only for
  seasons with that discipline's activity.
- `notFound()` for unknown or hidden slug. `generateMetadata` → "<Name> | Lang Lang Cricket Club".

Route note: `app/history/players` is a static segment and wins over the story route
`app/history/[slug]`; `players` is added to the reserved slugs in story slug generation so a
story can never be shadowed.

## Admin

New nav item **Players** in `components/admin/admin-nav.tsx`.

- `/admin/players` — sync panel (last run time, status, counts, error; "Sync from PlayHQ"
  button), filter tabs All / Active / Past / Hidden, name search, table rows with thumbnail,
  name, source, years, status, edit link. "Add past player" button.
- `/admin/players/new` — manual player form: first name, last name, years text, photo, bio,
  honours, active override.
- `/admin/players/[id]` — edit: photo (`PhotoUploadField`: square crop → Blob), first/last
  display name (playhq players may fix capitalisation; aliases unchanged), bio, honours rows
  editor (add/remove/reorder), active override (Auto / Active / Past), hidden toggle,
  read-only list of aliases and seasons, **Merge into…** (picker of other players, confirm).
  Manual players can be deleted.
- Merge action (`mergePlayers(sourceId, targetId)`): move aliases and `player_seasons` to
  target (on (playerId, teamId) conflict, sum counts — the same person was split across two
  name spellings in one team); copy photo/bio if target lacks them; append source honours;
  target `isActiveDerived = source || target`; delete source. Revalidate public paths.

All actions use the existing admin session guard and `lib/crud.ts` patterns as in
announcements/sponsors.

## Error handling

- Sync failure: recorded in `player_sync_runs`, shown on admin page; public pages keep
  serving the last good data (writes happen only after all PlayHQ fetches succeed).
- A PlayHQ failure for one team aborts the run (no partial delete of `player_seasons`).
- Public pages with DB errors fall through to `app/error.tsx` as elsewhere.

## Testing (vitest, `tests/`)

- `players-sync-plan.test.ts` — `buildSyncPlan`: alias resolution, new player + slug dedupe,
  season rows, `isActiveDerived` by seasonOrder, merged aliases map to one player.
- `players-queries.test.ts` — active/past split with overrides + hidden, years label,
  career totals and derived stats match `aggregatePlayers` formulas.
- `players-admin-actions.test.ts` — auth guard, update, honours, merge (conflict summing,
  photo carry-over), manual create/delete.
- `players-cron-route.test.ts` — 401 without/wrong secret, runs sync with correct secret,
  refuses while a run is in progress.
- Extend `tests/playhq` for `aggregatePlayers` exposing first/last name.
