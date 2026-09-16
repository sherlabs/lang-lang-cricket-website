# PlayHQ Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual fixtures table with live PlayHQ data: fixtures, results, scorecards, teams, ladders and season player stats.

**Architecture:** `lib/playhq/` holds a thin cached fetch client, pure mappers (TDD'd against real API responses in `tests/fixtures/playhq/`), and composed loaders. Server-component pages under `app/fixtures` and `app/teams` call the loaders; Next.js data cache + ISR provide caching; an admin button invalidates the `playhq` cache tag.

**Tech Stack:** Next.js 14 App Router (TypeScript), Tailwind, Hugeicons, vitest. No DB changes except dropping `fixtures`.

**Spec:** `docs/superpowers/specs/2026-09-16-playhq-integration-design.md`

## Global Constraints

- Env: `PLAYHQ_ORG_ID` (=`484ced51-403a-466c-9a94-bd95eedf7319`), `PLAYHQ_CLIENT_ID`, `PLAYHQ_TENANT` (default `ca`). Never log or commit the key. Remove `PLAYHQ_CLIENT_SECRET`.
- Host: `https://api.playhq.com`. Headers: `x-api-key`, `x-phq-tenant`, `accept: application/json`.
- Junior season = competition name matches `/junior|u1\d|girls|winter/i`. Junior player names → `First L.`; `visible === false` appearances omitted.
- All date display uses `timeZone: 'Australia/Melbourne'`, locale `en-AU`.
- Every PlayHQ fetch carries cache tag `playhq`.
- Tests: `pnpm vitest run <file>` while iterating; full `pnpm vitest run` + `pnpm build` once at the end of each task group.
- Styling: reuse brand classes already used in `app/fixtures/page.tsx` (`display`, `eyebrow`, `container-site`, `shadow-card`, `bg-brand-*`, `text-brand-*`, `rounded-2xl`). Icons via `HugeiconsIcon` from `@hugeicons/react` + `@hugeicons/core-free-icons`.
- Commit after each task (messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`). Do not commit unrelated pre-existing changes in `app/admin/gallery`, `public/assets/gallery`, `scripts/seed.ts`, `.gitignore`, `package.json` — stage only your files.

## Test fixtures (already captured, real API responses)

| File | Endpoint | Notes |
|---|---|---|
| `tests/fixtures/playhq/seasons.json` | `/v1/organisations/{org}/seasons` | 14 seasons, 5 competitions |
| `tests/fixtures/playhq/teams-senior-2025-26.json` | `/v1/seasons/04518c8e-…/teams` | 68 teams, `hasMore:false`; 2 LL teams: `61e6c836-…` "Lang Lang B Grade" (grade `0d6f1f07-…` "4. Senior Men B Grade"), `4398ce96-…` "Lang Lang One Day" |
| `tests/fixtures/playhq/team-fixture-b-grade-2025-26.json` | `/v1/teams/61e6c836-…/fixture` | 14 games; statuses FINAL + ABANDONED (Round 11); outcomes WON/LOST/WON_ON_FIRST_INNINGS/LOST_ON_FIRST_INNINGS/ABANDONED |
| `tests/fixtures/playhq/team-fixture-one-day-2025-26.json` | `/v1/teams/4398ce96-…/fixture` | includes WON_BY_FORFEIT / LOST_BY_FORFEIT |
| `tests/fixtures/playhq/team-fixture-b-grade-2026-27.json` | `/v1/teams/9ad1241c-…/fixture` | 14 UPCOMING games; competitors have **no** `outcome`/`scoreTotal` keys |
| `tests/fixtures/playhq/game-summary-two-day.json` | `/v2/games/a65c84a6-…/summary` | `type: twoDay`, 4 periods, LL `LOST_ON_FIRST_INNINGS` 83 vs 4/237 dec |
| `tests/fixtures/playhq/game-summary-one-day.json` | `/v2/games/4821fdce-…/summary` | `type: oneDay`, 2 periods, LL One Day WON |
| `tests/fixtures/playhq/ladder-b-grade-2025-26.json` | `/v2/grades/0d6f1f07-…/ladder` | `ladders[0].headers[]`, `ladders[0].standings[]` (`team`, `values[]` aligned to headers) |

Raw shape reminders (see spec "Verified API facts"): fixture `schedule.date` `"2025-10-25"`, `schedule.time` `"13:00:00"`; summary `periods[].teams[].discipline` BATTING|BOWLING, batting appearance `status` OUT|NOT_OUT|DID_NOT_BAT, `statistics[] {type,value}`; `sharedStatistics[] {type: CAUGHT|BOWLED|LEG_BEFORE_WICKET|…, appearances[] {id, role: BATTING|BOWLING|FIELDING}}`; team `statistics` TOTAL_SCORE, TOTAL_OUTS, TOTAL_OVERS, TOTAL_EXTRAS, EXTRA_WIDES, EXTRA_NO_BALLS, EXTRA_BYES, EXTRA_LEG_BYES, EXTRA_PENALTY_RUNS; team `status` ALL_OUT|DECLARED|END_OF_GAME|null.

---

### Task 1: Types + cached client with pagination

**Files:**
- Create: `lib/playhq/types.ts`, `lib/playhq/client.ts`
- Test: `tests/playhq/client.test.ts`
- Modify: `lib/playhq.ts` → delete (stub replaced by directory)

**Interfaces — Produces:**
```ts
// lib/playhq/client.ts
export class PlayHQError extends Error { constructor(public status: number, public path: string) }
export type FetchOpts = { revalidate: number; tags?: string[] }
export function phqFetch<T>(path: string, opts: FetchOpts): Promise<T>          // returns parsed JSON body
export function phqFetchAll<T>(path: string, opts: FetchOpts): Promise<T[]>     // follows metadata.nextCursor, concatenates .data
export function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]>
export const PLAYHQ_ORG_ID: string  // from env
```

- [ ] **Step 1: Write `lib/playhq/types.ts`** — raw API types (only used fields) and domain types:

```ts
// ---- raw API ----
export type RawSeason = { id: string; name: string; status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'; competition: { id: string; name: string }; association: { id: string; name: string } }
export type RawTeam = { id: string; name: string; club: { id: string; name: string }; grade: { id: string; name: string; url?: string } | null }
export type RawCompetitor = { id: string; name: string; isHomeTeam: boolean; outcome?: string; scoreTotal?: number }
export type RawFixtureGame = {
  id: string; status: string; url: string; updatedAt: string
  grade: { id: string; name: string } | null
  round: { id: string; name: string; abbreviatedName: string; isFinalRound: boolean } | null
  schedule: { date: string; time: string | null; timezone: string } | null
  competitors: RawCompetitor[]
  venue: { name: string; surfaceName?: string; address?: { suburb?: string } } | null
}
export type RawStat = { type: string; value: number }
export type RawAppearance = { id: string; firstName: string; lastName: string; teamId: string; visible: boolean; roleType: string; captainRole: string | null }
export type RawPeriodAppearance = { id: string; displayOrder: number; status: string | null; statistics: RawStat[] }
export type RawPeriodTeam = { id: string; discipline: 'BATTING' | 'BOWLING'; status: string | null; statistics: RawStat[]; appearances: RawPeriodAppearance[]; fallOfWickets: { sequenceNo: number; appearanceId: string; runs: number }[] | null }
export type RawPeriod = { id: string; name: string; sequenceNo: number; teams: RawPeriodTeam[]; sharedStatistics: { type: string; appearances: { id: string; role: 'BATTING' | 'BOWLING' | 'FIELDING' }[] }[] }
export type RawGameSummary = {
  id: string; status: string; type: string
  grade: { id: string; name: string }; round: { name: string; abbreviatedName: string; isFinalRound: boolean } | null
  schedule: { day: number; dateTime: string }[]
  teams: { id: string; name: string; isHomeTeam: boolean; outcome: string | null; organisation: { id: string; name: string } }[]
  appearances: RawAppearance[]
  coinToss: { winningTeamId: string | null; preference: 'BAT' | 'BOWL' | null } | null
  periods: RawPeriod[]
  playingSurfaces: { name: string; venue: { name: string; timezone: string } }[]
}
export type RawLadder = { gradeId: string; ladders: { headers: { key: string; name: string; shortName: string }[]; standings: { team: { id: string; name: string }; values: (number | string | null)[] }[] }[] }

// ---- domain ----
export type SeasonGroup = { name: string; isJunior: boolean; seasons: { id: string; status: RawSeason['status']; competitionName: string; isJunior: boolean }[]; status: RawSeason['status'] }
export type ClubTeam = { id: string; name: string; seasonId: string; seasonName: string; competitionName: string; isJunior: boolean; gradeId: string | null; gradeName: string | null }
export type GameSide = { id: string; name: string; isHome: boolean; outcome: string | null; score: number | null }
export type Game = {
  id: string; status: string; url: string; gradeId: string | null; gradeName: string | null
  roundName: string | null; roundAbbr: string | null; isFinalRound: boolean
  localDate: string | null; localTime: string | null; sortKey: string   // `${date}T${time ?? '00:00:00'}`
  venueName: string | null; venueSuburb: string | null
  club: GameSide; opponent: GameSide          // club = the Lang Lang side
  isClubDerby: boolean                         // both sides are club teams
}
export type BattingLine = { appearanceId: string; name: string; dismissal: string; runs: number; balls: number; fours: number; sixes: number; strikeRate: number; notOut: boolean }
export type BowlingLine = { appearanceId: string; name: string; overs: number; maidens: number; runs: number; wickets: number; economy: number }
export type Innings = {
  sequenceNo: number; label: string            // "Nar Nar Goon B Grade — 1st innings"
  battingTeamId: string; battingTeamName: string; bowlingTeamId: string; bowlingTeamName: string
  batting: BattingLine[]; didNotBat: string[]; bowling: BowlingLine[]
  extras: { total: number; wides: number; noBalls: number; byes: number; legByes: number; penalty: number }
  total: { runs: number; wickets: number; overs: number; declared: boolean; allOut: boolean }
  fallOfWickets: { wicket: number; runs: number; name: string }[]
}
export type Scorecard = {
  id: string; status: string; type: string; gradeName: string; roundName: string | null
  venueName: string | null; startsAt: string | null   // ISO from schedule[0].dateTime
  teams: { id: string; name: string; isHome: boolean; outcome: string | null; isClub: boolean }[]
  toss: string | null                                  // "Lang Lang B Grade won the toss and elected to bowl"
  innings: Innings[]
  players: Record<string, { firstName: string; lastName: string; teamId: string }>   // appearanceId → player, visible only
}
export type PlayerSeasonStats = {
  key: string; name: string; games: number
  batting: { innings: number; notOuts: number; runs: number; highScore: number; highScoreNotOut: boolean; balls: number; fours: number; sixes: number; average: number | null; strikeRate: number | null }
  bowling: { balls: number; overs: string; maidens: number; runs: number; wickets: number; bestWickets: number; bestRuns: number; average: number | null; economy: number | null }
  catches: number
}
export type LadderRow = { teamId: string; teamName: string; position: number; isClub: boolean; values: Record<string, number | string | null> }
export type Ladder = { gradeId: string; headers: { key: string; name: string; shortName: string }[]; rows: LadderRow[] }
```

- [ ] **Step 2: Write failing test** `tests/playhq/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { phqFetch, phqFetchAll, mapLimit, PlayHQError } from '@/lib/playhq/client'

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

describe('phqFetch', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    process.env.PLAYHQ_CLIENT_ID = 'key-123'
    process.env.PLAYHQ_TENANT = 'ca'
  })
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset() })

  it('sends api headers and cache options', async () => {
    fetchMock.mockResolvedValue(json({ data: [] }))
    await phqFetch('/v1/x', { revalidate: 60, tags: ['t'] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.playhq.com/v1/x')
    expect(init.headers['x-api-key']).toBe('key-123')
    expect(init.headers['x-phq-tenant']).toBe('ca')
    expect(init.next).toEqual({ revalidate: 60, tags: ['playhq', 't'] })
  })

  it('throws PlayHQError on non-2xx', async () => {
    fetchMock.mockResolvedValue(json({ error: 'nope' }, 404))
    await expect(phqFetch('/v1/missing', { revalidate: 1 })).rejects.toBeInstanceOf(PlayHQError)
  })

  it('phqFetchAll follows nextCursor', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: [1, 2], metadata: { hasMore: true, nextCursor: 'MTAw' } }))
      .mockResolvedValueOnce(json({ data: [3], metadata: { hasMore: false, nextCursor: null } }))
    const all = await phqFetchAll<number>('/v1/seasons/s/teams', { revalidate: 1 })
    expect(all).toEqual([1, 2, 3])
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.playhq.com/v1/seasons/s/teams?cursor=MTAw')
  })
})

describe('mapLimit', () => {
  it('runs at most `limit` concurrently and preserves order', async () => {
    let active = 0, peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--; return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })
})
```

- [ ] **Step 3: Run** `pnpm vitest run tests/playhq/client.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Implement `lib/playhq/client.ts`**:

```ts
const HOST = 'https://api.playhq.com'

export const PLAYHQ_ORG_ID = process.env.PLAYHQ_ORG_ID ?? '484ced51-403a-466c-9a94-bd95eedf7319'

export class PlayHQError extends Error {
  constructor(public status: number, public path: string) {
    super(`PlayHQ ${status} for ${path}`)
    this.name = 'PlayHQError'
  }
}

export type FetchOpts = { revalidate: number; tags?: string[] }

function headers() {
  const key = process.env.PLAYHQ_CLIENT_ID
  if (!key) throw new PlayHQError(0, 'PLAYHQ_CLIENT_ID not set')
  return {
    'x-api-key': key,
    'x-phq-tenant': process.env.PLAYHQ_TENANT ?? 'ca',
    accept: 'application/json',
  }
}

export async function phqFetch<T>(path: string, opts: FetchOpts): Promise<T> {
  const res = await fetch(`${HOST}${path}`, {
    headers: headers(),
    next: { revalidate: opts.revalidate, tags: ['playhq', ...(opts.tags ?? [])] },
  })
  if (!res.ok) throw new PlayHQError(res.status, path)
  return (await res.json()) as T
}

type Page<T> = { data: T[]; metadata?: { hasMore: boolean; nextCursor: string | null } }

export async function phqFetchAll<T>(path: string, opts: FetchOpts): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page: Page<T> = await phqFetch<Page<T>>(cursor ? `${path}${sep}cursor=${cursor}` : path, opts)
    out.push(...page.data)
    cursor = page.metadata?.hasMore ? page.metadata.nextCursor : null
  } while (cursor)
  return out
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
```

- [ ] **Step 5: Run test** — expect PASS. Delete `lib/playhq.ts` (old stub). `grep -rn "getPlayHQAccessToken\|lib/playhq'" app lib` must be empty.

- [ ] **Step 6: Commit** `feat(playhq): add typed cached API client with pagination`

---

### Task 2: Season grouping + name policy

**Files:**
- Create: `lib/playhq/seasons.ts`, `lib/playhq/names.ts`
- Test: `tests/playhq/seasons.test.ts`, `tests/playhq/names.test.ts`

**Interfaces — Produces:**
```ts
export function isJuniorCompetition(name: string): boolean
export function groupSeasons(raw: RawSeason[]): SeasonGroup[]        // newest first
export function pickDefaultSeason(groups: SeasonGroup[]): SeasonGroup | null
export function displayName(p: { firstName: string; lastName: string }, isJunior: boolean): string
```

- [ ] **Step 1: Failing tests**

`tests/playhq/seasons.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import seasons from '../fixtures/playhq/seasons.json'
import { groupSeasons, pickDefaultSeason, isJuniorCompetition } from '@/lib/playhq/seasons'
import type { RawSeason } from '@/lib/playhq/types'

const raw = seasons.data as RawSeason[]

describe('isJuniorCompetition', () => {
  it.each([
    ['CCCA Junior Competition', true],
    ['CCCA U15 All Star Girls', true],
    ['Junior Winter Cricket', true],
    ['CCCA Senior Competition', false],
    ['CCCA Kookaburra Cup', false],
  ])('%s → %s', (name, expected) => expect(isJuniorCompetition(name)).toBe(expected))
})

describe('groupSeasons', () => {
  const groups = groupSeasons(raw)
  it('groups by season name, newest first', () => {
    expect(groups.map((g) => g.name)).toEqual([
      'Summer 2026/27', 'Winter 2026', 'Summer 2025/26', 'Summer 2024/25', 'Summer 2023/24',
    ])
  })
  it('Summer 2026/27 spans junior, senior and girls comps', () => {
    const g = groups[0]
    expect(g.seasons.map((s) => s.competitionName).sort()).toEqual([
      'CCCA Junior Competition', 'CCCA Senior Competition', 'CCCA U15 All Star Girls',
    ])
    expect(g.status).toBe('UPCOMING')
    expect(g.seasons.find((s) => s.competitionName === 'CCCA Senior Competition')?.isJunior).toBe(false)
    expect(g.seasons.find((s) => s.competitionName === 'CCCA Junior Competition')?.isJunior).toBe(true)
  })
  it('group status is ACTIVE if any season active, else UPCOMING, else COMPLETED', () => {
    const g = groupSeasons([
      { ...raw[0], status: 'COMPLETED' },
      { ...raw[0], id: 'x', status: 'ACTIVE', competition: { id: 'c2', name: 'Other' } },
    ])
    expect(g[0].status).toBe('ACTIVE')
  })
})

describe('pickDefaultSeason', () => {
  it('prefers ACTIVE, then UPCOMING, then newest COMPLETED', () => {
    const groups = groupSeasons(raw)
    expect(pickDefaultSeason(groups)?.name).toBe('Summer 2026/27')
    const completedOnly = groups.map((g) => ({ ...g, status: 'COMPLETED' as const }))
    expect(pickDefaultSeason(completedOnly)?.name).toBe('Summer 2026/27')
    expect(pickDefaultSeason([])).toBeNull()
  })
})
```

`tests/playhq/names.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { displayName } from '@/lib/playhq/names'

describe('displayName', () => {
  it('senior: full name', () => expect(displayName({ firstName: 'Russell', lastName: 'Savige' }, false)).toBe('Russell Savige'))
  it('junior: first + initial', () => expect(displayName({ firstName: 'Jack', lastName: 'Smith' }, true)).toBe('Jack S.'))
  it('junior: missing last name', () => expect(displayName({ firstName: 'Jack', lastName: '' }, true)).toBe('Jack'))
  it('trims and title-cases shouting names', () => expect(displayName({ firstName: 'ARSHBIR', lastName: 'SINGH' }, false)).toBe('Arshbir Singh'))
})
```

Sorting rule for "newest first": parse the first 4-digit year in the name (`2026/27` → 2026, `Winter 2026` → 2026); tie-break: names containing `Summer` sort before `Winter` of the same year? No — Summer 2026/27 starts after Winter 2026, so: key = year + (name includes '/' ? 0.5 : 0), descending.

- [ ] **Step 2: Run tests** — expect FAIL.

- [ ] **Step 3: Implement**

`lib/playhq/seasons.ts`:
```ts
import type { RawSeason, SeasonGroup } from './types'

export function isJuniorCompetition(name: string): boolean {
  return /junior|u1\d|girls|winter/i.test(name)
}

function sortKey(name: string): number {
  const year = Number(/\d{4}/.exec(name)?.[0] ?? 0)
  return year + (name.includes('/') ? 0.5 : 0)
}

const STATUS_RANK = { ACTIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const

export function groupSeasons(raw: RawSeason[]): SeasonGroup[] {
  const byName = new Map<string, SeasonGroup>()
  for (const s of raw) {
    const isJunior = isJuniorCompetition(s.competition.name)
    const g = byName.get(s.name) ?? { name: s.name, isJunior: true, seasons: [], status: 'COMPLETED' as const }
    g.seasons.push({ id: s.id, status: s.status, competitionName: s.competition.name, isJunior })
    byName.set(s.name, g)
  }
  const groups = [...byName.values()].map((g) => ({
    ...g,
    isJunior: g.seasons.every((s) => s.isJunior),
    status: g.seasons.reduce<SeasonGroup['status']>(
      (best, s) => (STATUS_RANK[s.status] < STATUS_RANK[best] ? s.status : best),
      'COMPLETED'
    ),
  }))
  return groups.sort((a, b) => sortKey(b.name) - sortKey(a.name))
}

export function pickDefaultSeason(groups: SeasonGroup[]): SeasonGroup | null {
  return (
    groups.find((g) => g.status === 'ACTIVE') ??
    groups.find((g) => g.status === 'UPCOMING') ??
    groups[0] ??
    null
  )
}
```

`lib/playhq/names.ts`:
```ts
function titleCase(s: string) {
  return s.trim().toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())
}

export function displayName(p: { firstName: string; lastName: string }, isJunior: boolean): string {
  const first = titleCase(p.firstName ?? '')
  const last = titleCase(p.lastName ?? '')
  if (!last) return first
  return isJunior ? `${first} ${last[0]}.` : `${first} ${last}`
}
```

- [ ] **Step 4: Run tests** — PASS. **Step 5: Commit** `feat(playhq): season grouping and player name policy`

---

### Task 3: Game mapper + result sentence

**Files:**
- Create: `lib/playhq/games.ts`
- Test: `tests/playhq/games.test.ts`

**Interfaces — Produces:**
```ts
export function mapGame(raw: RawFixtureGame, clubTeamIds: Set<string>): Game | null   // null if no club side
export function isFinished(g: Game): boolean        // status FINAL or ABANDONED
export function resultSentence(g: Game, wickets?: { club: number | null; opponent: number | null; clubDeclared?: boolean; opponentDeclared?: boolean }): string
export function sortUpcoming(games: Game[]): Game[]  // asc sortKey
export function sortResults(games: Game[]): Game[]   // desc sortKey
export function dedupeGames(games: Game[]): Game[]   // by id
```

- [ ] **Step 1: Failing test** `tests/playhq/games.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import bGrade from '../fixtures/playhq/team-fixture-b-grade-2025-26.json'
import oneDay from '../fixtures/playhq/team-fixture-one-day-2025-26.json'
import upcoming from '../fixtures/playhq/team-fixture-b-grade-2026-27.json'
import { mapGame, resultSentence, isFinished, sortUpcoming, sortResults, dedupeGames } from '@/lib/playhq/games'
import type { RawFixtureGame } from '@/lib/playhq/types'

const B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const OD = '4398ce96-6b78-48af-8623-c208f8ceca9f'
const B27 = '9ad1241c-0f78-418e-b9f6-e0e74bff69a0'
const ids = new Set([B, OD, B27])
const bGames = (bGrade.data as RawFixtureGame[]).map((g) => mapGame(g, ids)!)
const round = (n: string) => bGames.find((g) => g.roundName === n)!

describe('mapGame', () => {
  it('maps a two-day first-innings loss', () => {
    const g = round('Round 4')
    expect(g.id).toBe('a65c84a6-1389-4b1c-89bd-98e66625b35f')
    expect(g.club).toEqual({ id: B, name: 'Lang Lang B Grade', isHome: false, outcome: 'LOST_ON_FIRST_INNINGS', score: 83 })
    expect(g.opponent.name).toBe('Nar Nar Goon B Grade')
    expect(g.opponent.score).toBe(237)
    expect(g.localDate).toBe('2025-10-25'); expect(g.localTime).toBe('13:00:00')
    expect(g.sortKey).toBe('2025-10-25T13:00:00')
    expect(g.venueName).toBe('Nar Nar Goon Recreation Reserve'); expect(g.venueSuburb).toBe('NAR NAR GOON')
    expect(g.gradeName).toBe('4. Senior Men B Grade'); expect(g.roundAbbr).toBe('R4')
    expect(g.isClubDerby).toBe(false)
  })
  it('handles upcoming games with no outcome/score', () => {
    const g = mapGame(upcoming.data[0] as RawFixtureGame, ids)!
    expect(g.status).toBe('UPCOMING')
    expect(g.club).toEqual({ id: B27, name: 'Lang Lang B Grade', isHome: true, outcome: null, score: null })
    expect(isFinished(g)).toBe(false)
  })
  it('returns null when no club team plays', () => {
    expect(mapGame(upcoming.data[0] as RawFixtureGame, new Set(['nope']))).toBeNull()
  })
  it('flags club derbies', () => {
    const raw = upcoming.data[0] as RawFixtureGame
    const derby = { ...raw, competitors: raw.competitors.map((c) => ({ ...c, id: c.id === B27 ? B27 : OD })) }
    expect(mapGame(derby, ids)!.isClubDerby).toBe(true)
  })
  it('abandoned game is finished', () => expect(isFinished(round('Round 11'))).toBe(true))
})

describe('resultSentence', () => {
  it('first-innings loss, with wickets', () => {
    expect(resultSentence(round('Round 4'), { club: 10, opponent: 4, opponentDeclared: true }))
      .toBe('Lang Lang B Grade 83 lost to Nar Nar Goon B Grade 4/237 dec on first innings')
  })
  it('outright loss without wickets', () => {
    expect(resultSentence(round('Round 1'))).toBe('Lang Lang B Grade 50 lost to Merinda Park B Grade 52')
  })
  it('win', () => {
    const g = (oneDay.data as RawFixtureGame[]).map((x) => mapGame(x, ids)!).find((x) => x.club.outcome === 'WON')!
    expect(resultSentence(g)).toMatch(/^Lang Lang One Day \d+ defeated .+ \d+$/)
  })
  it('forfeit / abandoned / upcoming', () => {
    const od = (oneDay.data as RawFixtureGame[]).map((x) => mapGame(x, ids)!)
    expect(resultSentence(od.find((x) => x.club.outcome === 'WON_BY_FORFEIT')!)).toMatch(/won by forfeit$/)
    expect(resultSentence(od.find((x) => x.club.outcome === 'LOST_BY_FORFEIT')!)).toMatch(/lost by forfeit$/)
    expect(resultSentence(round('Round 11'))).toBe('Match abandoned')
    expect(resultSentence(mapGame(upcoming.data[0] as RawFixtureGame, ids)!)).toBe('')
  })
})

describe('sorting & dedupe', () => {
  it('sorts', () => {
    expect(sortUpcoming(bGames)[0].roundName).toBe('Round 1')
    expect(sortResults(bGames)[0].roundName).toBe('Round 14')
  })
  it('dedupes by id', () => expect(dedupeGames([...bGames, ...bGames]).length).toBe(bGames.length))
})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `lib/playhq/games.ts`**:

```ts
import type { Game, GameSide, RawCompetitor, RawFixtureGame } from './types'

function side(c: RawCompetitor): GameSide {
  return { id: c.id, name: c.name, isHome: c.isHomeTeam, outcome: c.outcome ?? null, score: c.scoreTotal ?? null }
}

export function mapGame(raw: RawFixtureGame, clubTeamIds: Set<string>): Game | null {
  const clubRaw = raw.competitors.find((c) => clubTeamIds.has(c.id))
  if (!clubRaw) return null
  const oppRaw = raw.competitors.find((c) => c.id !== clubRaw.id) ?? clubRaw
  const localDate = raw.schedule?.date ?? null
  const localTime = raw.schedule?.time ?? null
  return {
    id: raw.id, status: raw.status, url: raw.url,
    gradeId: raw.grade?.id ?? null, gradeName: raw.grade?.name ?? null,
    roundName: raw.round?.name ?? null, roundAbbr: raw.round?.abbreviatedName ?? null,
    isFinalRound: raw.round?.isFinalRound ?? false,
    localDate, localTime, sortKey: `${localDate ?? '9999-12-31'}T${localTime ?? '00:00:00'}`,
    venueName: raw.venue?.name ?? null, venueSuburb: raw.venue?.address?.suburb ?? null,
    club: side(clubRaw), opponent: side(oppRaw),
    isClubDerby: clubTeamIds.has(oppRaw.id) && oppRaw.id !== clubRaw.id,
  }
}

export function isFinished(g: Game): boolean {
  return g.status === 'FINAL' || g.status === 'ABANDONED'
}

type Wickets = { club: number | null; opponent: number | null; clubDeclared?: boolean; opponentDeclared?: boolean }

function scoreText(side: GameSide, wickets: number | null | undefined, declared?: boolean) {
  if (side.score == null) return side.name
  const w = wickets != null && wickets < 10 ? `${wickets}/` : ''
  return `${side.name} ${w}${side.score}${declared ? ' dec' : ''}`
}

export function resultSentence(g: Game, w?: Wickets): string {
  const o = g.club.outcome
  if (g.status === 'ABANDONED' || o === 'ABANDONED') return 'Match abandoned'
  if (!o) return ''
  if (o === 'WON_BY_FORFEIT') return `${g.club.name} won by forfeit`
  if (o === 'LOST_BY_FORFEIT') return `${g.club.name} lost by forfeit`
  if (o === 'DRAW' || o === 'DREW') return `${g.club.name} drew with ${g.opponent.name}`
  if (o === 'TIE' || o === 'TIED') return `${g.club.name} tied with ${g.opponent.name}`
  if (o === 'NO_RESULT') return 'No result'
  const club = scoreText(g.club, w?.club, w?.clubDeclared)
  const opp = scoreText(g.opponent, w?.opponent, w?.opponentDeclared)
  const suffix = o.endsWith('_ON_FIRST_INNINGS') ? ' on first innings' : ''
  if (o.startsWith('WON')) return `${club} defeated ${opp}${suffix}`
  if (o.startsWith('LOST')) return `${club} lost to ${opp}${suffix}`
  return `${club} v ${opp}`
}

export const sortUpcoming = (games: Game[]) => [...games].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
export const sortResults = (games: Game[]) => [...games].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
export function dedupeGames(games: Game[]): Game[] {
  const seen = new Set<string>()
  return games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)))
}
```

- [ ] **Step 4: Run** — PASS. Adjust the "win" test's regex if the fixture's one-day WON game has a `_ON_FIRST_INNINGS` suffix (it should not — one-day outcomes are WON/LOST). **Step 5: Commit** `feat(playhq): fixture game mapper and result sentences`

---

### Task 4: Scorecard mapper

**Files:**
- Create: `lib/playhq/scorecard.ts`
- Test: `tests/playhq/scorecard.test.ts`

**Interfaces — Produces:**
```ts
export function mapScorecard(raw: RawGameSummary, clubOrgId: string, isJunior: boolean): Scorecard
export function clubWickets(sc: Scorecard, clubTeamId: string): { club: number | null; opponent: number | null; clubDeclared: boolean; opponentDeclared: boolean }  // from first-innings totals (sequenceNo 1 & 2), for resultSentence
export function dismissalText(event: { type: string; appearances: { id: string; role: string }[] } | undefined, status: string | null, name: (id: string) => string): string
```

Facts from `game-summary-two-day.json`: `sharedStatistics` entries have 2–3 appearances: BATTING (the batter), BOWLING (bowler), optional FIELDING (fielder). A batter appears with role BATTING in at most one event per period. Batting team stats: `TOTAL_SCORE` (use this, not `TOTALS`), `TOTAL_OUTS`, `TOTAL_OVERS` (decimal, `55.3` = 55 overs 3 balls), `TOTAL_EXTRAS`, `EXTRA_WIDES|NO_BALLS|BYES|LEG_BYES|PENALTY_RUNS`. Team `status`: `ALL_OUT`, `DECLARED`, `END_OF_GAME`, or null. `fallOfWickets[]` `{sequenceNo, appearanceId, runs}`. Player names: `appearances[]` top-level (join on id); skip `visible === false`. `schedule[0].dateTime` is UTC ISO. `coinToss { winningTeamId, preference: 'BAT'|'BOWL' }`.

Dismissal strings (`dismissalText`): status `NOT_OUT` → `not out`; `DID_NOT_BAT` → excluded from `batting` and added to `didNotBat`; OUT with event: `CAUGHT` → `c {fielder} b {bowler}` (`c & b {bowler}` when fielder id === bowler id; `c ? b {bowler}` when no FIELDING appearance), `BOWLED` → `b {bowler}`, `LEG_BEFORE_WICKET` → `lbw b {bowler}`, `STUMPED` → `st {fielder} b {bowler}`, `RUN_OUT` → `run out ({fielder})` or `run out`, `HIT_WICKET` → `hit wicket b {bowler}`, `RETIRED_HURT` → `retired hurt`, `RETIRED_OUT`/`RETIRED` → `retired out`, `HANDLED_BALL`/`OBSTRUCTING_FIELD`/`TIMED_OUT`/`HIT_BALL_TWICE` → lower-cased type with spaces; OUT with no event → `out`.

- [ ] **Step 1: Failing test** `tests/playhq/scorecard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import { mapScorecard, clubWickets, dismissalText } from '@/lib/playhq/scorecard'
import type { RawGameSummary } from '@/lib/playhq/types'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const NNG = '24a3079f-1d19-4fc6-984e-28df1ed4256d'
const sc = mapScorecard(twoDay.data as RawGameSummary, ORG, false)

describe('mapScorecard (two-day)', () => {
  it('header', () => {
    expect(sc.type).toBe('twoDay'); expect(sc.status).toBe('FINAL')
    expect(sc.gradeName).toBe('4. Senior Men B Grade'); expect(sc.roundName).toBe('Round 4')
    expect(sc.venueName).toBe('Nar Nar Goon Recreation Reserve')
    expect(sc.startsAt).toBe('2025-10-25T02:00:00.000Z')
    expect(sc.teams.find((t) => t.id === LL_B)?.isClub).toBe(true)
    expect(sc.teams.find((t) => t.id === NNG)?.isClub).toBe(false)
    expect(sc.toss).toBe('Lang Lang B Grade won the toss and elected to bowl')
  })
  it('innings in order with batting/bowling sides', () => {
    expect(sc.innings.map((i) => i.sequenceNo)).toEqual([1, 2, 3, 4])
    const i1 = sc.innings[0]
    expect(i1.battingTeamId).toBe(NNG); expect(i1.bowlingTeamId).toBe(LL_B)
    expect(i1.label).toBe('Nar Nar Goon B Grade — 1st innings')
    expect(sc.innings[2].label).toBe('Nar Nar Goon B Grade — 2nd innings')
  })
  it('totals, extras, declared / all out', () => {
    const i1 = sc.innings[0]
    expect(i1.total).toEqual({ runs: 237, wickets: 4, overs: 57, declared: true, allOut: false })
    expect(i1.extras).toEqual({ total: 18, wides: 8, noBalls: 4, byes: 2, legByes: 4, penalty: 0 })
    const i2 = sc.innings[1]
    expect(i2.total).toEqual({ runs: 83, wickets: 10, overs: 55.3, declared: false, allOut: true })
  })
  it('batting lines ordered by displayOrder, with dismissals', () => {
    const i2 = sc.innings[1]   // Lang Lang batting
    expect(i2.batting[0].name).toMatch(/de Longville$/i)
    expect(i2.batting[0]).toMatchObject({ runs: 0, balls: 32, fours: 0, sixes: 0, notOut: false })
    expect(i2.batting.map((b) => b.dismissal)).toSatisfy((d: string[]) => d.every((x) => /^(c .+ b .+|c & b .+|b .+|lbw b .+|not out|run out.*|st .+ b .+|out)$/.test(x)))
    const wykes = i2.batting.find((b) => b.name.endsWith('Wykes'))!
    expect(wykes.dismissal).toMatch(/^b /)
    expect(i2.batting.length + i2.didNotBat.length).toBeGreaterThanOrEqual(10)
  })
  it('fall of wickets joined to names', () => {
    const i1 = sc.innings[0]
    expect(i1.fallOfWickets[0]).toMatchObject({ wicket: 1, runs: 96 })
    expect(i1.fallOfWickets[0].name.length).toBeGreaterThan(2)
  })
  it('bowling lines only for bowlers with overs', () => {
    const i2 = sc.innings[1]
    expect(i2.bowling.length).toBe(6)
    const bailey = i2.bowling.find((b) => b.name.endsWith('Bailey'))!
    expect(bailey).toMatchObject({ overs: 22, maidens: 13, runs: 20, wickets: 4, economy: 0.9 })
  })
  it('players map excludes invisible appearances', () => {
    const raw = twoDay.data as RawGameSummary
    const hidden = { ...raw, appearances: raw.appearances.map((a, i) => (i === 0 ? { ...a, visible: false } : a)) }
    const s = mapScorecard(hidden, ORG, false)
    expect(s.players[raw.appearances[0].id]).toBeUndefined()
    expect(Object.keys(s.players).length).toBe(raw.appearances.length - 1)
  })
  it('junior flag abbreviates names', () => {
    const j = mapScorecard(twoDay.data as RawGameSummary, ORG, true)
    expect(j.innings[1].batting[0].name).toMatch(/^\S+ \S\.$/)
  })
  it('clubWickets for result sentence', () => {
    expect(clubWickets(sc, LL_B)).toEqual({ club: 10, opponent: 4, clubDeclared: false, opponentDeclared: true })
  })
})

describe('mapScorecard (one-day)', () => {
  const od = mapScorecard(oneDay.data as RawGameSummary, ORG, false)
  it('two innings, TOTAL_SCORE used', () => {
    expect(od.innings.length).toBe(2)
    expect(od.innings[0].total).toMatchObject({ runs: 88, wickets: 9, overs: 21.1, declared: false, allOut: false })
    expect(od.innings[0].didNotBat.length).toBe(1)
  })
})

describe('dismissalText', () => {
  const name = (id: string) => ({ b: 'Bowler', f: 'Fielder', x: 'Batter' })[id] ?? '?'
  const ev = (type: string, apps: [string, string][]) => ({ type, appearances: apps.map(([id, role]) => ({ id, role })) })
  it.each([
    [ev('CAUGHT', [['x', 'BATTING'], ['b', 'BOWLING'], ['f', 'FIELDING']]), 'c Fielder b Bowler'],
    [ev('CAUGHT', [['x', 'BATTING'], ['b', 'BOWLING'], ['b', 'FIELDING']]), 'c & b Bowler'],
    [ev('CAUGHT', [['x', 'BATTING'], ['b', 'BOWLING']]), 'c ? b Bowler'],
    [ev('BOWLED', [['x', 'BATTING'], ['b', 'BOWLING']]), 'b Bowler'],
    [ev('LEG_BEFORE_WICKET', [['x', 'BATTING'], ['b', 'BOWLING']]), 'lbw b Bowler'],
    [ev('STUMPED', [['x', 'BATTING'], ['b', 'BOWLING'], ['f', 'FIELDING']]), 'st Fielder b Bowler'],
    [ev('RUN_OUT', [['x', 'BATTING'], ['f', 'FIELDING']]), 'run out (Fielder)'],
    [ev('RUN_OUT', [['x', 'BATTING']]), 'run out'],
    [ev('HIT_WICKET', [['x', 'BATTING'], ['b', 'BOWLING']]), 'hit wicket b Bowler'],
    [ev('RETIRED_HURT', [['x', 'BATTING']]), 'retired hurt'],
    [ev('OBSTRUCTING_FIELD', [['x', 'BATTING']]), 'obstructing field'],
  ])('%o → %s', (event, expected) => expect(dismissalText(event as never, 'OUT', name)).toBe(expected))
  it('not out / out without event', () => {
    expect(dismissalText(undefined, 'NOT_OUT', name)).toBe('not out')
    expect(dismissalText(undefined, 'OUT', name)).toBe('out')
  })
})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `lib/playhq/scorecard.ts`**:

```ts
import type { BattingLine, BowlingLine, Innings, RawGameSummary, RawPeriod, RawPeriodTeam, RawStat, Scorecard } from './types'
import { displayName } from './names'

type Event = RawPeriod['sharedStatistics'][number]

const stat = (stats: RawStat[], type: string, fallback = 0) => stats.find((s) => s.type === type)?.value ?? fallback

export function dismissalText(event: Event | undefined, status: string | null, name: (id: string) => string): string {
  if (status === 'NOT_OUT') return 'not out'
  if (!event) return status === 'OUT' ? 'out' : ''
  const who = (role: string) => event.appearances.find((a) => a.role === role)?.id
  const bowler = who('BOWLING'), fielder = who('FIELDING')
  const b = bowler ? name(bowler) : '?'
  switch (event.type) {
    case 'CAUGHT':
      if (fielder && bowler && fielder === bowler) return `c & b ${b}`
      return `c ${fielder ? name(fielder) : '?'} b ${b}`
    case 'BOWLED': return `b ${b}`
    case 'LEG_BEFORE_WICKET': return `lbw b ${b}`
    case 'STUMPED': return `st ${fielder ? name(fielder) : '?'} b ${b}`
    case 'RUN_OUT': return fielder ? `run out (${name(fielder)})` : 'run out'
    case 'HIT_WICKET': return `hit wicket b ${b}`
    case 'RETIRED_HURT': return 'retired hurt'
    case 'RETIRED': case 'RETIRED_OUT': return 'retired out'
    default: return event.type.toLowerCase().replace(/_/g, ' ')
  }
}

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : `${n}th`)

export function mapScorecard(raw: RawGameSummary, clubOrgId: string, isJunior: boolean): Scorecard {
  const players: Scorecard['players'] = {}
  for (const a of raw.appearances) if (a.visible !== false) players[a.id] = { firstName: a.firstName, lastName: a.lastName, teamId: a.teamId }
  const name = (id: string) => (players[id] ? displayName(players[id], isJunior) : 'Unknown')
  const teamName = (id: string) => raw.teams.find((t) => t.id === id)?.name ?? 'Unknown'

  const inningsCount = new Map<string, number>()
  const innings: Innings[] = [...raw.periods].sort((a, b) => a.sequenceNo - b.sequenceNo).map((p) => {
    const bat = p.teams.find((t) => t.discipline === 'BATTING') as RawPeriodTeam
    const bowl = p.teams.find((t) => t.discipline === 'BOWLING') as RawPeriodTeam
    const n = (inningsCount.get(bat.id) ?? 0) + 1
    inningsCount.set(bat.id, n)
    const eventFor = (id: string) => p.sharedStatistics.find((e) => e.appearances.some((a) => a.id === id && a.role === 'BATTING'))

    const batting: BattingLine[] = [], didNotBat: string[] = []
    for (const a of [...bat.appearances].sort((x, y) => x.displayOrder - y.displayOrder)) {
      if (!players[a.id]) continue
      if (a.status === 'DID_NOT_BAT') { didNotBat.push(name(a.id)); continue }
      batting.push({
        appearanceId: a.id, name: name(a.id), dismissal: dismissalText(eventFor(a.id), a.status, name),
        runs: stat(a.statistics, 'TOTAL_RUNS'), balls: stat(a.statistics, 'BALLS_FACED'),
        fours: stat(a.statistics, 'FOURS'), sixes: stat(a.statistics, 'SIXES'),
        strikeRate: stat(a.statistics, 'STRIKE_RATE'), notOut: a.status === 'NOT_OUT',
      })
    }
    const bowling: BowlingLine[] = bowl.appearances
      .filter((a) => players[a.id] && a.statistics.some((s) => s.type === 'OVERS' && s.value > 0))
      .sort((x, y) => x.displayOrder - y.displayOrder)
      .map((a) => ({
        appearanceId: a.id, name: name(a.id),
        overs: stat(a.statistics, 'OVERS'), maidens: stat(a.statistics, 'MAIDENS'), runs: stat(a.statistics, 'RUNS'),
        wickets: stat(a.statistics, 'WICKETS'), economy: stat(a.statistics, 'ECONOMY'),
      }))
    const s = bat.statistics
    return {
      sequenceNo: p.sequenceNo, label: `${teamName(bat.id)} — ${ordinal(n)} innings`,
      battingTeamId: bat.id, battingTeamName: teamName(bat.id), bowlingTeamId: bowl.id, bowlingTeamName: teamName(bowl.id),
      batting, didNotBat, bowling,
      extras: { total: stat(s, 'TOTAL_EXTRAS'), wides: stat(s, 'EXTRA_WIDES'), noBalls: stat(s, 'EXTRA_NO_BALLS'), byes: stat(s, 'EXTRA_BYES'), legByes: stat(s, 'EXTRA_LEG_BYES'), penalty: stat(s, 'EXTRA_PENALTY_RUNS') },
      total: { runs: stat(s, 'TOTAL_SCORE'), wickets: stat(s, 'TOTAL_OUTS'), overs: stat(s, 'TOTAL_OVERS'), declared: bat.status === 'DECLARED', allOut: bat.status === 'ALL_OUT' || stat(s, 'TOTAL_OUTS') >= 10 },
      fallOfWickets: (bat.fallOfWickets ?? []).map((f) => ({ wicket: f.sequenceNo, runs: f.runs, name: name(f.appearanceId) })),
    }
  })

  const toss = raw.coinToss?.winningTeamId
    ? `${teamName(raw.coinToss.winningTeamId)} won the toss${raw.coinToss.preference ? ` and elected to ${raw.coinToss.preference.toLowerCase()}` : ''}`
    : null

  return {
    id: raw.id, status: raw.status, type: raw.type, gradeName: raw.grade?.name ?? '', roundName: raw.round?.name ?? null,
    venueName: raw.playingSurfaces?.[0]?.venue?.name ?? null, startsAt: raw.schedule?.[0]?.dateTime ?? null,
    teams: raw.teams.map((t) => ({ id: t.id, name: t.name, isHome: t.isHomeTeam, outcome: t.outcome, isClub: t.organisation?.id === clubOrgId })),
    toss, innings, players,
  }
}

export function clubWickets(sc: Scorecard, clubTeamId: string) {
  const first = (teamId: string) => sc.innings.find((i) => i.battingTeamId === teamId)
  const club = first(clubTeamId)
  const opp = sc.innings.find((i) => i.battingTeamId !== clubTeamId)
  return {
    club: club ? club.total.wickets : null, opponent: opp ? opp.total.wickets : null,
    clubDeclared: club?.total.declared ?? false, opponentDeclared: opp?.total.declared ?? false,
  }
}
```

- [ ] **Step 4: Run** — PASS (fix test expectations only if the fixture data proves an assumption wrong — e.g. Bailey's `displayOrder`; never weaken dismissal rules). **Step 5: Commit** `feat(playhq): scorecard mapper with dismissal text`

---

### Task 5: Player season aggregation + ladder mapper

**Files:**
- Create: `lib/playhq/players.ts`, `lib/playhq/ladder.ts`
- Test: `tests/playhq/players.test.ts`, `tests/playhq/ladder.test.ts`

**Interfaces — Produces:**
```ts
export function aggregatePlayers(scorecards: Scorecard[], teamId: string, isJunior?: boolean): PlayerSeasonStats[]  // FINAL games only; sorted by runs desc
export function oversToBalls(overs: number): number      // 13.3 → 81
export function ballsToOvers(balls: number): string      // 81 → "13.3"
export function mapLadder(raw: RawLadder, clubTeamIds: Set<string>): Ladder | null   // null when no standings
```

- [ ] **Step 1: Failing tests**

`tests/playhq/players.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import { mapScorecard } from '@/lib/playhq/scorecard'
import { aggregatePlayers, oversToBalls, ballsToOvers } from '@/lib/playhq/players'
import type { RawGameSummary } from '@/lib/playhq/types'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const sc = mapScorecard(twoDay.data as RawGameSummary, ORG, false)

describe('overs arithmetic', () => {
  it('converts', () => {
    expect(oversToBalls(13.3)).toBe(81); expect(oversToBalls(22)).toBe(132); expect(oversToBalls(0.5)).toBe(5)
    expect(ballsToOvers(81)).toBe('13.3'); expect(ballsToOvers(132)).toBe('22'); expect(ballsToOvers(0)).toBe('0')
  })
})

describe('aggregatePlayers', () => {
  it('aggregates one team across one game', () => {
    const stats = aggregatePlayers([sc], LL_B)
    expect(stats.length).toBeGreaterThanOrEqual(11)
    expect(stats[0].batting.runs).toBeGreaterThanOrEqual(stats[1].batting.runs)
    const bailey = stats.find((p) => p.name.endsWith('Bailey'))
    expect(bailey).toBeUndefined()   // Bailey plays for Nar Nar Goon
    const total = stats.reduce((n, p) => n + p.batting.runs, 0)
    expect(total).toBe(83 - sc.innings[1].extras.total)
  })
  it('doubles when same game counted twice, keys on name', () => {
    const once = aggregatePlayers([sc], LL_B), twice = aggregatePlayers([sc, sc], LL_B)
    expect(twice[0].games).toBe(2); expect(twice[0].batting.runs).toBe(once[0].batting.runs * 2)
  })
  it('average is null with no dismissals, HS tracks not-out', () => {
    const s = aggregatePlayers([sc], LL_B)
    for (const p of s) {
      if (p.batting.innings - p.batting.notOuts === 0) expect(p.batting.average).toBeNull()
      else expect(p.batting.average).toBeCloseTo(p.batting.runs / (p.batting.innings - p.batting.notOuts), 2)
    }
  })
  it('bowling: overs summed in balls, best figures, economy', () => {
    const od = mapScorecard(oneDay.data as RawGameSummary, ORG, false)
    const s = aggregatePlayers([od, sc], '4398ce96-6b78-48af-8623-c208f8ceca9f')
    const bowler = s.find((p) => p.bowling.balls > 0)!
    expect(bowler.bowling.overs).toBe(ballsToOvers(bowler.bowling.balls))
    expect(bowler.bowling.economy).toBeCloseTo(bowler.bowling.runs / (bowler.bowling.balls / 6), 2)
    expect(bowler.bowling.bestWickets).toBeGreaterThanOrEqual(0)
  })
  it('ignores non-FINAL games and catches count', () => {
    expect(aggregatePlayers([{ ...sc, status: 'UPCOMING' }], LL_B)).toEqual([])
    const s = aggregatePlayers([sc], LL_B)
    expect(s.reduce((n, p) => n + p.catches, 0)).toBeGreaterThan(0)
  })
})
```

`tests/playhq/ladder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import ladder from '../fixtures/playhq/ladder-b-grade-2025-26.json'
import { mapLadder } from '@/lib/playhq/ladder'
import type { RawLadder } from '@/lib/playhq/types'

const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
describe('mapLadder', () => {
  const l = mapLadder(ladder as RawLadder, new Set([LL_B]))!
  it('maps headers and positions', () => {
    expect(l.gradeId).toBe('0d6f1f07-1753-45c6-bf2f-662a8ab9b9b4')
    expect(l.headers.map((h) => h.key).slice(0, 3)).toEqual(['played', 'competitionPoints', 'quotient'])
    expect(l.rows[0]).toMatchObject({ position: 1, teamName: 'PUTCC B Grade', isClub: false })
    expect(l.rows[0].values.competitionPoints).toBe(126)
    expect(l.rows.find((r) => r.teamId === LL_B)?.isClub).toBe(true)
  })
  it('null when empty', () => expect(mapLadder({ gradeId: 'g', ladders: [] }, new Set())).toBeNull())
})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**

`lib/playhq/players.ts`:
```ts
import type { PlayerSeasonStats, Scorecard } from './types'
import { displayName } from './names'

export function oversToBalls(overs: number): number {
  const whole = Math.floor(overs)
  return whole * 6 + Math.round((overs - whole) * 10)
}
export function ballsToOvers(balls: number): string {
  const o = Math.floor(balls / 6), b = balls % 6
  return b ? `${o}.${b}` : `${o}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

function emptyStats(key: string, name: string): PlayerSeasonStats {
  return {
    key, name, games: 0,
    batting: { innings: 0, notOuts: 0, runs: 0, highScore: 0, highScoreNotOut: false, balls: 0, fours: 0, sixes: 0, average: null, strikeRate: null },
    bowling: { balls: 0, overs: '0', maidens: 0, runs: 0, wickets: 0, bestWickets: 0, bestRuns: 0, average: null, economy: null },
    catches: 0,
  }
}

export function aggregatePlayers(scorecards: Scorecard[], teamId: string, isJunior = false): PlayerSeasonStats[] {
  const acc = new Map<string, PlayerSeasonStats>()
  for (const sc of scorecards) {
    if (sc.status !== 'FINAL') continue
    // appearanceId → accumulator, for this game only
    const byAppearance = new Map<string, PlayerSeasonStats>()
    const byName = new Map<string, PlayerSeasonStats>()
    for (const [id, p] of Object.entries(sc.players)) {
      if (p.teamId !== teamId) continue
      const key = `${p.firstName}|${p.lastName}`.toLowerCase()
      let e = acc.get(key)
      if (!e) { e = emptyStats(key, displayName(p, isJunior)); acc.set(key, e) }
      if (!byAppearance.has(id)) { e.games++ }
      byAppearance.set(id, e); byName.set(e.name, e)
    }
    for (const inn of sc.innings) {
      if (inn.battingTeamId === teamId) {
        for (const b of inn.batting) {
          const e = byAppearance.get(b.appearanceId); if (!e) continue
          e.batting.innings++; if (b.notOut) e.batting.notOuts++
          e.batting.runs += b.runs; e.batting.balls += b.balls; e.batting.fours += b.fours; e.batting.sixes += b.sixes
          if (b.runs > e.batting.highScore || (b.runs === e.batting.highScore && b.notOut)) {
            e.batting.highScore = b.runs; e.batting.highScoreNotOut = b.notOut
          }
        }
      }
      if (inn.bowlingTeamId === teamId) {
        for (const b of inn.bowling) {
          const e = byAppearance.get(b.appearanceId); if (!e) continue
          e.bowling.balls += oversToBalls(b.overs); e.bowling.maidens += b.maidens
          e.bowling.runs += b.runs; e.bowling.wickets += b.wickets
          if (b.wickets > e.bowling.bestWickets || (b.wickets === e.bowling.bestWickets && b.runs < e.bowling.bestRuns)) {
            e.bowling.bestWickets = b.wickets; e.bowling.bestRuns = b.runs
          }
        }
        // catches: fielder name embedded in the (already policy-formatted) dismissal text
        for (const b of inn.batting) {
          const m = /^c & b (.+)$/.exec(b.dismissal) ?? /^c (.+) b .+$/.exec(b.dismissal)
          const e = m && byName.get(m[1]); if (e) e.catches++
        }
      }
    }
  }
  const out = [...acc.values()].map((e) => {
    const outs = e.batting.innings - e.batting.notOuts
    e.batting.average = outs > 0 ? round2(e.batting.runs / outs) : null
    e.batting.strikeRate = e.batting.balls > 0 ? round2((e.batting.runs / e.batting.balls) * 100) : null
    e.bowling.overs = ballsToOvers(e.bowling.balls)
    e.bowling.average = e.bowling.wickets > 0 ? round2(e.bowling.runs / e.bowling.wickets) : null
    e.bowling.economy = e.bowling.balls > 0 ? round2(e.bowling.runs / (e.bowling.balls / 6)) : null
    return e
  })
  return out.sort((a, b) => b.batting.runs - a.batting.runs || b.bowling.wickets - a.bowling.wickets || a.name.localeCompare(b.name))
}
```
Note: `games` counts once per game per player (a game listed twice in the input — as in the test — counts twice, which is what the test expects). The catches regex `^c (.+) b .+$` is greedy on the fielder name; names never contain " b " so it is safe.

`lib/playhq/ladder.ts`:
```ts
import type { Ladder, RawLadder } from './types'

export function mapLadder(raw: RawLadder, clubTeamIds: Set<string>): Ladder | null {
  const l = raw.ladders?.[0]
  if (!l || !l.standings?.length) return null
  const headers = l.headers.map((h) => ({ key: h.key, name: h.name, shortName: h.shortName }))
  return {
    gradeId: raw.gradeId, headers,
    rows: l.standings.map((s, i) => ({
      teamId: s.team.id, teamName: s.team.name, position: i + 1, isClub: clubTeamIds.has(s.team.id),
      values: Object.fromEntries(headers.map((h, j) => [h.key, s.values[j] ?? null])),
    })),
  }
}
```

- [ ] **Step 4: Run both** — PASS. **Step 5: Commit** `feat(playhq): season player aggregation and ladder mapper`

---

### Task 6: Composed loaders (`queries.ts`)

**Files:**
- Create: `lib/playhq/queries.ts`, `lib/playhq/index.ts` (re-exports)
- No unit tests (thin composition over tested pieces); verified via pages + `pnpm build`.

**Interfaces — Produces:**
```ts
export const TTL = { seasons: 21600, teams: 21600, fixture: 1800, ladder: 3600, gameFinal: 604800, gameLive: 900 }
export async function getSeasonGroups(): Promise<SeasonGroup[]>
export async function resolveSeason(param: string | undefined): Promise<{ groups: SeasonGroup[]; season: SeasonGroup | null }>   // decodeURIComponent, fallback pickDefaultSeason
export async function getClubTeams(season: SeasonGroup): Promise<ClubTeam[]>                    // all seasons in group, filter club.id, sorted seniors first then name
export async function getTeamGames(team: ClubTeam, clubTeamIds: Set<string>): Promise<Game[]>
export async function getClubGames(season: SeasonGroup): Promise<{ teams: ClubTeam[]; games: Game[] }>   // deduped
export async function getGameSummary(gameId: string, isJunior: boolean, status?: string): Promise<Scorecard>
export async function getLadder(gradeId: string, clubTeamIds: Set<string>): Promise<Ladder | null>
export async function getTeamPlayerStats(team: ClubTeam, games: Game[]): Promise<{ stats: PlayerSeasonStats[]; gamesCounted: number }>
export async function findClubTeam(teamId: string): Promise<{ team: ClubTeam; season: SeasonGroup } | null>   // scans all seasons' club teams
export async function findGameContext(gameId: string): Promise<{ isJunior: boolean } | null>   // scorecard page: fetch summary, check any team.organisation.id === org; junior = infer from grade name via isJuniorCompetition(gradeName) || /u1\d|girls|junior/i
```

- [ ] **Step 1: Implement**

```ts
import { PLAYHQ_ORG_ID, mapLimit, phqFetch, phqFetchAll } from './client'
import { groupSeasons, isJuniorCompetition, pickDefaultSeason } from './seasons'
import { dedupeGames, isFinished, mapGame } from './games'
import { mapScorecard } from './scorecard'
import { aggregatePlayers } from './players'
import { mapLadder } from './ladder'
import type { ClubTeam, Game, Ladder, PlayerSeasonStats, RawFixtureGame, RawGameSummary, RawLadder, RawSeason, RawTeam, Scorecard, SeasonGroup } from './types'

export const TTL = { seasons: 21600, teams: 21600, fixture: 1800, ladder: 3600, gameFinal: 604800, gameLive: 900 }

export async function getSeasonGroups(): Promise<SeasonGroup[]> {
  const res = await phqFetch<{ data: RawSeason[] }>(`/v1/organisations/${PLAYHQ_ORG_ID}/seasons`, { revalidate: TTL.seasons, tags: ['playhq-seasons'] })
  return groupSeasons(res.data)
}

export async function resolveSeason(param: string | undefined) {
  const groups = await getSeasonGroups()
  const wanted = param ? decodeURIComponent(param) : null
  const season = (wanted && groups.find((g) => g.name === wanted)) || pickDefaultSeason(groups)
  return { groups, season }
}

export async function getClubTeams(season: SeasonGroup): Promise<ClubTeam[]> {
  const perSeason = await Promise.all(
    season.seasons.map(async (s) => {
      const teams = await phqFetchAll<RawTeam>(`/v1/seasons/${s.id}/teams`, { revalidate: TTL.teams, tags: ['playhq-teams'] })
      return teams
        .filter((t) => t.club?.id === PLAYHQ_ORG_ID)
        .map<ClubTeam>((t) => ({ id: t.id, name: t.name, seasonId: s.id, seasonName: season.name, competitionName: s.competitionName, isJunior: s.isJunior, gradeId: t.grade?.id ?? null, gradeName: t.grade?.name ?? null }))
    })
  )
  return perSeason.flat().sort((a, b) => Number(a.isJunior) - Number(b.isJunior) || a.name.localeCompare(b.name))
}

export async function getTeamGames(team: ClubTeam, clubTeamIds: Set<string>): Promise<Game[]> {
  const raw = await phqFetchAll<RawFixtureGame>(`/v1/teams/${team.id}/fixture`, { revalidate: TTL.fixture, tags: ['playhq-fixture'] })
  return raw.map((g) => mapGame(g, clubTeamIds)).filter((g): g is Game => g !== null)
}

export async function getClubGames(season: SeasonGroup) {
  const teams = await getClubTeams(season)
  const ids = new Set(teams.map((t) => t.id))
  const games = await mapLimit(teams, 5, (t) => getTeamGames(t, ids))
  return { teams, games: dedupeGames(games.flat()) }
}

export async function getGameSummary(gameId: string, isJunior: boolean, status?: string): Promise<Scorecard> {
  const res = await phqFetch<{ data: RawGameSummary }>(`/v2/games/${gameId}/summary`, { revalidate: status === 'FINAL' ? TTL.gameFinal : TTL.gameLive, tags: ['playhq-game'] })
  return mapScorecard(res.data, PLAYHQ_ORG_ID, isJunior)
}

export async function getLadder(gradeId: string, clubTeamIds: Set<string>): Promise<Ladder | null> {
  const raw = await phqFetch<RawLadder>(`/v2/grades/${gradeId}/ladder`, { revalidate: TTL.ladder, tags: ['playhq-ladder'] })
  return mapLadder(raw, clubTeamIds)
}

export async function getTeamPlayerStats(team: ClubTeam, games: Game[]): Promise<{ stats: PlayerSeasonStats[]; gamesCounted: number }> {
  const finals = games.filter((g) => g.status === 'FINAL')
  const cards = await mapLimit(finals, 5, (g) => getGameSummary(g.id, team.isJunior, 'FINAL').catch(() => null))
  const ok = cards.filter((c): c is Scorecard => c !== null)
  return { stats: aggregatePlayers(ok, team.id, team.isJunior), gamesCounted: ok.length }
}

export async function findClubTeam(teamId: string) {
  const groups = await getSeasonGroups()
  for (const season of groups) {
    const team = (await getClubTeams(season)).find((t) => t.id === teamId)
    if (team) return { team, season }
  }
  return null
}

export function isJuniorGrade(gradeName: string) {
  return isJuniorCompetition(gradeName) || /u1\d|under/i.test(gradeName)
}
export { isFinished }
```

Junior detection for the scorecard page: page fetches summary with `isJunior=false` first? No — never render junior full names, even transiently. Instead the page calls `getGameSummary(id, true)` when `isJuniorGrade(raw grade name)` — but grade name is only known after fetching. Resolve: add to `queries.ts`:
```ts
export async function getGameSummaryAuto(gameId: string): Promise<Scorecard | null> {
  const res = await phqFetch<{ data: RawGameSummary }>(`/v2/games/${gameId}/summary`, { revalidate: TTL.gameLive, tags: ['playhq-game'] })
  const raw = res.data
  if (!raw.teams.some((t) => t.organisation?.id === PLAYHQ_ORG_ID)) return null
  return mapScorecard(raw, PLAYHQ_ORG_ID, isJuniorGrade(raw.grade?.name ?? ''))
}
```
(Same fetch URL + same tag; the data cache is keyed by URL+options, so `revalidate` here uses `TTL.gameLive` — fine per spec.) Junior grade names seen: `U10 Mixed U10 North`, `U12 Mixed South East/West`, `Ironside Allstar U15 Girls` — all match `/u1\d/i`.

`lib/playhq/index.ts`: `export * from './types'; export * from './queries'; export { resultSentence, sortUpcoming, sortResults, isFinished } from './games'; export { clubWickets } from './scorecard'; export { displayName } from './names'`.

- [ ] **Step 2:** `pnpm tsc --noEmit` clean. **Step 3: Commit** `feat(playhq): composed data loaders`

---

### Task 7: Remove manual fixtures + admin refresh page

**Files:**
- Delete: `app/admin/fixtures/actions.ts`, `app/admin/fixtures/page.tsx`
- Modify: `db/schema.ts` (remove `fixtures` table), `components/admin/admin-nav.tsx` (swap Fixtures → PlayHQ), `app/admin/page.tsx` (remove fixtures references/counts), `scripts/seed.ts` (remove fixture inserts if any), `.env.example` if present (drop `PLAYHQ_CLIENT_SECRET`, add `PLAYHQ_TENANT`)
- Create: `app/admin/playhq/page.tsx`, `app/admin/playhq/actions.ts`

- [ ] **Step 1:** `grep -rn "fixtures" app db scripts components --include='*.ts' --include='*.tsx'` — remove every reference to the `fixtures` table/admin page (the public `/fixtures` route stays; it is rewritten in Task 9). Keep `app/fixtures/page.tsx` compiling for now by leaving it untouched except deleting the `db`/`fixtures` import and rendering an empty list (Task 9 replaces the file entirely).

- [ ] **Step 2:** `app/admin/playhq/actions.ts`:
```ts
'use server'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function refreshPlayHQ() {
  revalidateTag('playhq')
  revalidatePath('/fixtures'); revalidatePath('/fixtures/[gameId]', 'page')
  revalidatePath('/teams'); revalidatePath('/teams/[teamId]', 'page')
  return { refreshedAt: new Date().toISOString() }
}
```
`app/admin/playhq/page.tsx`: server page matching other admin pages' layout (look at `app/admin/documents/page.tsx` for heading/container markup). Content: short explanation ("Fixtures, results, ladders and scorecards come live from PlayHQ and are cached for up to 30 minutes. Use this after results are entered on PlayHQ to show them immediately."), a `<form action={refreshPlayHQ}>` with a submit `Button` labelled "Refresh PlayHQ data", and a link to the club's PlayHQ page. Use a small client component with `useFormStatus` for the pending label ("Refreshing…") if `components/admin` already has such a pattern; otherwise plain form.

- [ ] **Step 3:** Admin nav: replace `{ href: '/admin/fixtures', label: 'Fixtures' }` with `{ href: '/admin/playhq', label: 'PlayHQ' }`.

- [ ] **Step 4:** `pnpm tsc --noEmit` + `pnpm vitest run` clean. Do **not** run `drizzle-kit push` (user does after deploy). **Step 5: Commit** `refactor: drop manual fixtures table/admin in favour of PlayHQ refresh`


---

### Task 8: Shared PlayHQ UI components

**Files:**
- Create: `components/playhq/season-picker.tsx` (client), `components/playhq/team-filter.tsx`, `components/playhq/game-card.tsx`, `components/playhq/ladder-table.tsx`, `components/playhq/scorecard-innings.tsx`, `components/playhq/player-stats-tables.tsx`, `components/playhq/playhq-unavailable.tsx`, `lib/playhq/format.ts`
- Test: `tests/playhq/format.test.ts`

**Interfaces — Produces:**
```ts
// lib/playhq/format.ts
export function formatLocalDate(localDate: string, opts?: { weekday?: boolean }): string   // "Sat 25 Oct 2025"
export function formatLocalTime(localTime: string | null): string | null                  // "1:00 pm"
export function dateParts(localDate: string): { day: string; month: string }               // { "25", "Oct" }
export function formatIsoMelbourne(iso: string): string                                      // full date via timeZone Australia/Melbourne
export const PLAYHQ_CLUB_URL = 'https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51'
export function seasonHref(base: string, season: string | null, team?: string | null): string  // `${base}?season=${encodeURIComponent(name)}&team=...`

// components
<SeasonPicker groups={SeasonGroup[]} current={string} basePath="/fixtures" />   // client; <select> → router.push(seasonHref(...)); preserves ?team
<TeamFilter teams={ClubTeam[]} current={string|null} season={string} basePath="/fixtures" />  // link chips: All + each team, seniors then juniors
<GameCard game={Game} variant="upcoming"|"result" resultText?={string} showTeam?={boolean} />   // result variant wraps in <Link href={`/fixtures/${game.id}`}>; upcoming links to PlayHQ url
<LadderTable ladder={Ladder} />         // shows columns: Pos, Team, P, W, L, PTS, Q, NRR (keys played, won, lost, competitionPoints, quotient, netRunRate — only those present in headers); club row highlighted bg-brand-gold-pale
<ScorecardInnings innings={Innings} />
<PlayerStatsTables stats={PlayerSeasonStats[]} gamesCounted={number} />   // batting table (Player, M, Inns, NO, Runs, HS, Avg, SR) sorted by runs; bowling table (Player, O, M, R, W, Best, Avg, Econ) sorted by wickets — only players with balls > 0; catches column in batting table
<PlayHQUnavailable what="fixtures" />   // rounded-2xl bg-brand-stone panel: "Live {what} are temporarily unavailable." + link PLAYHQ_CLUB_URL
```

- [ ] **Step 1: Failing test** `tests/playhq/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { formatLocalDate, formatLocalTime, dateParts, formatIsoMelbourne, seasonHref } from '@/lib/playhq/format'

describe('format', () => {
  it('local date', () => {
    expect(formatLocalDate('2025-10-25')).toBe('Sat 25 Oct 2025')
    expect(formatLocalDate('2025-10-25', { weekday: false })).toBe('25 Oct 2025')
    expect(dateParts('2025-10-25')).toEqual({ day: '25', month: 'Oct' })
  })
  it('local time', () => {
    expect(formatLocalTime('13:00:00')).toBe('1:00 pm'); expect(formatLocalTime('09:30:00')).toBe('9:30 am'); expect(formatLocalTime(null)).toBeNull()
  })
  it('iso → Melbourne', () => expect(formatIsoMelbourne('2025-10-25T02:00:00.000Z')).toBe('Sat 25 Oct 2025'))
  it('hrefs', () => {
    expect(seasonHref('/fixtures', 'Summer 2026/27')).toBe('/fixtures?season=Summer%202026%2F27')
    expect(seasonHref('/fixtures', 'Summer 2026/27', 'abc')).toBe('/fixtures?season=Summer%202026%2F27&team=abc')
    expect(seasonHref('/teams', null)).toBe('/teams')
  })
})
```
Implementation notes: `formatLocalDate` — parse `YYYY-MM-DD` into `new Date(Date.UTC(y, m-1, d, 12))` and format with `timeZone: 'UTC'` (avoids DST edge cases entirely since the string is already local). `formatLocalTime` — split `HH:mm:ss`, 12-hour with `am`/`pm` lower-case, no leading zero. `formatIsoMelbourne` — `Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' })`. Normalise `en-AU` output: `Intl` may emit `Sat 25 Oct 2025` or `Sat, 25 Oct 2025` depending on ICU — strip commas.

- [ ] **Step 2:** Run → FAIL; implement `lib/playhq/format.ts`; run → PASS.

- [ ] **Step 3: Build components.** Read `app/fixtures/page.tsx` (current) first and lift its card markup into `GameCard` (date block `h-16 w-16 rounded-xl bg-brand-black text-brand-gold`, eyebrow team name, `vs Opponent`, icon rows for date/time/venue). Result variant: `border-l-4 border-brand-gold`, result sentence in `text-brand-charcoal`, W/L badge (`bg-brand-gold-pale text-brand-gold-deep` for wins, `bg-brand-stone text-brand-grey` for losses; use `game.club.outcome?.startsWith('WON')`), round + grade meta line. Home/away: show `(H)`/`(A)` after opponent name with `sr-only` "home"/"away". Season picker: `'use client'`, `useRouter` + `useSearchParams`, `<label className="eyebrow">Season</label><select className="min-h-11 rounded-md border border-brand-black/15 bg-white px-3 text-sm">`. Team filter chips: `rounded-full px-3 py-1.5 text-sm font-semibold` with active `bg-brand-black text-brand-gold`, inactive `bg-white ring-1 ring-brand-black/10`. Tables: use `components/ui/table.tsx` primitives; numeric cells `tabular-nums text-right`. Scorecard innings: heading (label + total `4/237 dec (57 ov)`), batting `<table>`, "Did not bat: …" line, extras line `Extras 18 (w 8, nb 4, b 2, lb 4)`, FOW line `1-96 (Name), 2-168 (Name)…`, bowling table.

- [ ] **Step 4:** `pnpm tsc --noEmit` clean. **Step 5: Commit** `feat(playhq): shared UI components and formatting helpers`

---

### Task 9: `/fixtures` page on live data

**Files:**
- Rewrite: `app/fixtures/page.tsx`

- [ ] **Step 1:** Rewrite page:
```tsx
import { Suspense } from 'react'
import { PageHeader } from '@/components/page-header'
import { SeasonPicker } from '@/components/playhq/season-picker'
import { TeamFilter } from '@/components/playhq/team-filter'
import { GameCard } from '@/components/playhq/game-card'
import { PlayHQUnavailable } from '@/components/playhq/playhq-unavailable'
import { resolveSeason, getClubGames, resultSentence, sortUpcoming, sortResults, isFinished } from '@/lib/playhq'
import { PLAYHQ_CLUB_URL } from '@/lib/playhq/format'

export const revalidate = 1800
export const metadata = { title: 'Fixtures & Results | Lang Lang Cricket Club' }

type Props = { searchParams: { season?: string; team?: string } }

export default async function FixturesPage({ searchParams }: Props) {
  let content: React.ReactNode
  try {
    const { groups, season } = await resolveSeason(searchParams.season)
    if (!season) throw new Error('no seasons')
    const { teams, games } = await getClubGames(season)
    const filtered = searchParams.team ? games.filter((g) => g.club.id === searchParams.team || g.opponent.id === searchParams.team) : games
    const upcoming = sortUpcoming(filtered.filter((g) => !isFinished(g)))
    const results = sortResults(filtered.filter(isFinished))
    content = (/* picker + filter row, then the two-column grid from the old page using <GameCard>; empty states keep the PlayHQ links */)
  } catch (err) {
    console.error('[playhq] fixtures page', err)
    content = <section className="container-site py-16"><PlayHQUnavailable what="fixtures and results" /></section>
  }
  return (<main><PageHeader eyebrow="Fixtures & results" title="This season's matches" intro="Live draw and results for every Lang Lang side, straight from PlayHQ.">{/* keep existing PlayHQ CTA link */}</PageHeader>{content}</main>)
}
```
`SeasonPicker` uses `useSearchParams` → wrap in `<Suspense>`. Result cards: `resultText={resultSentence(g)}` (fixture-only totals; scorecard wickets are on the game page). `showTeam` true (multiple teams on this page).

- [ ] **Step 2:** `pnpm dev`, open `http://localhost:3000/fixtures`, `?season=Summer%202025%2F26`, `?season=Summer%202025%2F26&team=61e6c836-a80b-49f1-ae65-625bd0f55016`. Verify: season list correct, seniors before juniors in chips, results newest first, abandoned game shows "Match abandoned", upcoming 2026/27 shows B/D Grade draws. Check terminal for PlayHQ errors.

- [ ] **Step 3: Commit** `feat: fixtures page driven by live PlayHQ data`

---

### Task 10: `/fixtures/[gameId]` scorecard page

**Files:**
- Create: `app/fixtures/[gameId]/page.tsx`

- [ ] **Step 1:** Implement:
```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { ScorecardInnings } from '@/components/playhq/scorecard-innings'
import { getGameSummaryAuto, PlayHQError } from '@/lib/playhq'
import { formatIsoMelbourne } from '@/lib/playhq/format'

export const revalidate = 900

export default async function GamePage({ params }: { params: { gameId: string } }) {
  let sc
  try { sc = await getGameSummaryAuto(params.gameId) } catch (e) { if (e instanceof PlayHQError && e.status === 404) notFound(); throw e }
  if (!sc) notFound()
  const club = sc.teams.find((t) => t.isClub)!, opp = sc.teams.find((t) => !t.isClub) ?? club
  const title = `${club.name} v ${opp.name}`
  // header: eyebrow `${sc.gradeName} · ${sc.roundName}`; intro line: date (formatIsoMelbourne(sc.startsAt)), venue, toss, result sentence built from
  // sc.teams outcomes + innings totals (reuse resultSentence by constructing a Game-like object, or build inline: `${club.name} ${clubTotals} ${verb} ${opp.name} ${oppTotals}`)
  // body: sc.innings.map(i => <ScorecardInnings key={i.sequenceNo} innings={i} />); if sc.status !== 'FINAL' and no innings → "Scorecard will appear once the match is complete."
  // footer: link to PlayHQ game centre `https://www.playhq.com/cricket-australia/org/casey-cardinia-cricket-association/…` — not in summary; use PLAYHQ_CLUB_URL instead
}
```
Export `PlayHQError` and `getGameSummaryAuto` from `lib/playhq/index.ts`. `generateMetadata` → `{ title: `${club} v ${opp} scorecard | Lang Lang Cricket Club` }`.

- [ ] **Step 2:** Browser check: `/fixtures/a65c84a6-1389-4b1c-89bd-98e66625b35f` (two-day, 4 innings), `/fixtures/4821fdce-7b1e-467d-bb61-2dddfe7db393` (one-day), `/fixtures/ef31bcc7-e9b9-47b9-8d35-ad99858596b7` (upcoming), `/fixtures/not-a-game` → 404. Find one junior FINAL game id via `/fixtures?season=Summer%202025%2F26` and confirm names render as `First L.`.

- [ ] **Step 3: Commit** `feat: scorecard page`

---

### Task 11: `/teams` and `/teams/[teamId]` + nav

**Files:**
- Create: `app/teams/page.tsx`, `app/teams/[teamId]/page.tsx`
- Modify: `components/site-nav.tsx:12-18`, `components/site-footer.tsx:9` — add `{ href: '/teams', label: 'Teams' }` after Fixtures.

- [ ] **Step 1: `/teams`** — `revalidate = 1800`; `resolveSeason(searchParams.season)`; `getClubGames(season)`; for each team with `gradeId`, `getLadder` via `mapLimit(…, 5)` (`.catch(() => null)`); render `SeasonPicker` + two groups (`Senior sides`, `Junior sides`) of cards: team name (`display text-2xl`), grade name or "Grade not yet assigned", ladder line `3rd of 10 · 9W 2L` (from ladder row `values.won/lost`), next game (`sortUpcoming(games.filter(g => !isFinished(g) && (g.club.id===team.id)))[0]`) as `Next: Sat 3 Oct v Pakenham B Grade (H)` or last result sentence. Whole card `<Link href={`/teams/${team.id}`}>`. Errors → `PlayHQUnavailable what="teams"`.

- [ ] **Step 2: `/teams/[teamId]`** — `revalidate = 1800`; `findClubTeam(params.teamId)` → `notFound()` if null; `getClubTeams(season)` ids; `getTeamGames(team, ids)`; in parallel: `team.gradeId ? getLadder(team.gradeId, ids) : null` and `getTeamPlayerStats(team, games)` — each wrapped in `.catch(() => null)` so one failure doesn't blank the page. Sections with `section-heading` component: **Ladder** (`LadderTable`, or note "This team has not been allocated to a grade yet."), **Fixtures & results** (two columns as fixtures page, `showTeam={false}`), **Players** (`PlayerStatsTables`, or "Player stats will appear after the first completed match."). `PageHeader` eyebrow = `${team.seasonName} · ${team.gradeName ?? team.competitionName}`, title = team name.

- [ ] **Step 3:** Nav + footer links. Browser check `/teams`, `/teams?season=Summer%202025%2F26`, `/teams/61e6c836-a80b-49f1-ae65-625bd0f55016` (ladder + players), `/teams/9ad1241c-0f78-418e-b9f6-e0e74bff69a0` (2026/27 — no results, players hidden), junior team from 2025/26 (abbreviated names), `/teams/nope` → 404. Mobile width (375px): no horizontal scroll except tables wrapped in `overflow-x-auto`.

- [ ] **Step 4: Commit** `feat: teams and team detail pages with ladder and player stats`

---

### Task 12: Final verification + rollout notes

- [ ] **Step 1:** `pnpm vitest run` — all green. `pnpm lint` and `pnpm build` — clean. Fix any type errors introduced.
- [ ] **Step 2:** `grep -rn "PLAYHQ_CLIENT_SECRET\|getPlayHQAccessToken\|from '@/db/schema'" app lib components` — no fixtures references remain; `.env.local` and any `.env.example` list `PLAYHQ_ORG_ID`, `PLAYHQ_CLIENT_ID`, `PLAYHQ_TENANT`.
- [ ] **Step 3:** Update `README.md` env-var section (if present) and add a "PlayHQ" paragraph: data source, cache TTLs, admin refresh button, Vercel env vars to set, `drizzle-kit push` drops `fixtures` after deploy.
- [ ] **Step 4: Commit** `docs: PlayHQ integration notes`

## Self-review

- Spec coverage: client/cache ✔ (T1, T6), mappers + tests ✔ (T2–T5, T8), name policy ✔ (T2, used in T4/T5/T6), pages ✔ (T9–T11), nav ✔ (T11), admin refresh ✔ (T7), manual fixtures removal ✔ (T7), error panels ✔ (T8–T11), rollout ✔ (T12).
- Type consistency: `aggregatePlayers(scorecards, teamId, isJunior?)` used with 3 args in T6; `getGameSummaryAuto` exported in T6 and consumed in T10; `clubWickets` exported but only used if the scorecard page chooses `resultSentence` — acceptable.
