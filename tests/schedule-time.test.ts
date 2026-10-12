import { describe, expect, it } from 'vitest'
import { checkScheduleTime, DEFAULT_WINDOW, insideWindow, quietHoursText, resolveWindow, utcToClubParts, zonedToUtc } from '@/lib/social/schedule-time'

const TZ = 'Australia/Melbourne'

describe('club time to UTC', () => {
  it('uses the right offset either side of the daylight-saving change', () => {
    // Melbourne: AEDT (UTC+11) until 5 Apr 2026, then AEST (UTC+10); back to AEDT on 4 Oct 2026.
    expect(zonedToUtc('2026-03-01', '18:30', TZ)?.toISOString()).toBe('2026-03-01T07:30:00.000Z')
    expect(zonedToUtc('2026-06-01', '18:30', TZ)?.toISOString()).toBe('2026-06-01T08:30:00.000Z')
    expect(zonedToUtc('2026-10-03', '12:00', TZ)?.toISOString()).toBe('2026-10-03T02:00:00.000Z')
    expect(zonedToUtc('2026-10-05', '12:00', TZ)?.toISOString()).toBe('2026-10-05T01:00:00.000Z')
  })
  it('handles the changeover day itself', () => {
    expect(zonedToUtc('2026-10-04', '01:30', TZ)?.toISOString()).toBe('2026-10-03T15:30:00.000Z')
    expect(zonedToUtc('2026-10-04', '03:30', TZ)?.toISOString()).toBe('2026-10-03T16:30:00.000Z')
    expect(zonedToUtc('2026-04-05', '01:30', TZ)?.toISOString()).toBe('2026-04-04T14:30:00.000Z')
  })
  it('refuses a time that does not exist (skipped by the clocks) and bad input', () => {
    expect(zonedToUtc('2026-10-04', '02:30', TZ)).toBeNull()
    expect(zonedToUtc('2026-13-01', '10:00', TZ)).toBeNull()
    expect(zonedToUtc('2026-10-04', '25:00', TZ)).toBeNull()
    expect(zonedToUtc('nope', '10:00', TZ)).toBeNull()
  })
  it('round trips through the club parts', () => {
    const d = zonedToUtc('2026-11-20', '18:30', TZ)!
    expect(utcToClubParts(d, TZ)).toEqual({ date: '2026-11-20', time: '18:30' })
  })
})

describe('quiet hours', () => {
  it('knows the window, including its edges and one that wraps midnight', () => {
    expect(insideWindow('07:00', DEFAULT_WINDOW)).toBe(true)
    expect(insideWindow('21:00', DEFAULT_WINDOW)).toBe(true)
    expect(insideWindow('06:59', DEFAULT_WINDOW)).toBe(false)
    expect(insideWindow('21:01', DEFAULT_WINDOW)).toBe(false)
    expect(insideWindow('23:30', { earliest: '22:00', latest: '06:00' })).toBe(true)
    expect(insideWindow('12:00', { earliest: '22:00', latest: '06:00' })).toBe(false)
  })
  it('falls back to the default window on bad values', () => {
    expect(resolveWindow({ earliest: 'x', latest: '25:00' })).toEqual(DEFAULT_WINDOW)
    expect(resolveWindow(null)).toEqual(DEFAULT_WINDOW)
    expect(resolveWindow({ earliest: '08:15', latest: '20:00' })).toEqual({ earliest: '08:15', latest: '20:00' })
  })
  it('says why in plain words', () => {
    const t = quietHoursText(DEFAULT_WINDOW)
    expect(t).toContain('outside')
    expect(t).toMatch(/7(:00)? am/i)
    expect(t).toMatch(/9(:00)? pm/i)
  })
})

describe('checking a schedule time', () => {
  const now = new Date('2026-10-12T00:00:00Z')
  const base = { tz: TZ, now, window: DEFAULT_WINDOW, allowOutside: false }
  it('accepts a future time inside the window', () => {
    const r = checkScheduleTime({ ...base, date: '2026-10-13', time: '18:30' })
    expect(r).toMatchObject({ ok: true, outside: false })
  })
  it('rejects the past', () => {
    expect(checkScheduleTime({ ...base, date: '2026-10-11', time: '18:30' }).ok).toBe(false)
  })
  it('needs the tick outside the window, then allows it', () => {
    expect(checkScheduleTime({ ...base, date: '2026-10-13', time: '23:30' }).ok).toBe(false)
    expect(checkScheduleTime({ ...base, date: '2026-10-13', time: '23:30', allowOutside: true })).toMatchObject({ ok: true, outside: true })
  })
  it('asks for a date and time', () => {
    expect(checkScheduleTime({ ...base, date: null, time: null }).ok).toBe(false)
  })
})
