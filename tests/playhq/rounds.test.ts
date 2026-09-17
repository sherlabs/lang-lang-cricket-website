import { describe, it, expect } from 'vitest'
import bGrade from '../fixtures/playhq/team-fixture-b-grade-2025-26.json'
import upcoming from '../fixtures/playhq/team-fixture-b-grade-2026-27.json'
import { mapGame } from '@/lib/playhq/games'
import { groupByDate, latestResultsWindow, nextRoundWindow } from '@/lib/playhq/rounds'
import type { Game, RawFixtureGame } from '@/lib/playhq/types'

const B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const B27 = '9ad1241c-0f78-418e-b9f6-e0e74bff69a0'
const ids = new Set([B, B27])
const past = (bGrade.data as RawFixtureGame[]).map((g) => mapGame(g, ids)!)
const future = (upcoming.data as RawFixtureGame[]).map((g) => mapGame(g, ids)!)
const all = [...past, ...future]
const rounds = (gs: Game[]) => gs.map((g) => g.roundName)

describe('nextRoundWindow', () => {
  it('today 2026-10-01 → Round 1 (2026-10-03) only; Round 2 is exactly 7 days later and excluded', () => {
    const w = nextRoundWindow(all, '2026-10-01')
    expect(w.map((g) => g.id)).toEqual([future[0].id])
    expect(w[0].id.startsWith('ef31bcc7')).toBe(true)
    expect(rounds(w)).toEqual(['Round 1'])
  })
  it('a game dated today is still next; the day after, Round 2 is next', () => {
    expect(rounds(nextRoundWindow(all, '2026-10-03'))).toEqual(['Round 1'])
    expect(rounds(nextRoundWindow(all, '2026-10-04'))).toEqual(['Round 2'])
  })
  it('includes games within 7 days of the earliest (weekend split / juniors on Friday), sorted ascending', () => {
    const r1 = future.find((g) => g.roundName === 'Round 1')!
    const sunday: Game = { ...r1, id: 'sun', localDate: '2026-10-04', sortKey: '2026-10-04T13:00:00' }
    const friday: Game = { ...r1, id: 'fri', localDate: '2026-10-02', sortKey: '2026-10-02T17:00:00' }
    const w = nextRoundWindow([...all, sunday, friday], '2026-10-01')
    expect(w.map((g) => g.id)).toEqual(['fri', r1.id, 'sun'])
  })
  it('ignores stale unfinished games in the past and undated games', () => {
    const stale: Game = { ...past[3], id: 'stale', status: 'UPCOMING', club: { ...past[3].club, outcome: null } }
    const tbc: Game = { ...future[0], id: 'tbc', localDate: null, sortKey: '9999-12-31T00:00:00' }
    const w = nextRoundWindow([...all, stale, tbc], '2026-10-01')
    expect(w.map((g) => g.id)).toEqual([future[0].id])
  })
  it('empty when nothing is upcoming', () => {
    expect(nextRoundWindow(past, '2026-06-01')).toEqual([])
    expect(nextRoundWindow([], '2026-06-01')).toEqual([])
  })
})

describe('latestResultsWindow', () => {
  it('today 2025-11-05 → Round 4 (two-day game anchored on its day-1 date); Round 3 is 7 days earlier and excluded', () => {
    const w = latestResultsWindow(all, '2025-11-05')
    expect(w.map((g) => g.id)).toEqual(['a65c84a6-1389-4b1c-89bd-98e66625b35f'])
    expect(rounds(w)).toEqual(['Round 4'])
  })
  it('without today → the most recent finished round overall (Round 14), abandoned games count as finished', () => {
    expect(rounds(latestResultsWindow(all))).toEqual(['Round 14'])
    expect(rounds(latestResultsWindow(all, '2026-01-25'))).toEqual(['Round 11'])
  })
  it('groups a split weekend, newest first', () => {
    const r4 = past.find((g) => g.roundName === 'Round 4')!
    const sun: Game = { ...r4, id: 'sun', localDate: '2025-10-26', sortKey: '2025-10-26T13:00:00' }
    expect(latestResultsWindow([...all, sun], '2025-11-05').map((g) => g.id)).toEqual(['sun', r4.id])
  })
  it('empty when nothing is finished', () => {
    expect(latestResultsWindow(future)).toEqual([])
  })
})

describe('groupByDate', () => {
  it('buckets by localDate preserving order; undated games go last as null', () => {
    const r1 = future[0]
    const tbc: Game = { ...r1, id: 'tbc', localDate: null }
    const dup: Game = { ...r1, id: 'dup' }
    const g = groupByDate([tbc, r1, future[1], dup])
    expect(g.map((x) => x.date)).toEqual(['2026-10-03', '2026-10-10', null])
    expect(g[0].games.map((x) => x.id)).toEqual([r1.id, 'dup'])
    expect(g[2].games.map((x) => x.id)).toEqual(['tbc'])
  })
  it('empty in → empty out', () => expect(groupByDate([])).toEqual([]))
})
