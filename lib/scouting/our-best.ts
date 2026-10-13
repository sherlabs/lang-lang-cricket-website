import { oppositionTable, type OppositionPlayerRow } from '@/lib/stats/match/opposition'
import type { MatchMinimums } from '@/lib/stats/match/minimums'
import type { FactSet } from '@/lib/stats/match/types'

/**
 * Our best against them (spec 3.1 item 6): visible club players' figures in the scouted games. It runs each player's own rows through
 * `oppositionTable`, the code behind the public Opposition page, so the numbers match it. The input is the public facts (visible players
 * only), so a hidden player is absent by construction.
 */
export type OurBest = { id: number; name: string; row: OppositionPlayerRow }

export function ourBest(
  facts: FactSet,
  gameIds: ReadonlySet<string>,
  names: ReadonlyMap<number, string>,
  min: Pick<MatchMinimums, 'oppositionInnings' | 'oppositionBalls'>,
): { batters: OurBest[]; bowlers: OurBest[]; matchesUsed: number } {
  const wanted = new Set([...facts.matches].filter(([, h]) => gameIds.has(h.gameId)).map(([id]) => id))
  const players = new Set<number>()
  const inScope = <T extends { m: number }>(rows: T[]) => rows.filter((r) => wanted.has(r.m))
  const bat = inScope(facts.bat), bowl = inScope(facts.bowl)
  for (const r of [...bat, ...bowl]) players.add((r as { player: number }).player)
  const out: OurBest[] = []
  for (const id of players) {
    const slice: FactSet = {
      ...facts,
      matches: new Map([...facts.matches].filter(([mid]) => wanted.has(mid))),
      appearances: inScope(facts.appearances).filter((a) => a.player === id),
      bat: bat.filter((r) => r.player === id),
      bowl: bowl.filter((r) => r.player === id),
      credits: inScope(facts.credits).filter((r) => r.player === id),
      partnerships: [],
    }
    const name = names.get(id)
    // The sum over the scouted games: one row per opposition key; with renames in play there can be more than one, so merge them.
    const rows = oppositionTable(slice, min)
    if (!name || rows.length === 0) continue
    out.push({ id, name, row: rows.length === 1 ? rows[0] : mergeRows(rows, min) })
  }
  const batters = out.filter((o) => o.row.battingInnings > 0).sort((a, b) => b.row.runs - a.row.runs || a.name.localeCompare(b.name))
  const bowlers = out.filter((o) => o.row.bowlingInnings > 0).sort((a, b) => b.row.wickets - a.row.wickets || a.row.runsConceded - b.row.runsConceded || a.name.localeCompare(b.name))
  return { batters, bowlers, matchesUsed: wanted.size }
}

function mergeRows(rows: OppositionPlayerRow[], min: Pick<MatchMinimums, 'oppositionInnings' | 'oppositionBalls'>): OppositionPlayerRow {
  const r: OppositionPlayerRow = { ...rows[0] }
  for (const o of rows.slice(1)) {
    r.games += o.games; r.battingInnings += o.battingInnings; r.runs += o.runs; r.outs += o.outs; r.notOuts += o.notOuts
    r.fifties += o.fifties; r.hundreds += o.hundreds; r.ducks += o.ducks; r.bowlingInnings += o.bowlingInnings; r.wickets += o.wickets
    r.runsConceded += o.runsConceded; r.bowlBalls += o.bowlBalls; r.catches += o.catches
    if (o.highScore > r.highScore) { r.highScore = o.highScore; r.highScoreNotOut = o.highScoreNotOut }
  }
  const dismissals = r.battingInnings - r.notOuts
  r.average = r.battingInnings >= min.oppositionInnings && dismissals > 0 ? r.runs / dismissals : null
  r.economy = r.bowlBalls >= min.oppositionBalls ? r.runsConceded / (r.bowlBalls / 6) : null
  return r
}
