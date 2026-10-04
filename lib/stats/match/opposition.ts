import type { MatchMinimums } from './minimums'
import type { FactSet, MatchHeader } from './types'

export { normaliseClubName, oppositionKey, oppositionLabel } from './opposition-key'

/**
 * Opposition tables (W2 spec 2.6). Per player: batting, bowling and catches against each opposition.
 * Per club: head to head. Opposition players are never listed, only the club side's own figures.
 * A rate needs a minimum sample (`oppositionInnings` batting innings, `oppositionBalls` balls bowled);
 * below it the raw counts show and the rate is null.
 */
export type OppositionPlayerRow = {
  key: string
  label: string
  games: number
  battingInnings: number
  runs: number
  outs: number
  average: number | null
  highScore: number
  highScoreNotOut: boolean
  fifties: number
  hundreds: number
  ducks: number
  /** Bowling columns count only innings with bowling figures. */
  bowlingInnings: number
  wickets: number
  runsConceded: number
  bowlBalls: number
  bestWickets: number
  bestRuns: number
  economy: number | null
  catches: number
  lastDate: string | null
}

export function oppositionTable(set: FactSet, min: Pick<MatchMinimums, 'oppositionInnings' | 'oppositionBalls'>): OppositionPlayerRow[] {
  const rows = new Map<string, OppositionPlayerRow>()
  const get = (h: MatchHeader): OppositionPlayerRow => {
    let r = rows.get(h.oppKey)
    if (!r) {
      r = {
        key: h.oppKey, label: h.oppLabel, games: 0, battingInnings: 0, runs: 0, outs: 0, average: null, highScore: 0, highScoreNotOut: false, fifties: 0, hundreds: 0,
        ducks: 0, bowlingInnings: 0, wickets: 0, runsConceded: 0, bowlBalls: 0, bestWickets: 0, bestRuns: 0, economy: null, catches: 0, lastDate: null,
      }
      rows.set(h.oppKey, r)
    }
    // The label follows the most recent meeting.
    if (h.date && (r.lastDate === null || h.date >= r.lastDate)) {
      r.lastDate = h.date
      r.label = h.oppLabel
    }
    return r
  }
  for (const a of set.appearances) {
    const h = set.matches.get(a.m)
    if (h) get(h).games++
  }
  for (const b of set.bat) {
    const h = set.matches.get(b.m)
    if (!h) continue
    const r = get(h)
    r.battingInnings++
    r.runs += b.runs
    if (b.status === 'out') r.outs++
    if (b.runs >= 100) r.hundreds++
    else if (b.runs >= 50) r.fifties++
    if (b.status === 'out' && b.runs === 0 && b.dismissal !== 'retired_out') r.ducks++
    const notOut = b.status === 'not_out'
    if (b.runs > r.highScore || (b.runs === r.highScore && notOut && !r.highScoreNotOut)) {
      r.highScore = b.runs
      r.highScoreNotOut = notOut
    }
  }
  for (const w of set.bowl) {
    const h = set.matches.get(w.m)
    if (!h) continue
    const r = get(h)
    r.bowlingInnings++
    r.wickets += w.wickets
    r.runsConceded += w.runs
    r.bowlBalls += w.balls
    if (w.wickets > r.bestWickets || (w.wickets === r.bestWickets && w.wickets > 0 && w.runs < r.bestRuns)) {
      r.bestWickets = w.wickets
      r.bestRuns = w.runs
    }
  }
  for (const f of set.credits) {
    const h = set.matches.get(f.m)
    if (h) get(h).catches += f.catches
  }
  for (const r of rows.values()) {
    r.average = r.battingInnings >= min.oppositionInnings && r.outs > 0 ? r.runs / r.outs : null
    r.economy = r.bowlBalls >= min.oppositionBalls ? r.runsConceded / (r.bowlBalls / 6) : null
  }
  return [...rows.values()].sort((a, b) => b.games - a.games || a.label.localeCompare(b.label))
}

export type HeadToHeadRow = {
  key: string
  label: string
  played: number
  won: number
  lost: number
  drawn: number
  tied: number
  noResult: number
  wonByForfeit: number
  lostByForfeit: number
  lastMeeting: string | null
  lastResult: string | null
  highestFor: number | null
  highestAgainst: number | null
  /** Lowest innings that ended all out (a chase, declaration or short innings says nothing about a low score). */
  lowestCompletedFor: number | null
  lowestCompletedAgainst: number | null
  /** won / (won + lost + drawn + tied), non-forfeit games, null below `winGames` such games. Excludes forfeits. */
  winPct: number | null
}

export function headToHead(set: FactSet, min: Pick<MatchMinimums, 'winGames'>): HeadToHeadRow[] {
  const rows = new Map<string, HeadToHeadRow>()
  for (const h of set.matches.values()) {
    let r = rows.get(h.oppKey)
    if (!r) {
      r = {
        key: h.oppKey, label: h.oppLabel, played: 0, won: 0, lost: 0, drawn: 0, tied: 0, noResult: 0, wonByForfeit: 0, lostByForfeit: 0,
        lastMeeting: null, lastResult: null, highestFor: null, highestAgainst: null, lowestCompletedFor: null, lowestCompletedAgainst: null, winPct: null,
      }
      rows.set(h.oppKey, r)
    }
    r.played++
    if (h.forfeit) {
      if (h.result === 'won') r.wonByForfeit++
      else if (h.result === 'lost') r.lostByForfeit++
    } else if (h.result === 'won') r.won++
    else if (h.result === 'lost') r.lost++
    else if (h.result === 'draw') r.drawn++
    else if (h.result === 'tie') r.tied++
    else r.noResult++
    if (h.date && (r.lastMeeting === null || h.date >= r.lastMeeting)) {
      r.lastMeeting = h.date
      r.lastResult = h.forfeit ? `${h.result === 'won' ? 'Won' : 'Lost'} by forfeit` : h.result
      r.label = h.oppLabel
    }
  }
  for (const i of set.innings.values()) {
    const h = set.matches.get(i.m)
    const r = h && rows.get(h.oppKey)
    if (!r) continue
    const hi = i.clubBatting ? 'highestFor' : 'highestAgainst'
    r[hi] = Math.max(r[hi] ?? 0, i.runs)
    if (i.allOut) {
      const lo = i.clubBatting ? 'lowestCompletedFor' : 'lowestCompletedAgainst'
      r[lo] = Math.min(r[lo] ?? Infinity, i.runs)
    }
  }
  for (const r of rows.values()) {
    const decided = r.won + r.lost + r.drawn + r.tied
    r.winPct = decided >= min.winGames ? (r.won / decided) * 100 : null
  }
  return [...rows.values()].sort((a, b) => b.played - a.played || a.label.localeCompare(b.label))
}
