import { describe, it, expect } from 'vitest'
import { formatLocalDate, formatLocalTime, dateParts, formatIsoMelbourne, seasonHref } from '@/lib/playhq/format'

describe('format', () => {
  it('local date', () => {
    expect(formatLocalDate('2025-10-25')).toBe('Sat 25 Oct 2025')
    expect(formatLocalDate('2025-10-25', { weekday: false })).toBe('25 Oct 2025')
    expect(dateParts('2025-10-25')).toEqual({ day: '25', month: 'Oct' })
  })
  it('local time', () => {
    expect(formatLocalTime('13:00:00')).toBe('1:00 pm')
    expect(formatLocalTime('09:30:00')).toBe('9:30 am')
    expect(formatLocalTime(null)).toBeNull()
  })
  it('iso → Melbourne', () => expect(formatIsoMelbourne('2025-10-25T02:00:00.000Z')).toBe('Sat 25 Oct 2025'))
  it('hrefs', () => {
    expect(seasonHref('/fixtures', 'Summer 2026/27')).toBe('/fixtures?season=Summer%202026%2F27')
    expect(seasonHref('/fixtures', 'Summer 2026/27', 'abc')).toBe('/fixtures?season=Summer%202026%2F27&team=abc')
    expect(seasonHref('/teams', null)).toBe('/teams')
  })
})
