import type { PlayerSeasonStats, Scorecard } from './types'
import { displayName } from './names'
import { isInningsPlayed } from './scorecard'

export function oversToBalls(overs: number): number {
  const whole = Math.floor(overs)
  return whole * 6 + Math.round((overs - whole) * 10)
}
export function ballsToOvers(balls: number): string {
  const o = Math.floor(balls / 6), b = balls % 6
  return b ? `${o}.${b}` : `${o}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

function emptyStats(key: string, name: string): PlayerSeasonStats {
  return {
    key, name, games: 0,
    batting: { innings: 0, notOuts: 0, runs: 0, highScore: 0, highScoreNotOut: false, balls: 0, fours: 0, sixes: 0, average: null, strikeRate: null },
    bowling: { balls: 0, overs: '0', maidens: 0, runs: 0, wickets: 0, bestWickets: 0, bestRuns: 0, average: null, economy: null },
    catches: 0,
  }
}

export function aggregatePlayers(scorecards: Scorecard[], teamId: string, isJunior = false): PlayerSeasonStats[] {
  const acc = new Map<string, PlayerSeasonStats>()
  for (const sc of scorecards) {
    if (sc.status !== 'FINAL') continue
    // appearanceId → accumulator, for this game only
    const byAppearance = new Map<string, PlayerSeasonStats>()
    const byName = new Map<string, PlayerSeasonStats>()
    for (const [id, p] of Object.entries(sc.players)) {
      if (p.teamId !== teamId) continue
      const key = `${p.firstName}|${p.lastName}`.toLowerCase()
      let e = acc.get(key)
      if (!e) { e = emptyStats(key, displayName(p, isJunior)); acc.set(key, e) }
      if (!byAppearance.has(id)) { e.games++ }
      byAppearance.set(id, e); byName.set(e.name, e)
    }
    for (const inn of sc.innings) {
      if (!isInningsPlayed(inn)) continue
      if (inn.battingTeamId === teamId) {
        for (const b of inn.batting) {
          const e = byAppearance.get(b.appearanceId); if (!e) continue
          e.batting.innings++; if (b.notOut) e.batting.notOuts++
          e.batting.runs += b.runs; e.batting.balls += b.balls; e.batting.fours += b.fours; e.batting.sixes += b.sixes
          if (b.runs > e.batting.highScore || (b.runs === e.batting.highScore && b.notOut)) {
            e.batting.highScore = b.runs; e.batting.highScoreNotOut = b.notOut
          }
        }
      }
      if (inn.bowlingTeamId === teamId) {
        for (const b of inn.bowling) {
          const e = byAppearance.get(b.appearanceId); if (!e) continue
          e.bowling.balls += oversToBalls(b.overs); e.bowling.maidens += b.maidens
          e.bowling.runs += b.runs; e.bowling.wickets += b.wickets
          if (b.wickets > e.bowling.bestWickets || (b.wickets === e.bowling.bestWickets && b.runs < e.bowling.bestRuns)) {
            e.bowling.bestWickets = b.wickets; e.bowling.bestRuns = b.runs
          }
        }
        // catches: fielder name embedded in the (already policy-formatted) dismissal text
        for (const b of inn.batting) {
          const m = /^c & b (.+)$/.exec(b.dismissal) ?? /^c (.+) b .+$/.exec(b.dismissal)
          const e = m && byName.get(m[1]); if (e) e.catches++
        }
      }
    }
  }
  const out = [...acc.values()].map((e) => {
    const outs = e.batting.innings - e.batting.notOuts
    e.batting.average = outs > 0 ? round2(e.batting.runs / outs) : null
    e.batting.strikeRate = e.batting.balls > 0 ? round2((e.batting.runs / e.batting.balls) * 100) : null
    e.bowling.overs = ballsToOvers(e.bowling.balls)
    e.bowling.average = e.bowling.wickets > 0 ? round2(e.bowling.runs / e.bowling.wickets) : null
    e.bowling.economy = e.bowling.balls > 0 ? round2(e.bowling.runs / (e.bowling.balls / 6)) : null
    return e
  })
  return out.sort((a, b) => b.batting.runs - a.batting.runs || b.bowling.wickets - a.bowling.wickets || a.name.localeCompare(b.name))
}
