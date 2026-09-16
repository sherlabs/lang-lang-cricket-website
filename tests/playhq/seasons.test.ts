import { describe, it, expect } from 'vitest'
import seasons from '../fixtures/playhq/seasons.json'
import { groupSeasons, pickDefaultSeason, isJuniorCompetition } from '@/lib/playhq/seasons'
import type { RawSeason } from '@/lib/playhq/types'

const raw = seasons.data as RawSeason[]

describe('isJuniorCompetition', () => {
  it.each([
    ['CCCA Junior Competition', true],
    ['CCCA U15 All Star Girls', true],
    ['Junior Winter Cricket', true],
    ['CCCA Senior Competition', false],
    ['CCCA Kookaburra Cup', false],
  ])('%s → %s', (name, expected) => expect(isJuniorCompetition(name)).toBe(expected))
})

describe('groupSeasons', () => {
  const groups = groupSeasons(raw)
  it('groups by season name, newest first', () => {
    expect(groups.map((g) => g.name)).toEqual([
      'Summer 2026/27', 'Winter 2026', 'Summer 2025/26', 'Summer 2024/25', 'Summer 2023/24',
    ])
  })
  it('Summer 2026/27 spans junior, senior and girls comps', () => {
    const g = groups[0]
    expect(g.seasons.map((s) => s.competitionName).sort()).toEqual([
      'CCCA Junior Competition', 'CCCA Senior Competition', 'CCCA U15 All Star Girls',
    ])
    expect(g.status).toBe('UPCOMING')
    expect(g.seasons.find((s) => s.competitionName === 'CCCA Senior Competition')?.isJunior).toBe(false)
    expect(g.seasons.find((s) => s.competitionName === 'CCCA Junior Competition')?.isJunior).toBe(true)
  })
  it('group status is ACTIVE if any season active, else UPCOMING, else COMPLETED', () => {
    const g = groupSeasons([
      { ...raw[0], status: 'COMPLETED' },
      { ...raw[0], id: 'x', status: 'ACTIVE', competition: { id: 'c2', name: 'Other' } },
    ])
    expect(g[0].status).toBe('ACTIVE')
  })
})

describe('pickDefaultSeason', () => {
  it('prefers ACTIVE, then UPCOMING, then newest COMPLETED', () => {
    const groups = groupSeasons(raw)
    expect(pickDefaultSeason(groups)?.name).toBe('Summer 2026/27')
    const completedOnly = groups.map((g) => ({ ...g, status: 'COMPLETED' as const }))
    expect(pickDefaultSeason(completedOnly)?.name).toBe('Summer 2026/27')
    expect(pickDefaultSeason([])).toBeNull()
  })
})
