import { describe, it, expect } from 'vitest'
import { PEOPLE_SECTIONS, groupPeople, sectionLabel, sectionOf } from '@/lib/people'

const person = (name: string, section: string, sortOrder = 0) => ({ name, section, sortOrder })

describe('sectionOf', () => {
  it('returns known sections unchanged', () => {
    for (const { key } of PEOPLE_SECTIONS) expect(sectionOf(key)).toBe(key)
  })

  it('falls back to committee for unknown or missing values', () => {
    expect(sectionOf('bogus')).toBe('committee')
    expect(sectionOf('')).toBe('committee')
    expect(sectionOf(null)).toBe('committee')
    expect(sectionOf(undefined)).toBe('committee')
  })
})

describe('sectionLabel', () => {
  it('maps keys to labels and unknown values to Committee', () => {
    expect(sectionLabel('leadership')).toBe('Senior Leadership Team')
    expect(sectionLabel('coach')).toBe('Junior Coaches')
    expect(sectionLabel('nope')).toBe('Committee')
  })
})

describe('groupPeople', () => {
  it('returns sections in leadership, committee, coach order', () => {
    const groups = groupPeople([person('C', 'coach'), person('A', 'committee'), person('B', 'leadership')])
    expect(groups.map((g) => g.key)).toEqual(['leadership', 'committee', 'coach'])
    expect(groups.map((g) => g.label)).toEqual(['Senior Leadership Team', 'Committee', 'Junior Coaches'])
  })

  it('sorts within a section by sortOrder then name', () => {
    const groups = groupPeople([
      person('Zed', 'committee', 1),
      person('Bob', 'committee', 2),
      person('Amy', 'committee', 1),
      person('Cal', 'committee', 0),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].people.map((p) => p.name)).toEqual(['Cal', 'Amy', 'Zed', 'Bob'])
  })

  it('omits empty sections and returns [] for no rows', () => {
    expect(groupPeople([])).toEqual([])
    const groups = groupPeople([person('Only', 'coach')])
    expect(groups.map((g) => g.key)).toEqual(['coach'])
  })

  it('treats unknown section values as committee', () => {
    const groups = groupPeople([person('Mystery', 'whatever')])
    expect(groups).toEqual([{ key: 'committee', label: 'Committee', people: [person('Mystery', 'whatever')] }])
  })

  it('does not mutate the input', () => {
    const rows = [person('B', 'committee', 1), person('A', 'committee', 0)]
    const copy = [...rows]
    groupPeople(rows)
    expect(rows).toEqual(copy)
  })
})
