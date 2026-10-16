import type { FactSet, InningsMeta, MatchHeader } from '@/lib/stats/match/types'

/**
 * One stored game seen from the club's side (wave E, WP-3). Pure. `battedFirst` is read from the stored innings order
 * (`sequenceNo` 1 is the first innings played), never from the toss: it is null when no innings was played or the first two
 * innings do not alternate between the sides (an order we cannot trust).
 */
export type Outcome = 'won' | 'lost' | 'draw' | 'tie' | 'no_result'
export type GameView = {
  header: MatchHeader
  /** Played innings, in order. */
  innings: InningsMeta[]
  battedFirst: boolean | null
  /** Null for a forfeit, an abandoned game and a game stored with no result. */
  outcome: Outcome | null
}

const OUTCOMES: readonly string[] = ['won', 'lost', 'draw', 'tie', 'no_result']

export function gameViews(set: FactSet): GameView[] {
  const byMatch = new Map<number, InningsMeta[]>()
  for (const i of set.innings.values()) {
    const list = byMatch.get(i.m)
    if (list) list.push(i)
    else byMatch.set(i.m, [i])
  }
  return [...set.matches.values()].map((header) => {
    const innings = (byMatch.get(header.id) ?? []).sort((a, b) => a.seq - b.seq)
    const [a, b] = innings
    const battedFirst = a && (!b || a.clubBatting !== b.clubBatting) ? a.clubBatting : null
    const outcome = !header.forfeit && header.result && OUTCOMES.includes(header.result) ? (header.result as Outcome) : null
    return { header, innings, battedFirst, outcome }
  })
}

/** Oldest first, undated games last, ties by stored id so the order never changes between runs. */
export const byDate = (a: GameView, b: GameView): number => (a.header.date ?? '9999-12-31').localeCompare(b.header.date ?? '9999-12-31') || a.header.id - b.header.id
