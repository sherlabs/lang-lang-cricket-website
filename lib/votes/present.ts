import { topRows, type BoardRow, type RoundBoard } from './tally'

/**
 * The awards-night presentation (wave B spec 3.9). One snapshot of PUBLIC-ELIGIBLE data (cumulative totals after each closed
 * round, never ballots, never per-game points), and the steps that reveal it.
 */
export type PresentRow = Pick<BoardRow, 'playerId' | 'name' | 'points' | 'rank' | 'shared' | 'movement' | 'games'>
export type PresentRound = { key: string; label: string; rows: PresentRow[] }
export type PresentSnapshot = { title: string; scopeLabel: string; valuesLabel: string; rounds: PresentRound[]; finalTop: PresentRow[] }

export type RevealStep =
  | { kind: 'title'; heading: string; sub: string }
  | { kind: 'round'; heading: string; rows: PresentRow[]; roundIndex: number }
  | { kind: 'countdown'; heading: string; row: PresentRow }
  | { kind: 'winner'; heading: string; rows: PresentRow[] }

const lite = (r: BoardRow): PresentRow => ({ playerId: r.playerId, name: r.name, points: r.points, rank: r.rank, shared: r.shared, movement: r.movement, games: r.games })

export function buildSnapshot(i: { title: string; scopeLabel: string; valuesLabel: string; boards: readonly RoundBoard[]; roundLabel: (key: string) => string; top?: number }): PresentSnapshot {
  const last = i.boards[i.boards.length - 1]
  return {
    title: i.title,
    scopeLabel: i.scopeLabel,
    valuesLabel: i.valuesLabel,
    rounds: i.boards.map((b) => ({ key: b.round, label: i.roundLabel(b.round), rows: b.rows.map(lite) })),
    finalTop: last ? topRows(last.rows, i.top ?? 5).map(lite) : [],
  }
}

/** Title; per closed round a header with the board after it; then the top five counted down from last to first, then the winner. */
export function buildRevealSteps(s: PresentSnapshot, ordinal: (n: number) => string = (n) => `#${n}`): RevealStep[] {
  const steps: RevealStep[] = [{ kind: 'title', heading: s.title, sub: `${s.scopeLabel} - ${s.valuesLabel}` }]
  s.rounds.forEach((r, i) => steps.push({ kind: 'round', heading: r.label, rows: r.rows.slice(0, 10), roundIndex: i }))
  if (!s.finalTop.length) return steps
  // Count down from the lowest place to the top one; tied rows at the top are the winners together.
  const topRank = s.finalTop[0].rank
  const winners = s.finalTop.filter((r) => r.rank === topRank)
  const rest = s.finalTop.filter((r) => r.rank !== topRank)
  for (const row of [...rest].reverse()) steps.push({ kind: 'countdown', heading: ordinal(row.rank), row })
  steps.push({ kind: 'winner', heading: ordinal(topRank), rows: winners })
  return steps
}
