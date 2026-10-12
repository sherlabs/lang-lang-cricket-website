import { describe, expect, it } from 'vitest'
import { NETS } from '@/lib/nets/constants'
import { guestKey, sanitiseGuestName } from '@/lib/nets/guest'
import { addLatecomer, buildRotation, planMatchesKeys, removeFromPlan, roundCount, roundView, type PlanPlayer } from '@/lib/nets/rotation'
import { netAttendanceSummary, netSummarySentence } from '@/lib/nets/summary'
import { clock, nextRoundWrite, pauseWrite, resumeWrite, startWrite, timerView, type TimerInput } from '@/lib/nets/timer'
import { BOWLING_STYLES, validateCard } from '@/lib/selection/card'
import { isTabActive, selectorTabs } from '@/lib/selector-nav'

const people = (n: number): PlanPlayer[] => Array.from({ length: n }, (_, i) => ({ key: `player:${i + 1}`, name: `P${i + 1}` }))
const sizes = (p: ReturnType<typeof buildRotation>) => p.groups.map((g) => g.players.length)

describe('buildRotation', () => {
  it('balances ten players with a size of four into 4, 3 and 3', () => {
    expect(sizes(buildRotation({ players: people(10), nets: 3, groupSize: 4 }))).toEqual([4, 3, 3])
  })
  it('maps group j to round floor(j / nets) and net (j mod nets) + 1', () => {
    const plan = buildRotation({ players: people(20), nets: 2, groupSize: 4 })
    expect(plan.groups.map((g) => [g.round, g.net])).toEqual([[0, 1], [0, 2], [1, 1], [1, 2], [2, 1]])
    expect(roundCount(plan)).toBe(3)
  })
  it('keeps every player exactly once, in the order given', () => {
    const plan = buildRotation({ players: people(11), nets: 3, groupSize: 4 })
    expect(plan.groups.flatMap((g) => g.players.map((p) => p.key))).toEqual(people(11).map((p) => p.key))
  })
  it('copes with fewer players than nets, one player and none', () => {
    expect(buildRotation({ players: people(2), nets: 4, groupSize: 4 }).groups).toHaveLength(1)
    const one = buildRotation({ players: people(1), nets: 3, groupSize: 4 })
    expect(one.groups).toHaveLength(1)
    expect(one.groups[0]).toMatchObject({ round: 0, net: 1 })
    expect(buildRotation({ players: [], nets: 3, groupSize: 4 }).groups).toEqual([])
    expect(roundCount(buildRotation({ players: [], nets: 3, groupSize: 4 }))).toBe(0)
  })
  it('handles many rounds on a single net', () => {
    const plan = buildRotation({ players: people(12), nets: 1, groupSize: 3 })
    expect(plan.groups.map((g) => g.round)).toEqual([0, 1, 2, 3])
    expect(plan.groups.every((g) => g.net === 1)).toBe(true)
  })
})

describe('addLatecomer and removeFromPlan', () => {
  const base = () => buildRotation({ players: people(10), nets: 2, groupSize: 4 }) // 4,3,3 -> rounds 0,0,1
  const late: PlanPlayer = { key: 'player:99', name: 'Late' }
  it('goes into the smallest group of a later round and leaves the input untouched', () => {
    const plan = base()
    const next = addLatecomer(plan, late, 0)
    expect(next.groups.find((g) => g.players.some((p) => p.key === late.key))).toMatchObject({ round: 1, number: 3 })
    expect(plan.groups[2].players).toHaveLength(3)
  })
  it('never changes the current or a past round', () => {
    const plan = base()
    const next = addLatecomer(plan, late, 0)
    expect(next.groups.filter((g) => g.round <= 0)).toEqual(plan.groups.filter((g) => g.round <= 0))
  })
  it('before the start (round -1) any group may take them', () => {
    const next = addLatecomer(base(), late, -1)
    expect(next.groups.find((g) => g.players.some((p) => p.key === late.key))!.players).toHaveLength(4)
  })
  it('makes a new group when every later group is full: in the last round if a net is free, else a new round', () => {
    const full = buildRotation({ players: people(8), nets: 3, groupSize: 4 }) // rounds 0,0
    const a = addLatecomer(full, late, -1)
    expect(a.groups).toHaveLength(3)
    expect(a.groups[2]).toMatchObject({ round: 0, net: 3 })
    const onCurrent = addLatecomer(full, late, 0)
    expect(onCurrent.groups[2]).toMatchObject({ round: 1, net: 1 })
    expect(onCurrent.groups.filter((g) => g.round === 0)).toEqual(full.groups.filter((g) => g.round === 0))
  })
  it('is idempotent for someone already in the plan', () => {
    const plan = base()
    expect(addLatecomer(plan, plan.groups[0].players[0], -1)).toBe(plan)
  })
  it('removeFromPlan only touches later rounds and drops empty groups', () => {
    const plan = base()
    const inRound0 = plan.groups[0].players[0].key
    expect(removeFromPlan(plan, inRound0, 0).groups[0].players.map((p) => p.key)).toContain(inRound0)
    const inRound1 = plan.groups[2].players[0].key
    const next = removeFromPlan(plan, inRound1, 0)
    expect(next.groups[2].players.map((p) => p.key)).not.toContain(inRound1)
    const solo = buildRotation({ players: people(5), nets: 1, groupSize: 4 }) // 3,2
    const gone = removeFromPlan(removeFromPlan(solo, solo.groups[1].players[0].key, 0), solo.groups[1].players[1].key, 0)
    expect(gone.groups).toHaveLength(1)
  })
  it('removeFromPlan renumbers the later rounds so none is empty', () => {
    const plan = buildRotation({ players: people(6), nets: 1, groupSize: 2 }) // rounds 0, 1, 2
    const keys = (i: number) => plan.groups[i].players.map((p) => p.key)
    const next = removeFromPlan(removeFromPlan(plan, keys(1)[0], 0), keys(1)[1], 0)
    expect(next.groups.map((g) => g.round)).toEqual([0, 1])
    expect(roundCount(next)).toBe(2)
    expect(roundView(next, 1).upNow[0].players.map((p) => p.key)).toEqual(keys(2))
    const wide = buildRotation({ players: people(6), nets: 2, groupSize: 1 }) // 3 rounds of 2 nets
    const drop = removeFromPlan(wide, wide.groups[2].players[0].key, 0) // net 1 of round 1 goes
    expect(drop.groups.filter((g) => g.round === 1).map((g) => g.net)).toEqual([1])
  })
  it('planMatchesKeys compares the plan with the people checked in', () => {
    const plan = buildRotation({ players: people(3), nets: 1, groupSize: 2 })
    const keys = new Set(people(3).map((p) => p.key))
    expect(planMatchesKeys(plan, keys)).toBe(true)
    expect(planMatchesKeys(plan, new Set([...keys, 'guest:x']))).toBe(false)
    expect(planMatchesKeys(plan, new Set([...keys].slice(1)))).toBe(false)
    expect(planMatchesKeys(null, keys)).toBe(false)
  })
  it('roundView lists up now, up next, waiting and done', () => {
    const plan = buildRotation({ players: people(9), nets: 1, groupSize: 3 })
    const v = roundView(plan, 1)
    expect(v.upNow[0].players.map((p) => p.name)).toEqual(['P4', 'P5', 'P6'])
    expect(v.upNext[0].players.map((p) => p.name)).toEqual(['P7', 'P8', 'P9'])
    expect(v.done.map((p) => p.name)).toEqual(['P1', 'P2', 'P3'])
    expect(v.waiting).toEqual([])
    expect(roundView(plan, -1).upNow).toEqual([])
  })
})

describe('timerView', () => {
  const MIN = 60_000
  const t0 = 1_000_000
  const running = (over: Partial<TimerInput> = {}): TimerInput => ({ state: 'running', round: 0, roundStartedAt: t0, pausedAt: null, minutes: 10, rounds: 3, ...over })
  it('is not started before the first start', () => {
    expect(timerView({ ...running(), state: 'planned', roundStartedAt: null }, t0)).toMatchObject({ phase: 'not-started', round: -1, nextRound: 0 })
  })
  it('counts down the first round and rolls on its own', () => {
    expect(timerView(running(), t0 + 3 * MIN)).toMatchObject({ phase: 'running', round: 0, remainingMs: 7 * MIN, nextRound: 1 })
    expect(timerView(running(), t0 + 10 * MIN)).toMatchObject({ round: 1, remainingMs: 10 * MIN })
    expect(timerView(running(), t0 + 25 * MIN)).toMatchObject({ round: 2, remainingMs: 5 * MIN, nextRound: null })
  })
  it('is done after the last round', () => {
    expect(timerView(running(), t0 + 30 * MIN)).toMatchObject({ phase: 'done', round: 2, remainingMs: 0 })
    expect(timerView({ ...running(), state: 'finished' }, t0)).toMatchObject({ phase: 'done', nextRound: null })
  })
  it('a paused timer stands still at the pause time', () => {
    const p = pauseWrite(running(), t0 + 4 * MIN)
    const paused: TimerInput = { ...running(), ...p }
    expect(timerView(paused, t0 + 99 * MIN)).toMatchObject({ phase: 'paused', round: 0, remainingMs: 6 * MIN })
  })
  it('resume moves the start forward by the paused time', () => {
    const paused: TimerInput = { ...running(), ...pauseWrite(running(), t0 + 4 * MIN) }
    const resumed: TimerInput = { ...paused, ...resumeWrite(paused, t0 + 14 * MIN) }
    expect(resumed.roundStartedAt).toBe(t0 + 10 * MIN)
    expect(timerView(resumed, t0 + 14 * MIN)).toMatchObject({ phase: 'running', round: 0, remainingMs: 6 * MIN })
  })
  it('next round starts the following round now, from the effective round (not the stored one)', () => {
    const w = nextRoundWrite(running(), t0 + 12 * MIN)! // effective round is already 1
    expect(w).toMatchObject({ state: 'running', round: 2, roundStartedAt: t0 + 12 * MIN })
    expect(nextRoundWrite(running(), t0 + 25 * MIN)).toBeNull()
    expect(nextRoundWrite({ ...running(), state: 'planned', roundStartedAt: null }, t0)).toBeNull()
  })
  it('next round while paused stays paused with a full turn', () => {
    const paused: TimerInput = { ...running(), ...pauseWrite(running(), t0 + 4 * MIN) }
    const w = nextRoundWrite(paused, t0 + 50 * MIN)!
    expect(timerView({ ...paused, ...w }, t0 + 60 * MIN)).toMatchObject({ phase: 'paused', round: 1, remainingMs: 10 * MIN })
  })
  it('start writes round 0 now', () => {
    expect(startWrite(5)).toEqual({ state: 'running', round: 0, roundStartedAt: 5, pausedAt: null })
  })
  it('tolerates a client clock behind the start (skew): never negative, never a round early', () => {
    expect(timerView(running(), t0 - 5_000)).toMatchObject({ round: 0, remainingMs: 10 * MIN })
  })
  it('formats the countdown', () => {
    expect(clock(6 * MIN + 5_100)).toBe('6:06')
    expect(clock(0)).toBe('0:00')
    expect(clock(-5)).toBe('0:00')
    expect(clock(900)).toBe('0:01')
  })
})

describe('guest names', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(sanitiseGuestName('  Alex   Guest ')).toBe('Alex Guest')
    expect(sanitiseGuestName('x'.repeat(100))).toHaveLength(NETS.guestNameMax)
  })
  it('strips control characters', () => {
    expect(sanitiseGuestName('Al\u0000ex\u0007\nGuest')).toBe('Al ex Guest')
  })
  it('strips a leading spreadsheet formula prefix, however it is layered', () => {
    for (const bad of ['=SUM(A1)', '+1', '-2', '@x', '\tTab', "'=1", " =HYPERLINK(\"x\")", '＝x']) {
      const out = sanitiseGuestName(bad)
      expect(out === null || !/^[=+\-@\t'|]/.test(out), bad).toBe(true)
    }
    expect(sanitiseGuestName('=SUM(A1)')).toBe('SUM(A1)')
    expect(sanitiseGuestName('===')).toBeNull()
  })
  it('refuses non-strings and empties', () => {
    expect(sanitiseGuestName(null)).toBeNull()
    expect(sanitiseGuestName(5)).toBeNull()
    expect(sanitiseGuestName('   ')).toBeNull()
  })
  it('the same name typed twice is one key', () => {
    expect(guestKey('Alex  GUEST')).toBe(guestKey('alex guest'))
  })
})

describe('card allowlist', () => {
  it('accepts the fixed lists and clears on empty', () => {
    expect(validateCard({ role: 'keeper', battingStyle: 'left-hand', bowlingStyle: 'left-arm orthodox', canKeep: 'on' })).toEqual({ ok: true, patch: { role: 'keeper', battingStyle: 'left-hand', bowlingStyle: 'left-arm orthodox', canKeep: true } })
    expect(validateCard({ role: '', battingStyle: '', bowlingStyle: '' })).toEqual({ ok: true, patch: { role: null, battingStyle: null, bowlingStyle: null } })
    for (const s of BOWLING_STYLES) expect(validateCard({ bowlingStyle: s }).ok).toBe(true)
  })
  it('rejects an unknown option instead of coercing it', () => {
    expect(validateCard({ role: 'wizard' }).ok).toBe(false)
    expect(validateCard({ battingStyle: 'Left-Hand' }).ok).toBe(false)
    expect(validateCard({ bowlingStyle: 'left-arm' }).ok).toBe(false)
    expect(validateCard({ role: { $ne: null } }).ok).toBe(false)
  })
  it('leaves a key that is not sent alone', () => {
    expect(validateCard({ notes: 'hello' })).toEqual({ ok: true, patch: { notes: 'hello' } })
  })
  it('limits notes and strips control characters', () => {
    expect(validateCard({ notes: 'x'.repeat(1001) }).ok).toBe(false)
    expect(validateCard({ notes: 'a\u0000b\r\nc' })).toEqual({ ok: true, patch: { notes: 'ab\nc' } })
    expect(validateCard({ notes: '   ' })).toEqual({ ok: true, patch: { notes: null } })
    expect(validateCard({ notes: 7 }).ok).toBe(false)
  })
  it('reads the staff-only tick', () => {
    expect(validateCard({ notesStaffOnly: 'on' })).toEqual({ ok: true, patch: { notesStaffOnly: true } })
    expect(validateCard({ notesStaffOnly: null })).toEqual({ ok: true, patch: { notesStaffOnly: false } })
  })
})

describe('netAttendanceSummary', () => {
  const sessions = [
    { id: 1, localDate: '2026-08-01', held: true }, // outside an 8 week window from 10-12
    { id: 2, localDate: '2026-09-05', held: true },
    { id: 3, localDate: '2026-09-12', held: true },
    { id: 4, localDate: '2026-09-19', held: false }, // planned, never held
    { id: 5, localDate: '2026-10-03', held: true },
    { id: 6, localDate: '2026-10-12', held: true }, // today
    { id: 7, localDate: '2026-10-20', held: true }, // future
  ]
  const s = netAttendanceSummary({ sessions, attendedIds: new Set([1, 3, 5, 4]), today: '2026-10-12' })
  it('counts only held sessions inside the window and not in the future', () => {
    expect(s).toMatchObject({ weeks: 8, held: 4, attended: 2, lastDate: '2026-10-03' })
  })
  it('gives dots newest first with present or absent', () => {
    expect(s.dots.map((d) => [d.id, d.present])).toEqual([[6, false], [5, true], [3, true], [2, false]])
  })
  it('words the line with the window and never as a percentage', () => {
    const f = (d: string) => `D${d}`
    expect(netSummarySentence(s, f)).toBe('Turned up at 2 of 4 net sessions in the last 8 weeks, last on D2026-10-03.')
    expect(netSummarySentence({ ...s, attended: 0, lastDate: null }, f)).toBe('Has not turned up at any of the 4 net sessions in the last 8 weeks.')
    expect(netSummarySentence({ ...s, held: 0, attended: 0, lastDate: null, dots: [] }, f)).toBe('No net sessions in the last 8 weeks.')
    expect(netSummarySentence(s, f)).not.toMatch(/%/)
  })
})

describe('selector navigation (wave B spec 4.1)', () => {
  it('keeps exactly four tabs with short labels', () => {
    expect(selectorTabs.map((t) => t.key)).toEqual(['overview', 'availability', 'squads', 'teams'])
    for (const t of selectorTabs) expect(t.label.length, t.label).toBeLessThanOrEqual(12)
  })
  it('the nets pages light up Availability', () => {
    const avail = selectorTabs.find((t) => t.key === 'availability')!
    const overview = selectorTabs.find((t) => t.key === 'overview')!
    for (const p of ['/selector/availability', '/selector/nets', '/selector/nets/12']) expect(isTabActive(avail, p), p).toBe(true)
    expect(isTabActive(overview, '/selector/nets')).toBe(false)
    expect(isTabActive(avail, '/selector/squads')).toBe(false)
  })
})

describe('validateSession', () => {
  it('uses the defaults and a default title', async () => {
    const { validateSession } = await import('@/lib/nets/session')
    expect(validateSession({ date: '2026-10-12' })).toEqual({ ok: true, value: { title: 'Net session', date: '2026-10-12', startTime: null, nets: 3, minutesPerTurn: 10, groupSize: 4, notes: null } })
  })
  it('rejects a bad date, time and out-of-range numbers instead of clamping', async () => {
    const { validateSession } = await import('@/lib/nets/session')
    for (const bad of [{ date: '' }, { date: '2026-02-30' }, { date: '12/10/2026' }, { date: '2026-10-12', startTime: '6pm' }, { date: '2026-10-12', nets: 13 }, { date: '2026-10-12', nets: 0 }, { date: '2026-10-12', minutesPerTurn: 31 }, { date: '2026-10-12', groupSize: 1 }, { date: '2026-10-12', groupSize: 9 }, { date: '2026-10-12', nets: 'x' }, { date: '2026-10-12', nets: 2.5 }]) {
      expect(validateSession(bad).ok, JSON.stringify(bad)).toBe(false)
    }
    expect(validateSession({ date: '2026-10-12', nets: '12', minutesPerTurn: '1', groupSize: '8', startTime: '18:00', title: ' Tue\u0000 nets ' })).toMatchObject({ ok: true, value: { nets: 12, minutesPerTurn: 1, groupSize: 8, startTime: '18:00', title: 'Tue nets' } })
  })
})
