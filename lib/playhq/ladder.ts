import type { Ladder, RawLadder } from './types'

export function mapLadder(raw: RawLadder, clubTeamIds: Set<string>): Ladder | null {
  const l = raw.ladders?.[0]
  if (!l || !l.standings?.length) return null
  const headers = l.headers.map((h) => ({ key: h.key, name: h.name, shortName: h.shortName }))
  return {
    gradeId: raw.gradeId, headers,
    rows: l.standings.map((s, i) => ({
      teamId: s.team.id, teamName: s.team.name, position: i + 1, isClub: clubTeamIds.has(s.team.id),
      values: Object.fromEntries(headers.map((h, j) => [h.key, s.values[j] ?? null])),
    })),
  }
}
