import { describe, it, expect } from 'vitest'
import { getOccurrences, getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

describe('getOccurrences', () => {
  it('returns every matching weekday between startDate and endDate, with eventTime merged in', () => {
    // Thursdays in October 2026: 1, 8, 15, 22, 29
    const event = { dayOfWeek: 4, eventTime: '18:00', startDate: utcDate(2026, 10, 1), endDate: utcDate(2026, 10, 31) }
    const result = getOccurrences(event, { from: utcDate(2026, 10, 1), to: utcDate(2026, 10, 31) })
    expect(result.map((d) => d.toISOString())).toEqual([
      '2026-10-01T18:00:00.000Z',
      '2026-10-08T18:00:00.000Z',
      '2026-10-15T18:00:00.000Z',
      '2026-10-22T18:00:00.000Z',
      '2026-10-29T18:00:00.000Z',
    ])
  })

  it('is inclusive when endDate lands exactly on the target weekday', () => {
    // 2026-10-29 is a Thursday.
    const event = { dayOfWeek: 4, eventTime: '18:00', startDate: utcDate(2026, 10, 29), endDate: utcDate(2026, 10, 29) }
    const result = getOccurrences(event, { from: utcDate(2026, 10, 1), to: utcDate(2026, 12, 31) })
    expect(result).toHaveLength(1)
  })

  it('returns nothing when the requested range never overlaps the series', () => {
    const event = { dayOfWeek: 4, eventTime: '18:00', startDate: utcDate(2026, 10, 1), endDate: utcDate(2026, 10, 31) }
    const result = getOccurrences(event, { from: utcDate(2027, 1, 1), to: utcDate(2027, 1, 31) })
    expect(result).toEqual([])
  })

  it('returns nothing when the range never includes the target weekday', () => {
    // A 3-day range (Mon-Wed) can never contain a Thursday.
    const event = { dayOfWeek: 4, eventTime: '18:00', startDate: utcDate(2026, 10, 1), endDate: utcDate(2026, 10, 31) }
    const result = getOccurrences(event, { from: utcDate(2026, 10, 5), to: utcDate(2026, 10, 7) })
    expect(result).toEqual([])
  })
})

describe('getOneTimeEventDateTime', () => {
  it('merges eventTime into eventDate the same way getOccurrences does', () => {
    const result = getOneTimeEventDateTime({ eventDate: utcDate(2026, 11, 15), eventTime: '14:30' })
    expect(result.toISOString()).toBe('2026-11-15T14:30:00.000Z')
  })

  it('defaults to midnight when eventTime is empty', () => {
    const result = getOneTimeEventDateTime({ eventDate: utcDate(2026, 11, 15), eventTime: '' })
    expect(result.toISOString()).toBe('2026-11-15T00:00:00.000Z')
  })
})

describe('nowAsEventClock', () => {
  it('encodes Melbourne wall-clock time (AEST, UTC+10) into UTC fields', () => {
    // 2026-07-15T08:00:00Z is 18:00 in Melbourne during AEST (winter, UTC+10).
    const result = nowAsEventClock(new Date('2026-07-15T08:00:00.000Z'))
    expect(result.toISOString()).toBe('2026-07-15T18:00:00.000Z')
  })

  it('encodes Melbourne wall-clock time (AEDT, UTC+11) into UTC fields', () => {
    // 2027-01-15T07:00:00Z is 18:00 in Melbourne during AEDT (summer, UTC+11).
    const result = nowAsEventClock(new Date('2027-01-15T07:00:00.000Z'))
    expect(result.toISOString()).toBe('2027-01-15T18:00:00.000Z')
  })

  it('can roll the wall-clock date across the UTC day boundary', () => {
    // 2026-07-15T23:00:00Z real UTC is already 2026-07-16T09:00 in Melbourne (UTC+10).
    const result = nowAsEventClock(new Date('2026-07-15T23:00:00.000Z'))
    expect(result.toISOString()).toBe('2026-07-16T09:00:00.000Z')
  })
})
