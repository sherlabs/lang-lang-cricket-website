import { splitByPlayer } from './facts'
import { BOWLER_TYPES, DISMISSAL_KEYS, type BowlerType, type DismissalKey, type FactSet, type MatchCounts } from './types'

/**
 * Per-player counts over a fact set (W2 spec 2.2, 2.2a, 2.3, 2.7). Every figure counts only rows that
 * can support it and carries its denominator, so a rate is never computed over missing data:
 * ball-based figures decide per batting row (never from the innings flag), bowling figures need
 * bowling data, run-outs and stumpings need a fielding row, and forfeits are never a win.
 */
export const emptyMatchCounts = (): MatchCounts => ({
  games: 0, wins: 0, resultGames: 0,
  battingInnings: 0, outs: 0, notOuts: 0, runs: 0, fifties: 0, hundreds: 0, ducks: 0, goldenDucks: 0, ducksWithBalls: 0,
  ballInnings: 0, ballsFaced: 0, runsOnBalls: 0, boundaryInnings: 0, boundaryRuns: 0, boundaryBalls: 0, boundaries: 0,
  dismissals: Object.fromEntries(DISMISSAL_KEYS.map((k) => [k, 0])) as Record<DismissalKey, number>, dismissalsNotRecorded: 0, retiredNotOut: 0,
  positionSum: 0, positionCount: 0, positionExcluded: 0,
  bowlingInnings: 0, bowlBalls: 0, bowlRuns: 0, wickets: 0, threeFors: 0, fiveFors: 0, tenWicketMatches: 0, tenWicketUndecided: 0,
  wicketsByType: Object.fromEntries(BOWLER_TYPES.map((k) => [k, 0])) as Record<BowlerType, number>, reconciledWicketInnings: 0, wicketTakingInnings: 0,
  catches: 0, runOuts: 0, stumpings: 0, keeperCatches: 0, fieldingInnings: 0,
})

const RESULT_GAMES = new Set(['won', 'lost', 'draw', 'tie'])

const dismissalKey = (t: string): DismissalKey => ((DISMISSAL_KEYS as readonly string[]).includes(t) ? (t as DismissalKey) : 'other')

/** Counts for the facts in `set`, treated as one player's (filter with `playerFacts` first). */
export function matchCountsOf(set: FactSet): MatchCounts {
  const c = emptyMatchCounts()
  for (const a of set.appearances) {
    c.games++
    const h = set.matches.get(a.m)
    if (!h || h.forfeit) continue
    if (h.result && RESULT_GAMES.has(h.result)) c.resultGames++
    if (h.result === 'won') c.wins++
  }

  for (const b of set.bat) {
    c.battingInnings++
    if (b.status === 'out') c.outs++
    if (b.status === 'not_out') c.notOuts++
    c.runs += b.runs
    if (b.runs >= 100) c.hundreds++
    else if (b.runs >= 50) c.fifties++
    if (b.status === 'out' && b.runs === 0 && b.dismissal !== 'retired_out') {
      c.ducks++
      if (b.balls !== null) {
        c.ducksWithBalls++
        if (b.balls === 1) c.goldenDucks++
      }
    }
    if (b.balls !== null) {
      c.ballInnings++
      c.ballsFaced += b.balls
      c.runsOnBalls += b.runs
    }
    // Same rule as the classic table: PlayHQ may omit fours/sixes when zero, so a missing one is 0 whenever balls are known.
    if (b.balls !== null) {
      c.boundaryInnings++
      c.boundaryRuns += b.runs
      c.boundaryBalls += b.balls
      c.boundaries += (b.fours ?? 0) + (b.sixes ?? 0)
    }
    if (b.status === 'out') {
      if (b.dismissal) c.dismissals[dismissalKey(b.dismissal)]++
      else c.dismissalsNotRecorded++
    } else if (b.dismissal === 'retired_hurt' || b.dismissal === 'retired') c.retiredNotOut++
    if (b.pos > 0) {
      c.positionSum += b.pos
      c.positionCount++
    } else c.positionExcluded++
  }

  const perMatch = new Map<number, number>()
  for (const w of set.bowl) {
    c.bowlingInnings++
    c.bowlBalls += w.balls
    c.bowlRuns += w.runs
    c.wickets += w.wickets
    if (w.wickets >= 3) c.threeFors++
    if (w.wickets >= 5) c.fiveFors++
    if (w.wickets > 0) {
      c.wicketTakingInnings++
      if (w.reconciled) {
        c.reconciledWicketInnings++
        for (const k of BOWLER_TYPES) c.wicketsByType[k] += w.byType[k]
      }
    }
    perMatch.set(w.m, (perMatch.get(w.m) ?? 0) + w.wickets)
  }
  // Ten in a match (two-day games): decidable only when every innings the side bowled has bowling figures.
  if (perMatch.size > 0) {
    const bowledBy = new Map<number, boolean[]>()
    for (const i of set.innings.values()) {
      if (i.clubBatting || !perMatch.has(i.m)) continue
      bowledBy.set(i.m, [...(bowledBy.get(i.m) ?? []), i.hasBowling])
    }
    for (const [m, wickets] of perMatch) {
      if (wickets === 0) continue
      const flags = bowledBy.get(m) ?? []
      if (flags.length === 0 || !flags.every(Boolean)) c.tenWicketUndecided++
      else if (wickets >= 10) c.tenWicketMatches++
    }
  }

  for (const f of set.credits) {
    c.catches += f.catches
    if (f.runOuts !== null) {
      c.fieldingInnings++
      c.runOuts += f.runOuts
      c.stumpings += f.stumpings ?? 0
      c.keeperCatches += f.keeperCatches ?? 0
    }
  }
  return c
}

/** Counts for every player in the set. */
export function countsByPlayer(set: FactSet): Map<number, MatchCounts> {
  return new Map([...splitByPlayer(set)].map(([id, s]) => [id, matchCountsOf(s)]))
}

