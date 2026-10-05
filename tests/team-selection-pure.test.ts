import { describe, expect, it } from 'vitest'
import { isSafeAnnouncementLink, validateAnnouncementLink } from '../lib/selection/announcement-link'
import { announcementBody, announcementKey, announcementTitle } from '../lib/selection/announce'
import { formatBatting, formatBowling, NO_DATA, recentEntries } from '../lib/selection/form'
import { formatMatchDay, formatMatchTime, lineupText } from '../lib/selection/lineup-text'
import { balanceCounts, suggestRole } from '../lib/selection/roles'
import { buildSnapshot, describeDiff, diffSnapshots, normaliseSlots, parseSnapshot, sameAsSnapshot, validateGuestName, validateSlots, type Slot } from '../lib/selection/team-sheet'
import { blockingWarnings, teamWarnings, type WarnSlot } from '../lib/selection/warnings'
import { groupByWeekend, localDateOf, weekendKey } from '../lib/selection/weekend'
import { deriveTeamStatus, publishChip } from '../lib/team-status'

const ev = { canKeep: false, keeperActions: 0, bowlBalls: 0, batInnings: 0, batRuns: 0, batNotOuts: 0 }

describe('suggestRole', () => {
  it('table', () => {
    expect(suggestRole({ ...ev, canKeep: true })).toBe('keeper')
    expect(suggestRole({ ...ev, keeperActions: 2, bowlBalls: 500 })).toBe('keeper')
    expect(suggestRole({ ...ev, bowlBalls: 200, batInnings: 10, batRuns: 60 })).toBe('bowler')
    expect(suggestRole({ ...ev, bowlBalls: 200, batInnings: 10, batRuns: 300 })).toBe('all-rounder')
    expect(suggestRole({ ...ev, bowlBalls: 10, batInnings: 8, batRuns: 100 })).toBe('batter')
    expect(suggestRole({ ...ev, bowlBalls: 60, batInnings: 8, batRuns: 100 })).toBe('unknown')
    expect(suggestRole(ev)).toBe('unknown')
  })
  it('counts batters, bowlers, keepers and unknown', () => {
    const c = balanceCounts([{ role: 'batter' }, { role: 'all-rounder' }, { role: 'bowler' }, { role: 'keeper' }, { role: 'unknown', isKeeper: true }, { role: 'unknown' }])
    expect(c).toEqual({ batters: 2, bowlers: 2, keepers: 2, unknown: 2 })
  })
})

describe('guest names and slots', () => {
  it.each([['Sam O’Brien', true], ["Anne-Marie Smith", true], ['A', false], ['Sam 2', false], ['sam@x.com', false], ['0400 123 456', false], ['x'.repeat(41), false], ['  ', false], ['Sam  Smith', true]])('%s -> %s', (name, ok) => {
    expect(validateGuestName(name).ok).toBe(ok)
  })
  it('collapses spaces', () => expect(validateGuestName(' Sam   Smith ')).toEqual({ ok: true, name: 'Sam Smith' }))
  it('validates slots', () => {
    const s = (o: Partial<Slot>): Slot => ({ order: 1, isCaptain: false, isKeeper: false, ...o })
    expect(validateSlots([s({ player: 1 }), s({ player: 2, order: 2 })], 11)).toEqual([])
    expect(validateSlots([s({ player: 1 }), s({ player: 1, order: 2 })], 11)).toHaveLength(1)
    expect(validateSlots([s({ player: 1, guestName: 'Sam Smith' })], 11)).toHaveLength(1)
    expect(validateSlots([s({})], 11)).toHaveLength(1)
    expect(validateSlots([s({ guestName: 'Bad1' })], 11)).toHaveLength(1)
    expect(validateSlots([s({ player: 1 }), s({ player: 2, order: 2 })], 0)).toEqual([])
    expect(validateSlots(Array.from({ length: 12 }, (_, i) => s({ player: i + 1, order: i + 1 })), 11).some((p) => p.index === -1)).toBe(true)
  })
  it('renumbers and keeps one captain and one keeper', () => {
    const out = normaliseSlots([{ player: 5, order: 9, isCaptain: true, isKeeper: false }, { player: 6, order: 3, isCaptain: true, isKeeper: true }, { player: 7, order: 4, isCaptain: false, isKeeper: true }])
    expect(out.map((x) => x.order)).toEqual([1, 2, 3])
    expect(out.map((x) => x.player)).toEqual([6, 7, 5])
    expect(out.filter((x) => x.isCaptain)).toHaveLength(1)
    expect(out.filter((x) => x.isKeeper)).toHaveLength(1)
    expect(out[0].isCaptain).toBe(true)
  })
})

describe('snapshots', () => {
  const slots: Slot[] = [{ player: 1, order: 1, isCaptain: true, isKeeper: false }, { guestName: 'Sam Smith', order: 2, isCaptain: false, isKeeper: true }, { player: 3, order: 3, isCaptain: false, isKeeper: false }]
  const snap = buildSnapshot({ slots, size: 11, revision: 4 }, '2026-10-05T00:00:00.000Z')
  it('builds and parses', () => {
    expect(snap.slots[1]).toEqual({ guestName: 'Sam Smith', order: 2, isCaptain: false, isKeeper: true })
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap)
    expect(parseSnapshot({ slots: [{ order: 1 }], publishedAt: 'x' })).toBeNull()
    expect(parseSnapshot(null)).toBeNull()
  })
  it('knows when the sheet still matches', () => {
    expect(sameAsSnapshot({ slots, size: 11 }, snap)).toBe(true)
    expect(sameAsSnapshot({ slots: slots.slice(0, 2), size: 11 }, snap)).toBe(false)
    expect(sameAsSnapshot({ slots, size: 12 }, snap)).toBe(false)
    expect(publishChip({ slots, size: 11 }, snap)).toBe('published')
    expect(publishChip({ slots: slots.slice(0, 2), size: 11 }, snap)).toBe('published-changed')
    expect(publishChip({ slots, size: 11 }, null)).toBeNull()
  })
  it('diffs in, out, moved and tags', () => {
    const next = buildSnapshot({ slots: [{ player: 3, order: 1, isCaptain: false, isKeeper: false }, { player: 1, order: 2, isCaptain: false, isKeeper: false }, { player: 9, order: 3, isCaptain: false, isKeeper: false }], size: 11, revision: 5 }, 'x')
    const d = diffSnapshots(snap, next)
    expect(d.added.map((s) => s.playerId)).toEqual([9])
    expect(d.removed.map((s) => s.guestName)).toEqual(['Sam Smith'])
    expect(d.moved.map((m) => [m.slot.playerId, m.from, m.slot.order])).toEqual([[3, 3, 1], [1, 1, 2]])
    expect(d.tagged.map((t) => t.slot.playerId)).toEqual([1])
    expect(d.changed).toBe(true)
    expect(describeDiff(d, (s) => s.guestName ?? `P${s.playerId}`)).toContain('P9 is in')
    expect(diffSnapshots(snap, snap).changed).toBe(false)
  })
})

const slot = (o: Partial<WarnSlot> = {}): WarnSlot => ({ name: 'A Player', kind: 'player', role: 'batter', isCaptain: false, isKeeper: false, ...o })
const codes = (i: Parameters<typeof teamWarnings>[0]) => teamWarnings(i).map((w) => w.code)
const full = (n: number, o: Partial<WarnSlot> = {}) => Array.from({ length: n }, (_, i) => slot({ name: `P${i}`, role: i < 6 ? 'batter' : 'bowler', ...o }))

describe('warnings', () => {
  const base = { size: 11 as const, fixtureStatus: 'upcoming' as const, fixtureMovedSinceSave: false }
  it('empty blocks', () => expect(blockingWarnings(teamWarnings({ ...base, slots: [] })).map((w) => w.code)).toEqual(['empty']))
  it('a balanced side has none', () => {
    const slots = [slot({ role: 'keeper', isKeeper: true, isCaptain: true }), ...Array.from({ length: 5 }, () => slot({ role: 'batter' })), ...Array.from({ length: 5 }, () => slot({ role: 'bowler' }))]
    expect(codes({ ...base, slots })).toEqual([])
  })
  it('no keeper, no captain, few bowlers, few batters', () => {
    expect(codes({ ...base, slots: full(11) })).toEqual(expect.arrayContaining(['no-keeper', 'no-captain']))
    expect(codes({ ...base, slots: Array.from({ length: 11 }, () => slot({ role: 'batter' })) })).toContain('few-bowlers')
    expect(codes({ ...base, slots: Array.from({ length: 11 }, () => slot({ role: 'bowler' })) })).toContain('few-batters')
  })
  it('unknown roles above three', () => {
    expect(codes({ ...base, slots: Array.from({ length: 11 }, () => slot({ role: 'unknown' })) })).toContain('unknown-roles')
    expect(codes({ ...base, slots: Array.from({ length: 3 }, () => slot({ role: 'unknown' })) })).not.toContain('unknown-roles')
  })
  it('short of size and over size', () => {
    expect(codes({ ...base, slots: full(10) })).toContain('short-of-size')
    expect(codes({ ...base, size: 0, slots: full(10) })).not.toContain('short-of-size')
    expect(blockingWarnings(teamWarnings({ ...base, slots: full(12) })).map((w) => w.code)).toContain('over-size')
  })
  it('out is strong, hidden and missing and bad guest block, double-booked is strong', () => {
    const w = teamWarnings({ ...base, slots: [slot({ answer: 'out' }), slot({ hidden: true }), slot({ missing: true }), slot({ badGuest: true, kind: 'guest' }), slot({ alsoPickedIn: 'A Grade' })] })
    expect(w.find((x) => x.code === 'player-out')?.strong).toBe(true)
    expect(blockingWarnings(w).map((x) => x.code).sort()).toEqual(['bad-guest', 'player-hidden', 'player-missing'])
    expect(w.find((x) => x.code === 'double-booked')?.strong).toBe(true)
  })
  it('fixture removed or moved', () => {
    expect(codes({ ...base, slots: full(11), fixtureStatus: 'removed' })).toContain('fixture-removed')
    expect(codes({ ...base, slots: full(11), fixtureMovedSinceSave: true })).toContain('fixture-moved')
  })
})

describe('team status', () => {
  const ok = [slot({ role: 'keeper', isKeeper: true, isCaptain: true }), ...Array.from({ length: 10 }, () => slot({ role: 'batter' }))]
  const st = (o: Partial<Parameters<typeof deriveTeamStatus>[0]> = {}) => deriveTeamStatus({ slotCount: ok.length, size: 11, markedReady: true, warnings: [], slots: ok, ...o })
  it('table', () => {
    expect(st({ slotCount: 0, slots: [] })).toBe('not-started')
    expect(st()).toBe('ready')
    expect(st({ markedReady: false })).toBe('in-progress')
    expect(st({ slotCount: 9 })).toBe('in-progress')
    expect(st({ warnings: [{ code: 'player-out', text: '', blocking: false, strong: true }] })).toBe('needs-attention')
    expect(st({ slots: ok.map((s) => ({ ...s, isCaptain: false })) })).toBe('in-progress')
  })
})

describe('form', () => {
  it('formats and never invents zeros', () => {
    expect(formatBatting([{ date: 'a', runs: 23, notOut: false }, { date: 'b', runs: 51, notOut: true }, { date: 'c', runs: 0, notOut: false }])).toBe('23, 51*, 0')
    expect(formatBowling([{ date: 'a', wickets: 2, runs: 31 }, { date: 'b', wickets: 0, runs: 22 }])).toBe('2/31, 0/22')
    expect(formatBatting([])).toBe(NO_DATA)
    expect(formatBowling([])).toBe(NO_DATA)
  })
  it('takes the newest five inside the window', () => {
    const now = new Date('2026-10-05T00:00:00Z')
    const rows = ['2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01', '2025-01-01'].map((date) => ({ date }))
    expect(recentEntries(rows, now).map((r) => r.date)).toEqual(['2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01'])
    expect(recentEntries([{ date: '2025-01-01' }], now)).toEqual([])
  })
})

describe('lineupText', () => {
  const base = { clubName: 'Example CC', gradeName: 'B Grade', opponent: 'Nar Nar Goon', localDate: '2026-10-10', localTime: '13:00:00', venue: 'Home Oval', people: [{ name: 'Sam Smith', isCaptain: true, isKeeper: false }, { name: 'Alex Jones', isCaptain: false, isKeeper: true }], showOrder: true, signOff: 'Go the Rovers!', siteUrl: 'https://example.test/', updated: false, locale: 'en-AU' }
  it('lists the order, tags, sign-off and teams link from the inputs', () => {
    const t = lineupText(base)
    expect(t.split('\n')).toEqual(['Example CC B Grade v Nar Nar Goon, Sat 10 Oct, 1:00pm, Home Oval', '1. Sam Smith (c)', '2. Alex Jones (wk)', 'Go the Rovers! https://example.test/teams'])
  })
  it('prefixes UPDATED, omits an empty sign-off, hides the order, truncates long names', () => {
    expect(lineupText({ ...base, updated: true }).startsWith('UPDATED: ')).toBe(true)
    expect(lineupText({ ...base, signOff: '' }).split('\n').pop()).toBe('https://example.test/teams')
    const hidden = lineupText({ ...base, showOrder: false }).split('\n')
    expect(hidden.slice(1, 3)).toEqual(['- Alex Jones (wk)', '- Sam Smith (c)'])
    expect(lineupText({ ...base, people: [{ name: 'W'.repeat(60), isCaptain: false, isKeeper: false }] })).toContain('…')
  })
  it('formats the day and the time', () => {
    expect(formatMatchTime('00:30:00')).toBe('12:30am')
    expect(formatMatchTime('12:05')).toBe('12:05pm')
    expect(formatMatchTime(null)).toBe('')
    expect(formatMatchDay('2026-10-10', 'en-AU')).toMatch(/Sat/)
  })
})

describe('weekends', () => {
  it('keys a Monday to Sunday week by its Saturday', () => {
    expect(weekendKey('2026-10-05')).toBe('2026-10-10') // Monday
    expect(weekendKey('2026-10-09')).toBe('2026-10-10') // Friday
    expect(weekendKey('2026-10-10')).toBe('2026-10-10')
    expect(weekendKey('2026-10-11')).toBe('2026-10-10') // Sunday
    expect(weekendKey('2026-10-12')).toBe('2026-10-17')
  })
  it('groups and orders', () => {
    const g = groupByWeekend([{ localDate: '2026-10-17' }, { localDate: '2026-10-10' }, { localDate: '2026-10-11' }])
    expect(g.map((x) => [x.key, x.rows.length])).toEqual([['2026-10-10', 2], ['2026-10-17', 1]])
  })
  it('reads the club-local date across midnight', () => {
    // 14:30 UTC on Saturday is 1:30 am Sunday in Melbourne (summer time)
    expect(localDateOf('2026-10-10T14:30:00Z', 'Australia/Melbourne')).toBe('2026-10-11')
    expect(localDateOf('2026-10-10T14:30:00Z', 'UTC')).toBe('2026-10-10')
  })
})

describe('announcement', () => {
  it('builds the key, title and body from the inputs', () => {
    expect(announcementKey('2026-10-10')).toBe('teams:2026-10-10')
    expect(announcementTitle({ label: 'Matchday', firstLocalDate: '2026-10-10', locale: 'en-AU', updated: false })).toBe('Matchday 10 October')
    expect(announcementTitle({ label: 'Matchday', firstLocalDate: '2026-10-10', locale: 'en-AU', updated: true })).toBe('Matchday 10 October (updated)')
    const body = announcementBody([{ gradeName: 'B Grade', opponent: 'Rovers', localDate: '2026-10-10', localTime: '13:00' }], 'en-AU', ['B Grade'])
    expect(body).toContain('B Grade v Rovers (Sat 10 Oct 1:00pm)')
    expect(body).toContain('Updated: B Grade.')
  })
  it('validates the link', () => {
    for (const ok of ['/teams', '/teams/abc?x=1', 'https://example.test/x']) expect(isSafeAnnouncementLink(ok), ok).toBe(true)
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', 'http://example.test', '/\\evil', '', ' ', 'https://', '/a\u0000b', 'JAVASCRIPT:1', 5]) expect(isSafeAnnouncementLink(bad), String(bad)).toBe(false)
    expect(validateAnnouncementLink('')).toBe(true)
    expect(validateAnnouncementLink(null)).toBe(true)
    expect(typeof validateAnnouncementLink('javascript:1')).toBe('string')
  })
})
