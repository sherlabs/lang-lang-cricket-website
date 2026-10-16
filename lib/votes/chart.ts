import { topRows, type RoundBoard } from './tally'

/**
 * The race chart's data (wave B spec 3.8): the top five (ties at fifth place included, up to six) and their CUMULATIVE points
 * after each closed round. There is no per-round or per-game points field on purpose: a round's gain would show who voted how.
 */
export type RaceSeries = { playerId: number; name: string; rank: number; shared: boolean; points: number[] }
export type RaceData = { rounds: string[]; series: RaceSeries[] }

export function buildRace(boards: readonly RoundBoard[], top: number = 5): RaceData {
  if (!boards.length) return { rounds: [], series: [] }
  const last = boards[boards.length - 1]
  const chosen = topRows(last.rows, top)
  return {
    rounds: boards.map((b) => b.round),
    series: chosen.map((r) => ({
      playerId: r.playerId,
      name: r.name,
      rank: r.rank,
      shared: r.shared,
      points: boards.map((b) => b.rows.find((x) => x.playerId === r.playerId)?.points ?? 0),
    })),
  }
}
