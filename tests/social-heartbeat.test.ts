import { describe, expect, it } from 'vitest'
import { ago, heartbeatView, overdueAfterMinutes, smoothInterval } from '@/lib/social/heartbeat-math'

const now = new Date('2026-10-12T12:00:00Z')
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000)

describe('heartbeat', () => {
  it('smooths the observed interval and ignores gaps under a few minutes', () => {
    expect(smoothInterval(null, null)).toBeNull()
    expect(smoothInterval(null, 10)).toBe(10)
    expect(smoothInterval(10, 20)).toBe(15)
    expect(smoothInterval(10, 0.2)).toBe(10) // a hand-made call a moment after the last run is ignored
    expect(smoothInterval(null, 1)).toBeNull()
    expect(smoothInterval(1440, 2)).toBe(1440)
    expect(smoothInterval(7, null)).toBe(7)
  })
  it('counts a post overdue after twice the interval, or 30 minutes when none is known', () => {
    expect(overdueAfterMinutes(10)).toBe(20)
    expect(overdueAfterMinutes(1440)).toBe(2880)
    expect(overdueAfterMinutes(null)).toBe(30)
  })
  it('says how long ago in plain words', () => {
    expect(ago(minsAgo(0), now)).toBe('just now')
    expect(ago(minsAgo(1), now)).toBe('1 minute ago')
    expect(ago(minsAgo(25), now)).toBe('25 minutes ago')
    expect(ago(minsAgo(180), now)).toBe('3 hours ago')
  })
  it('shows "Not checked yet" and "Last checked N minutes ago"', () => {
    expect(heartbeatView({ lastRunAt: null, observedMinutes: null, scheduledCount: 0, overdueCount: 0, now }).lastChecked).toBe('Not checked yet')
    expect(heartbeatView({ lastRunAt: minsAgo(4), observedMinutes: 5, scheduledCount: 0, overdueCount: 0, now }).lastChecked).toBe('Last checked 4 minutes ago')
  })
  it('warns when a scheduled post is overdue, or the last check is stale while posts wait', () => {
    expect(heartbeatView({ lastRunAt: minsAgo(4), observedMinutes: 5, scheduledCount: 1, overdueCount: 0, now }).warning).toBeNull()
    expect(heartbeatView({ lastRunAt: minsAgo(4), observedMinutes: 5, scheduledCount: 1, overdueCount: 1, now }).warning).toMatch(/not going out/)
    const stale = heartbeatView({ lastRunAt: minsAgo(300), observedMinutes: 5, scheduledCount: 2, overdueCount: 0, now })
    expect(stale.warning).toMatch(/last checked 5 hours ago/)
    expect(heartbeatView({ lastRunAt: minsAgo(300), observedMinutes: 5, scheduledCount: 0, overdueCount: 0, now }).warning).toBeNull()
  })
  it('only states a cadence it has seen', () => {
    expect(heartbeatView({ lastRunAt: null, observedMinutes: null, scheduledCount: 0, overdueCount: 0, now }).cadence).toBeNull()
    expect(heartbeatView({ lastRunAt: minsAgo(1), observedMinutes: 10, scheduledCount: 0, overdueCount: 0, now }).cadence).toContain('about every 10 minutes')
    expect(heartbeatView({ lastRunAt: minsAgo(1), observedMinutes: 1440, scheduledCount: 0, overdueCount: 0, now }).cadence).toContain('24 hours')
  })

  it('says nothing about a late scheduler until one gap between runs has been seen', () => {
    expect(heartbeatView({ lastRunAt: minsAgo(600), observedMinutes: null, scheduledCount: 2, overdueCount: 1, now }).warning).toBeNull()
    expect(heartbeatView({ lastRunAt: minsAgo(600), observedMinutes: 10, scheduledCount: 2, overdueCount: 0, now }).warning).toContain('not going out')
  })
})
