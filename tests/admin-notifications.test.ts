import { describe, expect, it } from 'vitest'
import { allCaughtUp, notificationLines, type NotificationInput, type RunFacts } from '@/lib/admin/notifications'
import { notificationCopy } from '@/payload/admin/copy'

const now = new Date('2026-10-04T08:00:00Z')
const opts = (isAdmin: boolean) => ({ isAdmin, adminRoute: '/admin', now, formatDate: (d: Date) => d.toISOString().slice(0, 10) })
const run = (over: Partial<RunFacts> = {}): RunFacts => ({ status: 'ok', startedAt: '2026-10-03T16:00:00Z', finishedAt: '2026-10-03T16:05:00Z', matchesUpserted: 4, matchError: 0, matchMismatches: 0, error: null, ...over })
const input = (over: Partial<NotificationInput> = {}): NotificationInput => ({ latestRun: run(), pending: { stories: 0, photos: 0 }, duplicateCount: null, imports: null, ...over })

describe('notification lines', () => {
  it('committee sees one plain sentence after a good update, and is caught up', () => {
    const lines = notificationLines(input(), opts(false))
    expect(lines.map((l) => l.text)).toEqual([notificationCopy.committee.syncOk])
    expect(allCaughtUp(lines)).toBe(true)
  })

  it('an older good run says when it ran', () => {
    const lines = notificationLines(input({ latestRun: run({ finishedAt: '2026-09-20T16:05:00Z' }) }), opts(false))
    expect(lines[0].text).toBe('Player stats were last updated 2026-09-20.')
  })

  it('a failed update tells the committee to ask the administrator and never shows the raw error', () => {
    const lines = notificationLines(input({ latestRun: run({ status: 'error', error: 'connect ECONNREFUSED 10.0.0.1:5432 password=hunter2' }) }), opts(false))
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe(notificationCopy.committee.syncFailed)
    expect(lines[0].text).toContain('previous numbers')
    expect(JSON.stringify(lines)).not.toMatch(/ECONNREFUSED|hunter2/)
    expect(allCaughtUp(lines)).toBe(false)
  })

  it('the administrator also sees the counts, the error and a link to the sync runs', () => {
    const lines = notificationLines(input({ latestRun: run({ status: 'error', error: 'PlayHQ returned no player data', matchError: 2, matchMismatches: 1, matchesUpserted: 7 }) }), opts(true))
    const text = lines.map((l) => l.text).join(' | ')
    expect(text).toContain('Update error: PlayHQ returned no player data')
    expect(text).toContain('Matches saved: 7. Matches that did not save: 2.')
    expect(text).toContain('disagree with their season totals: 1')
    expect(lines.find((l) => l.key === 'sync-counts')?.href).toBe('/admin/collections/player-sync-runs')
  })

  it('pending stories and photos come first, with links', () => {
    const lines = notificationLines(input({ pending: { stories: 1, photos: 3 } }), opts(false))
    expect(lines.map((l) => l.key)).toEqual(['stories', 'photos', 'sync-ok'])
    expect(lines[0].text).toBe('1 story is waiting for approval')
    expect(lines[1].text).toBe('3 photos are waiting for approval')
    expect(lines[1].href).toBe('/admin/approvals')
  })

  it('duplicates and the import log are for admins only', () => {
    const i = input({ duplicateCount: 4, imports: { count: 2, latest: { at: '2026-09-30T00:00:00Z', seasons: 12, matches: 1 } } })
    expect(notificationLines(i, opts(false)).map((l) => l.key)).toEqual(['sync-ok'])
    const admin = notificationLines(i, opts(true))
    expect(admin.map((l) => l.key)).toContain('duplicates')
    expect(admin.find((l) => l.key === 'imports')?.text).toBe('2 imports in the history. The latest was 2026-09-30 (12 season rows, 1 game).')
    expect(admin.find((l) => l.key === 'duplicates')?.text).toBe('4 possible duplicate players to look at')
  })

  it('has no milestone-crossing line in W2', () => {
    const all = notificationLines(input({ pending: { stories: 2, photos: 2 }, duplicateCount: 3, imports: { count: 1, latest: { at: '2026-09-30T00:00:00Z', seasons: 1, matches: 0 } } }), opts(true))
    expect(all.some((l) => /milestone/i.test(l.text))).toBe(false)
  })

  it('no run, nothing pending: caught up with no lines', () => {
    const lines = notificationLines(input({ latestRun: null }), opts(false))
    expect(lines).toEqual([])
    expect(allCaughtUp(lines)).toBe(true)
  })

  it('a running update is information, not a problem', () => {
    const lines = notificationLines(input({ latestRun: run({ status: 'running', finishedAt: null }) }), opts(false))
    expect(lines[0].text).toBe(notificationCopy.committee.syncRunning)
    expect(allCaughtUp(lines)).toBe(true)
  })
})
