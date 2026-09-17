import type { Game } from './types'
import { isFinished, sortResults, sortUpcoming } from './games'

/** Games on the same weekend (Fri juniors, Sat/Sun seniors) fall inside this; weekly rounds are 7 days apart and must not. */
const WINDOW_DAYS = 7

function dayNumber(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function withinWindow(games: Game[], anchor: string, direction: 1 | -1): Game[] {
  const a = dayNumber(anchor)
  return games.filter((g) => {
    if (!g.localDate) return false
    const diff = (dayNumber(g.localDate) - a) * direction
    return diff >= 0 && diff < WINDOW_DAYS
  })
}

/**
 * The next round's games: every unfinished, dated game on or after `today`
 * that falls within 7 days of the earliest such game. Ascending order.
 */
export function nextRoundWindow(games: Game[], today: string): Game[] {
  const pool = sortUpcoming(games.filter((g) => !isFinished(g) && g.localDate != null && g.localDate >= today))
  const first = pool[0]
  if (!first?.localDate) return []
  return withinWindow(pool, first.localDate, 1)
}

/**
 * The most recently completed round's results: finished, dated games (on or
 * before `today` when given) within 7 days back from the latest one. Newest first.
 * Two-day games are anchored on their day-1 `localDate`.
 */
export function latestResultsWindow(games: Game[], today?: string): Game[] {
  const pool = sortResults(games.filter((g) => isFinished(g) && g.localDate != null && (!today || g.localDate <= today)))
  const latest = pool[0]
  if (!latest?.localDate) return []
  return withinWindow(pool, latest.localDate, -1)
}

export type DateGroup = { date: string | null; games: Game[] }

/** Bucket games by `localDate`, preserving input order; undated games trail in a `null` group. */
export function groupByDate(games: Game[]): DateGroup[] {
  const map = new Map<string, Game[]>()
  const undated: Game[] = []
  for (const g of games) {
    if (!g.localDate) {
      undated.push(g)
      continue
    }
    const bucket = map.get(g.localDate)
    if (bucket) bucket.push(g)
    else map.set(g.localDate, [g])
  }
  const out: DateGroup[] = [...map.entries()].map(([date, games]) => ({ date, games }))
  if (undated.length) out.push({ date: null, games: undated })
  return out
}
