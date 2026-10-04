import type { MatchMinimums } from './minimums'
import type { BatFact } from './types'

/**
 * Batting position (W2 spec 2.5). `pos` is the scorer's card order, not proof of who walked in first,
 * so every figure says "as scored". Buckets are the only breakdown.
 */
export const POSITION_BUCKETS = [
  { key: 'opener', label: 'Openers (1 to 2)', from: 1, to: 2 },
  { key: 'middle', label: 'Middle order (3 to 5)', from: 3, to: 5 },
  { key: 'lowerMiddle', label: 'Lower middle (6 to 7)', from: 6, to: 7 },
  { key: 'tail', label: 'Tail (8 to 11)', from: 8, to: 11 },
] as const
export type PositionBucketKey = (typeof POSITION_BUCKETS)[number]['key']

export type PositionLine = {
  key: PositionBucketKey
  label: string
  innings: number
  runs: number
  outs: number
  notOuts: number
  highScore: number
  highScoreNotOut: boolean
  fifties: number
  /** Null (shown as n/a) below `positionInnings` innings or with no dismissal. */
  average: number | null
}

export type PositionSummary = {
  lines: PositionLine[]
  /** Most common card position (a tie goes to the lower number), null with no data. */
  mostCommon: number | null
  averagePosition: number | null
  /** Rows with position 0 ("no data"), excluded from every figure. */
  excluded: number
}

export function positionSummary(bat: readonly BatFact[], min: Pick<MatchMinimums, 'positionInnings'>): PositionSummary {
  const lines: PositionLine[] = POSITION_BUCKETS.map((b) => ({ key: b.key, label: b.label, innings: 0, runs: 0, outs: 0, notOuts: 0, highScore: 0, highScoreNotOut: false, fifties: 0, average: null }))
  const freq = new Map<number, number>()
  let sum = 0, n = 0, excluded = 0
  for (const r of bat) {
    if (!(r.pos > 0)) {
      excluded++
      continue
    }
    sum += r.pos
    n++
    freq.set(r.pos, (freq.get(r.pos) ?? 0) + 1)
    // Positions above 11 (a long card) join the tail.
    const idx = POSITION_BUCKETS.findIndex((b) => r.pos >= b.from && r.pos <= b.to)
    const line = lines[idx === -1 ? lines.length - 1 : idx]
    line.innings++
    line.runs += r.runs
    if (r.status === 'out') line.outs++
    if (r.status === 'not_out') line.notOuts++
    if (r.runs >= 50) line.fifties++
    const notOut = r.status === 'not_out'
    if (r.runs > line.highScore || (r.runs === line.highScore && notOut && !line.highScoreNotOut)) {
      line.highScore = r.runs
      line.highScoreNotOut = notOut
    }
  }
  for (const l of lines) l.average = l.innings >= min.positionInnings && l.outs > 0 ? l.runs / l.outs : null
  let mostCommon: number | null = null
  for (const [p, f] of freq) if (mostCommon === null || f > freq.get(mostCommon)! || (f === freq.get(mostCommon) && p < mostCommon)) mostCommon = p
  return { lines, mostCommon, averagePosition: n > 0 ? sum / n : null, excluded }
}
