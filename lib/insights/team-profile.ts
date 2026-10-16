import { INSIGHTS } from '@/config/site'
import { BOWLER_TYPES, type BowlerType, type FactSet } from '@/lib/stats/match/types'
import { gameViews, type GameView } from './games'
import { marginSummary, type MarginSummary } from './margin'
import { mean, median, sum } from './num'

/**
 * Team analysis for one filtered set of stored games (wave E, WP-3, spec 5.4). Pure: it takes the facts plus two small
 * lookups (the toss, and extras per innings) and returns numbers with the sample behind each. Club side only; no
 * opposition players. A rate below its minimum sample is null, and the caller shows the raw count.
 */
export type Tally = { played: number; won: number; lost: number; drawn: number; tied: number; noResult: number }
export type Split = Tally & { /** Won over won, lost, drawn and tied; null below `minGames` such games. */ winPct: number | null }

export type InningsExtras = { extras: number; wides: number; noBalls: number }
export type ProfileInput = {
  set: FactSet
  /** Stored match id to "the club won the toss"; a missing id or null is not recorded. */
  toss: ReadonlyMap<number, boolean | null>
  /** `m:seq` to extras for the innings that have them (an imported game has none). */
  extras: ReadonlyMap<string, InningsExtras>
  /** Non-forfeit games with a result before the overall win percentage shows (the site's win-games minimum). */
  winGames: number
  minGames?: number
}

export type TeamProfile = {
  games: number
  forfeits: number
  record: Split
  battingFirst: Split
  battingSecond: Split
  /** Games where the innings order could not be read. */
  orderUnknown: number
  toss: { won: Split; lost: Split; recorded: number; notRecorded: number }
  margins: MarginSummary
  batting: {
    innings: number
    withTotals: number
    withoutTotals: number
    mean: number | null
    highest: number | null
    /** Lowest total of an innings that ended all out. */
    lowestCompleted: number | null
    allOut: number
    allOutRate: number | null
    meanWicketsLost: number | null
    extrasPerInnings: number | null
    extrasInnings: number
    fifties: number
    hundreds: number
    /** Innings with validated, inferred partnerships. */
    stands: { innings: number; of: number; meanOpening: number | null; openingStands: number; highest: number | null }
  }
  bowling: {
    innings: number
    withTotals: number
    meanConceded: number | null
    oppAllOut: number
    oppAllOutRate: number | null
    wickets: { byType: Record<BowlerType, number>; total: number; inningsUsed: number; inningsOf: number }
    widesPerInnings: number | null
    noBallsPerInnings: number | null
    extrasInnings: number
  }
  fielding: { catches: number; stumpings: number | null; stumpingsRows: number; runOuts: number | null; runOutRows: number; rows: number }
}

const zeroTally = (): Tally => ({ played: 0, won: 0, lost: 0, drawn: 0, tied: 0, noResult: 0 })

function addTo(t: Tally, g: GameView) {
  if (!g.outcome) return
  t.played++
  if (g.outcome === 'won') t.won++
  else if (g.outcome === 'lost') t.lost++
  else if (g.outcome === 'draw') t.drawn++
  else if (g.outcome === 'tie') t.tied++
  else t.noResult++
}

const withPct = (t: Tally, min: number): Split => {
  const decided = t.won + t.lost + t.drawn + t.tied
  return { ...t, winPct: decided >= min && decided > 0 ? (t.won / decided) * 100 : null }
}

export function teamProfile(input: ProfileInput): TeamProfile {
  const { set } = input
  const min = input.minGames ?? INSIGHTS.teamMinGames
  const games = gameViews(set)
  const record = zeroTally(), first = zeroTally(), second = zeroTally(), won = zeroTally(), lost = zeroTally()
  let orderUnknown = 0, recorded = 0, notRecorded = 0
  for (const g of games) {
    addTo(record, g)
    if (!g.outcome) continue
    if (g.battedFirst === null) orderUnknown++
    else addTo(g.battedFirst ? first : second, g)
    const t = input.toss.get(g.header.id)
    if (t === true || t === false) {
      recorded++
      addTo(t ? won : lost, g)
    } else notRecorded++
  }

  const clubBat = [...set.innings.values()].filter((i) => i.clubBatting)
  const clubBowl = [...set.innings.values()].filter((i) => !i.clubBatting)
  const batTotals = clubBat.flatMap((i) => (i.runs === null ? [] : [i.runs]))
  const allOutBat = clubBat.filter((i) => i.allOut)
  const completed = allOutBat.flatMap((i) => (i.runs === null ? [] : [i.runs]))
  const batExtras = clubBat.flatMap((i) => { const e = input.extras.get(`${i.m}:${i.seq}`); return e ? [e.extras] : [] })
  const okInnings = new Set(clubBat.filter((i) => i.partnerships === 'ok').map((i) => `${i.m}:${i.seq}`))
  const stands = set.partnerships.filter((p) => okInnings.has(`${p.m}:${p.seq}`))
  const opening = stands.filter((p) => p.wicket === 1).map((p) => p.runs)
  const wicketsLost = clubBat.flatMap((i) => (i.wickets === null ? [] : [i.wickets]))

  const bowlTotals = clubBowl.flatMap((i) => (i.runs === null ? [] : [i.runs]))
  const bowlExtras = clubBowl.flatMap((i) => { const e = input.extras.get(`${i.m}:${i.seq}`); return e ? [e] : [] })
  const byType = Object.fromEntries(BOWLER_TYPES.map((k) => [k, 0])) as Record<BowlerType, number>
  const reconciledInnings = new Set<string>()
  for (const b of set.bowl) {
    if (!b.reconciled) continue
    reconciledInnings.add(`${b.m}:${b.seq}`)
    for (const k of BOWLER_TYPES) byType[k] += b.byType[k]
  }
  const stump = set.credits.flatMap((c) => (c.stumpings === null ? [] : [c.stumpings]))
  const runOuts = set.credits.flatMap((c) => (c.runOuts === null ? [] : [c.runOuts]))

  return {
    games: games.length,
    forfeits: games.filter((g) => g.header.forfeit).length,
    record: withPct(record, input.winGames),
    battingFirst: withPct(first, min),
    battingSecond: withPct(second, min),
    orderUnknown,
    toss: { won: withPct(won, min), lost: withPct(lost, min), recorded, notRecorded },
    margins: marginSummary(games, min),
    batting: {
      innings: clubBat.length,
      withTotals: batTotals.length,
      withoutTotals: clubBat.length - batTotals.length,
      mean: mean(batTotals),
      highest: batTotals.length ? Math.max(...batTotals) : null,
      lowestCompleted: completed.length ? Math.min(...completed) : null,
      allOut: allOutBat.length,
      allOutRate: clubBat.length >= min ? (allOutBat.length / clubBat.length) * 100 : null,
      meanWicketsLost: mean(wicketsLost),
      extrasPerInnings: mean(batExtras),
      extrasInnings: batExtras.length,
      fifties: set.bat.filter((r) => r.runs >= 50 && r.runs < 100).length,
      hundreds: set.bat.filter((r) => r.runs >= 100).length,
      stands: { innings: okInnings.size, of: clubBat.length, meanOpening: mean(opening), openingStands: opening.length, highest: stands.length ? Math.max(...stands.map((p) => p.runs)) : null },
    },
    bowling: {
      innings: clubBowl.length,
      withTotals: bowlTotals.length,
      meanConceded: mean(bowlTotals),
      oppAllOut: clubBowl.filter((i) => i.allOut).length,
      oppAllOutRate: clubBowl.length >= min ? (clubBowl.filter((i) => i.allOut).length / clubBowl.length) * 100 : null,
      wickets: { byType, total: sum(Object.values(byType)), inningsUsed: reconciledInnings.size, inningsOf: clubBowl.length },
      widesPerInnings: mean(bowlExtras.map((e) => e.wides)),
      noBallsPerInnings: mean(bowlExtras.map((e) => e.noBalls)),
      extrasInnings: bowlExtras.length,
    },
    fielding: {
      catches: sum(set.credits.map((c) => c.catches)),
      stumpings: stump.length ? sum(stump) : null,
      stumpingsRows: stump.length,
      runOuts: runOuts.length ? sum(runOuts) : null,
      runOutRows: runOuts.length,
      rows: set.credits.length,
    },
  }
}

/** Typical winning and losing total when the club batted first, per grade (spec 5.4 "par scores"). Medians show from `minGames` games. */
export type ParRow = { grade: string; winN: number; winMedian: number | null; lossN: number; lossMedian: number | null }

export function parScores(games: readonly GameView[], gradeLabel: (g: string | null) => string, minGames: number = INSIGHTS.teamMinGames): ParRow[] {
  const by = new Map<string, { win: number[]; loss: number[] }>()
  for (const g of games) {
    if (g.battedFirst !== true || (g.outcome !== 'won' && g.outcome !== 'lost')) continue
    const total = g.innings[0]?.runs
    if (total === null || total === undefined) continue
    const key = gradeLabel(g.header.grade)
    const e = by.get(key) ?? { win: [], loss: [] }
    e[g.outcome === 'won' ? 'win' : 'loss'].push(total)
    by.set(key, e)
  }
  return [...by]
    .map(([grade, e]) => ({
      grade, winN: e.win.length, winMedian: e.win.length >= minGames ? median(e.win) : null, lossN: e.loss.length, lossMedian: e.loss.length >= minGames ? median(e.loss) : null,
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade))
}
