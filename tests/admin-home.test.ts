import { describe, expect, it } from 'vitest'
import { attentionItems, greetingLine, VOLUNTEER_LOOKAHEAD_DAYS } from '@/lib/admin/attention'
import { clubDayKey, formatClubDate, formatClubDay } from '@/lib/admin/club-day'
import { homeMilestoneRows } from '@/lib/admin/home-milestones'
import type { NotificationInput } from '@/lib/admin/notifications'
import { buildSeasonGlance, buildSeasonGlances, SEASON_CARD_MAX_AGE_DAYS, type GlanceFixture, type GlanceMatch } from '@/lib/admin/season-glance'
import { fillStatus } from '@/lib/office/volunteers'
import { progressionByGrade, type ResultLine } from '@/lib/stats/match/yearbook'
import { summariseResults } from '@/lib/stats/yearbook'
import type { Game } from '@/lib/playhq/types'
import { homeTiles, jobTiles, MAX_PRIMARY_TILES } from '@/payload/admin/navigation'

const BANNED = /\b(collections?|globals?|slugs?|relationships?|derived|sync runs?|fields?|docs?|populate[sd]?|documents?)\b/i
/** ICU versions differ on the comma after the weekday ("Thu, 15 Oct" or "Thu 15 Oct"). */
const plain = (s: string) => s.replace(/,/g, '')
const clock = { timeZone: 'Australia/Melbourne', locale: 'en-AU' }
const now = new Date('2026-10-14T02:00:00Z')
const base = (over: Partial<NotificationInput> = {}): NotificationInput => ({ latestRun: null, pending: { stories: 0, photos: 0 }, duplicateCount: null, imports: null, ...over })
const opts = (isAdmin: boolean, volunteers?: { empty: number; date: string; daysAway: number } | null) => ({ isAdmin, adminRoute: '/admin', clock, now, volunteers })

describe('attention items', () => {
  it('is empty when nothing needs doing, even with good sync and info-only facts', () => {
    const items = attentionItems(base({
      latestRun: { status: 'ok', startedAt: '2026-10-13T16:00:00Z', finishedAt: '2026-10-13T16:05:00Z', matchesUpserted: 4, matchError: 0, matchMismatches: 0, error: null },
      social: { failed: 0, dueSoon: 3, overdue: 0 }, imports: { count: 2, latest: { at: '2026-09-30T00:00:00Z', seasons: 1, matches: 1 } },
    }), opts(true))
    expect(items).toEqual([])
    expect(greetingLine(items.length)).toBe("You're all caught up.")
  })

  it('says each task as a plain sentence with one action', () => {
    const items = attentionItems(base({ pending: { stories: 1, photos: 3 }, social: { failed: 2, dueSoon: 0, overdue: 0 } }), opts(false))
    expect(items.map((i) => i.text)).toEqual([
      '1 story is waiting for approval', '3 photos are waiting for approval', '2 posts need a look',
    ])
    for (const i of items) {
      expect(i.action).toBeTruthy()
      expect(i.href).toMatch(/^\/admin\//)
      expect(i.text).not.toMatch(BANNED)
      expect(i.action ?? '').not.toMatch(BANNED)
    }
    expect(items[2].count).toBe(2)
    expect(greetingLine(3)).toBe('Three things are waiting for you.')
    expect(greetingLine(1)).toBe('One thing is waiting for you.')
  })

  it('keeps sync internals out of the list and shows a failed update to the committee without a button', () => {
    const failed = { status: 'error', startedAt: '2026-10-13T16:00:00Z', finishedAt: '2026-10-13T16:05:00Z', matchesUpserted: 5, matchError: 2, matchMismatches: 1, error: 'secret detail' }
    const editor = attentionItems(base({ latestRun: failed }), opts(false))
    expect(editor).toHaveLength(1)
    expect(editor[0].action).toBeNull()
    expect(JSON.stringify(editor)).not.toMatch(/secret detail|Matches saved|sync runs/i)
    const admin = attentionItems(base({ latestRun: failed }), opts(true))
    expect(admin[0].action).toBe('Open System health')
    expect(admin[0].href).toBe('/admin#system-health')
    expect(JSON.stringify(admin)).not.toMatch(/Matches saved|totals disagree|secret detail/)
  })

  it('never gives admin-only items to an editor', () => {
    const input = base({ duplicateCount: 4, fees: { members: 2, text: 'x' }, signIn: { testFailedAt: '2026-10-13T00:00:00Z', unlinked: 0 } })
    expect(attentionItems(input, opts(false))).toEqual([])
    expect(attentionItems(input, opts(true)).map((i) => i.key).sort()).toEqual(['duplicates', 'fees-owing', 'signin-unreachable'])
  })

  it('volunteer spots: the next game day only, floored per job, in club time, via the roster helper', () => {
    // Two jobs: gate needs 3 and has 1; scoring needs 1 and has 2 (an extra person never offsets a gap). A later week must not count.
    const shifts = [{ id: 1, slots: 3 }, { id: 2, slots: 1 }]
    const people = [
      { shiftId: 1, state: 'confirmed' }, { shiftId: 2, state: 'confirmed' }, { shiftId: 2, state: 'confirmed' },
    ] as Parameters<typeof fillStatus>[1]
    const fill = fillStatus(shifts, people)
    expect(fill.empty).toBe(2)
    const later = fillStatus([{ id: 9, slots: 5 }], [])
    expect(later.empty).toBe(5)
    const items = attentionItems(base(), opts(false, { empty: fill.empty, date: '2026-10-15', daysAway: 1 }))
    expect(items).toHaveLength(1)
    expect(plain(items[0].text)).toBe('2 volunteer spots are still empty for Thu 15 Oct')
    expect(items[0].count).toBe(fill.empty)
    expect(items[0].href).toBe('/admin/office/volunteers')
    expect(items[0].note).toContain('no-show')
  })

  it('volunteer rows need empty spots and a game day inside the lookahead', () => {
    expect(attentionItems(base(), opts(false, { empty: 0, date: '2026-10-15', daysAway: 1 }))).toEqual([])
    expect(attentionItems(base(), opts(false, { empty: 4, date: '2026-12-01', daysAway: VOLUNTEER_LOOKAHEAD_DAYS + 1 }))).toEqual([])
    expect(plain(attentionItems(base(), opts(false, { empty: 1, date: '2026-10-15', daysAway: 1 }))[0].text)).toBe('1 volunteer spot is still empty for Thu 15 Oct')
  })
})

describe('club day formatting', () => {
  it('reads an instant in the club zone across a day boundary', () => {
    // 23:30 UTC on the 14th is already the 15th in Melbourne (UTC+11), and still the 14th in UTC.
    const at = new Date('2026-10-14T23:30:00Z')
    expect(plain(formatClubDay(at, clock))).toBe('Thu 15 Oct')
    expect(plain(formatClubDay(at, { ...clock, timeZone: 'UTC' }))).toBe('Wed 14 Oct')
    expect(clubDayKey(at, clock.timeZone)).toBe('2026-10-15')
    expect(formatClubDate(at, clock)).toBe('15 Oct 2026')
  })
  it('keeps a calendar day as that day whatever the zone', () => {
    expect(plain(formatClubDay('2026-10-15', clock))).toBe('Thu 15 Oct')
    expect(plain(formatClubDay('2026-10-15', { timeZone: 'America/Los_Angeles', locale: 'en-AU' }))).toBe('Thu 15 Oct')
  })
  it('follows the club locale', () => {
    expect(formatClubDay('2026-10-15', { timeZone: 'America/New_York', locale: 'en-US' })).toMatch(/Thu,? Oct 15/)
  })
})

describe('home quick actions', () => {
  it('has at most six primary buttons and the rest under More', () => {
    const { primary, more } = homeTiles()
    expect(primary.length).toBeGreaterThanOrEqual(4)
    expect(primary.length).toBeLessThanOrEqual(MAX_PRIMARY_TILES)
    expect(primary.length + more.length).toBe(jobTiles.length)
    expect(new Set([...primary, ...more].map((t) => t.key)).size).toBe(jobTiles.length)
    expect(primary[0].key).toBe('social')
  })
})

describe('milestone rows', () => {
  it('shows at most four rows, plain gap text, people who just reached one first', () => {
    const rows = homeMilestoneRows({
      achieved: [{ playerId: 1, name: 'Ari Quill', hidden: false, key: 'games', threshold: 100 }],
      approaching: [
        { playerId: 2, name: 'Ben Oakley', hidden: true, key: 'runs', threshold: 1000, remaining: 2 },
        { playerId: 3, name: 'Cy Vance', hidden: false, key: 'wickets', threshold: 50, remaining: 1 },
        { playerId: 4, name: 'Di Yardley', hidden: false, key: 'games', threshold: 50, remaining: 3 },
        { playerId: 5, name: 'Ed Zeller', hidden: false, key: 'catches', threshold: 25, remaining: 4 },
      ],
    }, 'en-AU')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ text: 'Reached 100 games', reached: true, initials: 'AQ' })
    expect(rows[1]).toMatchObject({ text: '2 runs from 1,000', hidden: true })
    expect(rows[2].text).toBe('1 wicket from 50')
  })
  it('is empty with nobody close', () => {
    expect(homeMilestoneRows({ achieved: [], approaching: [] }, 'en-AU')).toEqual([])
  })
})

// ---- season at a glance ----
const m = (over: Partial<GlanceMatch> & { gameId: string }): GlanceMatch => ({
  localDate: '2026-10-10', seasonStartYear: 2026, gradeName: 'A Grade', clubTeamName: 'Seniors', opponentName: 'Riverbend', opponentOrgName: 'Riverbend CC', type: 'ONE_DAY',
  result: 'won', byForfeit: false, onFirstInnings: false, ...over,
})
const fx = (over: Partial<GlanceFixture> & { gameId: string }): GlanceFixture => ({ gradeName: 'A Grade', localDate: '2026-10-17', localTime: '13:00', opponentName: 'Hillcrest', isHome: true, ...over })
const asOf = new Date('2026-10-13T16:00:00Z')
const input = (matches: GlanceMatch[], over: Partial<Parameters<typeof buildSeasonGlance>[0]> = {}) => ({ matches, fixtures: [fx({ gameId: 'f1' })], asOf, now, today: '2026-10-14', ...over })

describe('season at a glance', () => {
  const season = [
    m({ gameId: 'g1', localDate: '2026-10-03', result: 'won' }),
    m({ gameId: 'g2', localDate: '2026-10-10', result: 'lost' }),
    m({ gameId: 'g3', localDate: '2026-09-26', result: 'won' }),
    m({ gameId: 'b1', gradeName: 'B Grade', clubTeamName: 'Reserves', localDate: '2026-10-10', result: 'won' }),
    m({ gameId: 'j1', gradeName: 'Under 12 Blue', clubTeamName: 'Juniors', result: 'won' }),
    m({ gameId: 'old', seasonStartYear: 2025, localDate: '2026-03-01', result: 'won' }),
  ]

  it('lists every senior grade of the latest season, juniors and older seasons left out', () => {
    const all = buildSeasonGlances(input(season))
    expect(all.map((g) => [g.grade, g.team, g.played, g.won, g.lost])).toEqual([['A Grade', 'Seniors', 3, 2, 1], ['B Grade', 'Reserves', 1, 1, 0]])
    expect(all[1].nextGame).toBeNull() // the only fixture is A Grade's
    expect(buildSeasonGlances(input(season, { asOf: null }))).toEqual([])
  })

  it('names the leading senior grade and counts with the season helpers', () => {
    const g = buildSeasonGlance(input(season))!
    expect(g).toMatchObject({ team: 'Seniors', grade: 'A Grade', seasonStartYear: 2026, played: 3, won: 2, lost: 1 })
    expect(g.nextGame).toEqual({ date: '2026-10-17', time: '13:00', opponent: 'Hillcrest', home: true })
    expect(g.lastResult).toMatchObject({ opponent: 'Riverbend CC', word: 'Lost', date: '2026-10-10' })
    expect(g.ladder).toBeNull()
  })

  it('equals the yearbook helper on a fixture with a forfeit and an abandoned game', () => {
    const rows = [
      m({ gameId: 'a', localDate: '2026-09-20', result: 'won' }),
      m({ gameId: 'b', localDate: '2026-09-27', result: 'won', byForfeit: true }),
      m({ gameId: 'c', localDate: '2026-10-04', result: 'abandoned' }),
      m({ gameId: 'd', localDate: '2026-10-11', result: 'lost' }),
      m({ gameId: 'e', localDate: '2026-10-12', result: 'draw' }),
    ]
    const g = buildSeasonGlance(input(rows))!
    const lines: ResultLine[] = rows.map((r) => ({ gameId: r.gameId, date: r.localDate, round: null, isFinalRound: false, grade: 'A Grade', team: 'Seniors', opponent: 'x', format: '', result: r.result, forfeit: r.byForfeit, onFirstInnings: false, club: [], opp: [] }))
    const cells = progressionByGrade(lines)[0].cells
    expect(g.won).toBe(cells[cells.length - 1].wins)
    expect(g.lost).toBe(cells[cells.length - 1].losses)
    expect([g.won, g.lost]).toEqual([2, 1])
    // "Played" agrees with the PlayHQ-side summary, which leaves abandoned games out.
    const games = rows.map((r) => ({ status: r.result === 'abandoned' ? 'ABANDONED' : 'FINAL', club: { outcome: r.result === 'won' ? 'WON' : r.result === 'lost' ? 'LOST' : 'DRAWN' } }) as unknown as Game)
    expect(g.played).toBe(summariseResults(games).played)
    expect(g.lastResult?.word).toBe('Drawn')
  })

  it('is left out when the data is older than the limit, or unknown', () => {
    const stale = new Date(now.getTime() - (SEASON_CARD_MAX_AGE_DAYS + 1) * 86_400_000)
    expect(buildSeasonGlance(input(season, { asOf: stale }))).toBeNull()
    expect(buildSeasonGlance(input(season, { asOf: new Date(now.getTime() - SEASON_CARD_MAX_AGE_DAYS * 86_400_000) }))).not.toBeNull()
    expect(buildSeasonGlance(input(season, { asOf: null }))).toBeNull()
    expect(buildSeasonGlance(input([]))).toBeNull()
    expect(buildSeasonGlance(input([season[4]]))).toBeNull() // juniors only
  })

  it('drops a ladder that belongs to another grade or season', () => {
    const ok = buildSeasonGlance(input(season, { ladder: { gradeName: 'A Grade', seasonStartYear: 2026, position: 2, of: 8 } }))!
    expect(ok.ladder).toEqual({ position: 2, of: 8 })
    expect(buildSeasonGlance(input(season, { ladder: { gradeName: 'B Grade', seasonStartYear: 2026, position: 1, of: 8 } }))!.ladder).toBeNull()
    const other = buildSeasonGlance(input(season, { ladder: { gradeName: 'A Grade', seasonStartYear: 2025, position: 1, of: 8 } }))!
    expect(other.ladder).toBeNull()
    expect(other.played).toBe(3)
  })

  it('uses public labels and only upcoming games of the named grade', () => {
    const g = buildSeasonGlance(input(season, {
      gradeLabel: (x) => (x === 'A Grade' ? 'A Division' : (x ?? '')), teamLabel: (x) => (x ? `The ${x}` : ''),
      fixtures: [fx({ gameId: 'p', gradeName: 'B Grade', localDate: '2026-10-15' }), fx({ gameId: 'q', gradeName: 'A Grade', localDate: '2026-10-13' }), fx({ gameId: 'r', gradeName: 'A Grade', localDate: '2026-10-24', localTime: null })],
    }))!
    expect(g.grade).toBe('A Division')
    expect(g.team).toBe('The Seniors')
    expect(g.nextGame).toEqual({ date: '2026-10-24', time: null, opponent: 'Hillcrest', home: true })
  })
})
