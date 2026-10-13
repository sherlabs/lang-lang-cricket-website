import type { TossSummary } from './toss'
import type { Totals } from './totals'
import type { ScoutMatch } from './types'

/**
 * The game plan (spec 3.1 item 8): short sentences from fixed rules. Each one cites its number and its sample (n) and is left out
 * below `minSample`. No model, no speculation; when no rule fires the page says so.
 */
export type PlanLine = { id: string; text: string; n: number }

export type OpeningStands = { n: number; early: number }

/** Their innings with a stored fall of wickets: how many lost their first wicket on or before `runs`. Counts innings with no wicket as not early. */
export function openingStands(matches: readonly ScoutMatch[], runs: number): OpeningStands {
  let n = 0
  let early = 0
  for (const m of matches) {
    for (const i of m.innings) {
      if (!i.played || i.clubBatting || !i.hasFow) continue
      n++
      const first = m.bat.filter((b) => b.inningsSeq === i.seq && b.fowWicket === 1 && b.fowRuns !== null).map((b) => b.fowRuns as number)
      if (first.length > 0 && Math.min(...first) <= runs) early++
    }
  }
  return { n, early }
}

export type ChaseSplit = { n: number; weWon: number }

/** Our results by who batted first, among decided games with one innings each. */
export function resultsByOrder(matches: readonly ScoutMatch[]): { theyBatFirst: ChaseSplit; weBatFirst: ChaseSplit } {
  const out = { theyBatFirst: { n: 0, weWon: 0 }, weBatFirst: { n: 0, weWon: 0 } }
  for (const m of matches) {
    const played = m.innings.filter((i) => i.played).sort((a, b) => a.seq - b.seq)
    if (played.length !== 2 || played[0].clubBatting === played[1].clubBatting) continue
    if (m.forfeit || (m.result !== 'won' && m.result !== 'lost')) continue
    const bucket = played[0].clubBatting ? out.weBatFirst : out.theyBatFirst
    bucket.n++
    if (m.result === 'won') bucket.weWon++
  }
  return out
}

const round = (v: number) => Math.round(v)

export function gamePlan(input: { matches: readonly ScoutMatch[]; totals: Totals; toss: TossSummary; minSample: number; earlyWicketRuns: number }): PlanLine[] {
  const { matches, totals, toss, minSample, earlyWicketRuns } = input
  const lines: PlanLine[] = []

  const chosen = toss.chose.bat + toss.chose.bowl
  if (chosen >= minSample) {
    const bowl = toss.chose.bowl >= toss.chose.bat
    const k = bowl ? toss.chose.bowl : toss.chose.bat
    lines.push({ id: 'toss-choice', n: chosen, text: `They chose to ${bowl ? 'bowl' : 'bat'} in ${k} of the ${chosen} tosses they won (n=${chosen}).` })
  }

  const theirs = totals.theirs.all
  if (theirs.n >= minSample && theirs.mean !== null && theirs.high !== null && theirs.low !== null) {
    lines.push({ id: 'their-totals', n: theirs.n, text: `Their innings against us averaged ${round(theirs.mean)}, from ${theirs.low} to ${theirs.high} (n=${theirs.n}).` })
  }
  if (theirs.n >= minSample) {
    lines.push({ id: 'their-all-out', n: theirs.n, text: `Their innings ended all out in ${theirs.allOut} of ${theirs.n} (n=${theirs.n}).` })
  }

  const stands = openingStands(matches, earlyWicketRuns)
  if (stands.n >= minSample) {
    lines.push({ id: 'early-wicket', n: stands.n, text: `Opening partnership against them: ${stands.early} of ${stands.n} started with a wicket by ${earlyWicketRuns} runs (n=${stands.n}).` })
  }

  const order = resultsByOrder(matches)
  if (order.theyBatFirst.n >= minSample) {
    lines.push({ id: 'they-bat-first', n: order.theyBatFirst.n, text: `When they batted first we won ${order.theyBatFirst.weWon} of ${order.theyBatFirst.n} (n=${order.theyBatFirst.n}).` })
  }
  if (order.weBatFirst.n >= minSample) {
    lines.push({ id: 'we-bat-first', n: order.weBatFirst.n, text: `When we batted first we won ${order.weBatFirst.weWon} of ${order.weBatFirst.n} (n=${order.weBatFirst.n}).` })
  }
  return lines
}
