import type { ScoutInnings, ScoutMatch } from './types'

export type TotalsStat = {
  /** Innings with a recorded total. */
  n: number
  mean: number | null
  high: number | null
  low: number | null
  allOut: number
  /** Innings with a recorded wicket count, and the mean over them. */
  wicketsN: number
  meanWickets: number | null
}

export type SideTotals = {
  all: TotalsStat
  /** First innings of a game with one innings each. */
  first: TotalsStat
  /** Second innings of a game with one innings each (a chase). */
  chasing: TotalsStat
  /** Innings played whose total is not recorded (excluded from every figure above). */
  excluded: number
}

export type Totals = { theirs: SideTotals; ours: SideTotals }

const stat = (innings: readonly ScoutInnings[]): TotalsStat => {
  const withRuns = innings.filter((i) => i.runs !== null)
  const runs = withRuns.map((i) => i.runs as number)
  const wk = innings.filter((i) => i.wickets !== null).map((i) => i.wickets as number)
  return {
    n: runs.length,
    mean: runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : null,
    high: runs.length ? Math.max(...runs) : null,
    low: runs.length ? Math.min(...runs) : null,
    allOut: withRuns.filter((i) => i.allOut).length,
    wicketsN: wk.length,
    meanWickets: wk.length ? wk.reduce((a, b) => a + b, 0) / wk.length : null,
  }
}

/**
 * Typical totals against us and ours against them (wave E spec 3.1 item 3). An unknown team total is excluded and counted, never read as 0.
 * "First" and "chasing" apply only to games with exactly two played innings (one each): a two-day game's innings order says little about a chase.
 */
export function totalsOf(matches: readonly ScoutMatch[]): Totals {
  const build = (club: boolean): SideTotals => {
    const all: ScoutInnings[] = []
    const first: ScoutInnings[] = []
    const chasing: ScoutInnings[] = []
    let excluded = 0
    for (const m of matches) {
      const played = m.innings.filter((i) => i.played).sort((a, b) => a.seq - b.seq)
      const oneEach = played.length === 2 && played[0].clubBatting !== played[1].clubBatting
      played.forEach((i, idx) => {
        if (i.clubBatting !== club) return
        if (i.runs === null) {
          excluded++
          return
        }
        all.push(i)
        if (oneEach) (idx === 0 ? first : chasing).push(i)
      })
    }
    return { all: stat(all), first: stat(first), chasing: stat(chasing), excluded }
  }
  return { theirs: build(false), ours: build(true) }
}
