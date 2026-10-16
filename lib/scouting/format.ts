import type { Ledger, ScoreLine } from './head-to-head'
import type { ScoutResult } from './types'

/** Display helpers for the scouting page (pure, so they are unit tested). `null` is "not recorded", never 0. */
export const NOT_RECORDED = 'not recorded'

export const one = (v: number | null): string => (v === null ? NOT_RECORDED : (Math.round(v * 10) / 10).toFixed(1))
export const whole = (v: number | null): string => (v === null ? NOT_RECORDED : String(Math.round(v)))

/** "187/6 and 120/10"; an innings whose total is not stored reads "not recorded". */
export function scoreText(line: ScoreLine): string {
  if (line.length === 0) return NOT_RECORDED
  return line.map((i) => (i.runs === null ? NOT_RECORDED : i.wickets === null ? String(i.runs) : `${i.runs}/${i.wickets}`)).join(' and ')
}

export function resultWord(result: ScoutResult | null, forfeit: boolean): string {
  if (result === 'won') return forfeit ? 'Won by forfeit' : 'Won'
  if (result === 'lost') return forfeit ? 'Lost by forfeit' : 'Lost'
  if (result === 'draw') return 'Drawn'
  if (result === 'tie') return 'Tied'
  if (result === 'no_result' || result === 'abandoned') return 'No result'
  return 'Result not recorded'
}

/** "Played 9: won 4, lost 3, drawn 1, no result 1". Zero parts are left out; forfeits are named. */
export function ledgerText(l: Ledger): string {
  const parts = [
    l.won && `won ${l.won}`, l.lost && `lost ${l.lost}`, l.drawn && `drawn ${l.drawn}`, l.tied && `tied ${l.tied}`,
    l.wonByForfeit && `won by forfeit ${l.wonByForfeit}`, l.lostByForfeit && `lost by forfeit ${l.lostByForfeit}`,
    l.noResult && `no result ${l.noResult}`, l.unknown && `result not recorded ${l.unknown}`,
  ].filter(Boolean)
  return `Played ${l.played}${parts.length ? `: ${parts.join(', ')}` : ''}`
}

export const outcomeWord = (o: 'W' | 'L' | 'D' | 'T' | 'N' | '?'): string => ({ W: 'Win', L: 'Loss', D: 'Draw', T: 'Tie', N: 'No result', '?': 'Unknown' })[o]
