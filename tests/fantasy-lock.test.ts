import { describe, expect, it } from 'vitest'
import { effectiveLock, earliestStart } from '../lib/fantasy/rounds'

const fx = (...s: (string | null)[]) => s.map((startsAt) => ({ startsAt }))

describe('effectiveLock', () => {
  it('is the earliest fixture start of the round', () => expect(effectiveLock({ weekendKey: '2025-10-11', fixtures: fx('2025-10-11T03:00:00Z', '2025-10-12T00:00:00Z') }).toISOString()).toBe('2025-10-11T03:00:00.000Z'))
  it('falls back to 00:00 club time on the Saturday when nothing has a start', () => {
    const d = effectiveLock({ weekendKey: '2025-10-11', fixtures: fx(null) })
    // Melbourne is UTC+11 in October: 00:00 local is 13:00 UTC the day before.
    expect(d.toISOString()).toBe('2025-10-10T13:00:00.000Z')
  })
  it('a committee override can only move the lock earlier', () => {
    expect(effectiveLock({ weekendKey: '2025-10-11', fixtures: fx('2025-10-11T03:00:00Z'), lockOverride: '2025-10-10T20:00:00Z' }).toISOString()).toBe('2025-10-10T20:00:00.000Z')
    expect(effectiveLock({ weekendKey: '2025-10-11', fixtures: fx('2025-10-11T03:00:00Z'), lockOverride: '2025-10-12T20:00:00Z' }).toISOString()).toBe('2025-10-11T03:00:00.000Z')
  })
  it('a fixture moved EARLIER lowers the lock', () => {
    const stored = '2025-10-11T03:00:00Z'
    expect(effectiveLock({ weekendKey: '2025-10-11', storedLocksAt: stored, fixtures: fx('2025-10-11T01:00:00Z') }).toISOString()).toBe('2025-10-11T01:00:00.000Z')
  })
  it('a fixture moved LATER never raises the lock, so a locked round never reopens', () => {
    const stored = '2025-10-11T03:00:00Z'
    expect(effectiveLock({ weekendKey: '2025-10-11', storedLocksAt: stored, fixtures: fx('2025-10-12T03:00:00Z') }).toISOString()).toBe(stored.replace('Z', '.000Z'))
  })
  it('removing the early fixture does not raise the lock either', () => {
    expect(effectiveLock({ weekendKey: '2025-10-11', storedLocksAt: '2025-10-11T01:00:00Z', fixtures: [] }).toISOString()).toBe('2025-10-11T01:00:00.000Z')
  })
  it('earliestStart ignores nulls and bad dates', () => {
    expect(earliestStart(fx(null, 'nope'))).toBeNull()
    expect(earliestStart(fx(null, '2025-10-11T03:00:00Z'))?.toISOString()).toBe('2025-10-11T03:00:00.000Z')
  })
})
