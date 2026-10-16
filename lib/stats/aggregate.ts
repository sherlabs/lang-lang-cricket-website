import { EMPTY_COUNTS, combineCounts, pickCounts, type SeasonCounts } from '@/lib/players/season-math'

/** One stored `player-seasons` row, reduced to what stats need. */
export type StatRow = {
  playerId: number
  seasonName: string
  seasonOrder: number
  teamId: string
  teamName: string
  gradeName: string | null
  counts: SeasonCounts
}

/** Rows of one player in one season, teams merged. */
export type SeasonRow = {
  playerId: number
  seasonName: string
  seasonOrder: number
  gradeNames: string[]
  teamNames: string[]
  counts: SeasonCounts
}

/** All of one player's stored rows combined. */
export type CareerRow = {
  playerId: number
  seasons: number
  seasonNames: string[]
  gradeNames: string[]
  counts: SeasonCounts
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]

/** Merge rows by (player, season): sums, best high score (not-out tie-break) and best figures. */
export function mergeBySeason(rows: readonly StatRow[]): SeasonRow[] {
  const by = new Map<string, SeasonRow>()
  for (const r of rows) {
    const key = `${r.playerId}\u0000${r.seasonName}`
    const prev = by.get(key)
    if (!prev) {
      by.set(key, {
        playerId: r.playerId, seasonName: r.seasonName, seasonOrder: r.seasonOrder,
        gradeNames: uniq([r.gradeName]), teamNames: uniq([r.teamName]), counts: pickCounts(r.counts),
      })
    } else {
      prev.counts = combineCounts(prev.counts, pickCounts(r.counts))
      prev.gradeNames = uniq([...prev.gradeNames, r.gradeName])
      prev.teamNames = uniq([...prev.teamNames, r.teamName])
      prev.seasonOrder = Math.min(prev.seasonOrder, r.seasonOrder)
    }
  }
  return [...by.values()]
}

/** Combine each player's season rows into one career row ("career" = the stored window). */
export function careerOf(rows: readonly StatRow[]): CareerRow[] {
  const by = new Map<number, CareerRow>()
  for (const s of mergeBySeason(rows)) {
    const prev = by.get(s.playerId)
    if (!prev) {
      by.set(s.playerId, {
        playerId: s.playerId, seasons: s.counts.games > 0 ? 1 : 0, seasonNames: [s.seasonName],
        gradeNames: s.gradeNames, counts: combineCounts(EMPTY_COUNTS, s.counts),
      })
    } else {
      prev.counts = combineCounts(prev.counts, s.counts)
      prev.seasons += s.counts.games > 0 ? 1 : 0
      prev.seasonNames = uniq([...prev.seasonNames, s.seasonName])
      prev.gradeNames = uniq([...prev.gradeNames, ...s.gradeNames])
    }
  }
  return [...by.values()]
}
