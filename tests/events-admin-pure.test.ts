import { describe, expect, it } from 'vitest'
import { snapToClubDay } from '@/payload/hooks/eventDates'
import { groupByOccurrence } from '@/payload/components/rsvpSummary'

describe('snapToClubDay (spec D12, §3.8)', () => {
  it('keeps a value already at UTC midnight (idempotent; ETL dates)', () => {
    expect(snapToClubDay('2026-11-15T00:00:00.000Z')).toBe('2026-11-15T00:00:00.000Z')
    expect(snapToClubDay(snapToClubDay('2026-11-15T13:00:00.000Z'))).toBe('2026-11-16T00:00:00.000Z')
  })

  it('snaps Melbourne local midnight / noon to that Melbourne day', () => {
    // 2026-11-16 00:00 AEDT (UTC+11) = 2026-11-15T13:00Z
    expect(snapToClubDay('2026-11-15T13:00:00.000Z')).toBe('2026-11-16T00:00:00.000Z')
    // 2026-11-16 12:00 AEDT = 2026-11-16T01:00Z
    expect(snapToClubDay('2026-11-16T01:00:00.000Z')).toBe('2026-11-16T00:00:00.000Z')
    // Winter (AEST, UTC+10): 2026-07-01 00:00 local = 2026-06-30T14:00Z
    expect(snapToClubDay('2026-06-30T14:00:00.000Z')).toBe('2026-07-01T00:00:00.000Z')
  })

  it('a picker west of UTC (local noon in New York) still lands on the intended day', () => {
    // 2026-11-16 12:00 EST = 2026-11-16T17:00Z → Melbourne 2026-11-17 04:00, i.e. the next day
    // in the club timezone; with the club timezone set to New York it stays on the 16th.
    expect(snapToClubDay('2026-11-16T17:00:00.000Z', 'America/New_York')).toBe('2026-11-16T00:00:00.000Z')
    expect(snapToClubDay('2026-11-16T05:00:00.000Z', 'America/New_York')).toBe('2026-11-16T00:00:00.000Z')
  })

  it('returns null for empty or invalid values', () => {
    expect(snapToClubDay(null)).toBeNull()
    expect(snapToClubDay('')).toBeNull()
    expect(snapToClubDay('not a date')).toBeNull()
  })
})

describe('groupByOccurrence (RsvpSummaryField)', () => {
  it('groups per occurrence in date order with tally, meal counts and no-dinner count', () => {
    const groups = groupByOccurrence([
      { id: 3, occurrenceDate: '2026-09-12T18:30:00.000Z', name: 'Casey', response: 'yes', meal: 'Vegetarian' },
      { id: 1, occurrenceDate: '2026-09-12T18:30:00.000Z', name: 'Pat', response: 'yes', meal: 'Beef' },
      { id: 2, occurrenceDate: '2026-09-12T18:30:00.000Z', name: 'Robin', response: 'no', meal: '' },
      { id: 4, occurrenceDate: '2026-09-05T18:30:00.000Z', name: 'Drew', response: 'yes', meal: '' },
    ])
    expect(groups.map((g) => g.iso)).toEqual(['2026-09-05T18:30:00.000Z', '2026-09-12T18:30:00.000Z'])
    const [first, second] = groups
    expect(first).toMatchObject({ tally: { yes: 1, no: 0 }, meals: [], noDinner: 1 })
    expect(second.tally).toEqual({ yes: 2, no: 1 })
    expect(second.going.map((r) => r.name)).toEqual(['Pat', 'Casey'])
    expect(second.notGoing.map((r) => r.name)).toEqual(['Robin'])
    expect(second.meals).toEqual([
      ['Beef', 1],
      ['Vegetarian', 1],
    ])
    expect(second.noDinner).toBe(0)
  })
})
