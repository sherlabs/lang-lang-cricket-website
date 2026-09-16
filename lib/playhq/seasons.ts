import type { RawSeason, SeasonGroup } from './types'

export function isJuniorCompetition(name: string): boolean {
  return /junior|u1\d|girls|winter/i.test(name)
}

function sortKey(name: string): number {
  const year = Number(/\d{4}/.exec(name)?.[0] ?? 0)
  return year + (name.includes('/') ? 0.5 : 0)
}

const STATUS_RANK = { ACTIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const

export function groupSeasons(raw: RawSeason[]): SeasonGroup[] {
  const byName = new Map<string, SeasonGroup>()
  for (const s of raw) {
    const isJunior = isJuniorCompetition(s.competition.name)
    const g = byName.get(s.name) ?? { name: s.name, isJunior: true, seasons: [], status: 'COMPLETED' as const }
    g.seasons.push({ id: s.id, status: s.status, competitionName: s.competition.name, isJunior })
    byName.set(s.name, g)
  }
  const groups = [...byName.values()].map((g) => ({
    ...g,
    isJunior: g.seasons.every((s) => s.isJunior),
    status: g.seasons.reduce<SeasonGroup['status']>(
      (best, s) => (STATUS_RANK[s.status] < STATUS_RANK[best] ? s.status : best),
      'COMPLETED'
    ),
  }))
  return groups.sort((a, b) => sortKey(b.name) - sortKey(a.name))
}

export function pickDefaultSeason(groups: SeasonGroup[]): SeasonGroup | null {
  return (
    groups.find((g) => g.status === 'ACTIVE') ??
    groups.find((g) => g.status === 'UPCOMING') ??
    groups[0] ??
    null
  )
}
