import { oldestFirst, type ScoutMatch } from './types'

/**
 * Their danger batters and bowlers (spec 3.1 item 5). Opposition identity is a name string: two people with the same name merge and a
 * spelling change splits one (finding 3), so every figure is "by name, approximate" and a possible merge is flagged, not hidden.
 * With `showNames` off the lists are by batting position or bowling order and never carry a name.
 */
export type DangerBatter = {
  key: string
  name: string
  innings: number
  runs: number
  /** Dismissals (status "out"). */
  outs: number
  /** Runs per dismissal over innings whose status is known, null with no dismissal ("not out" runs show instead). */
  average: number | null
  highScore: number
  highScoreNotOut: boolean
  fifties: number
  /** Their last innings, oldest first: "34", "12*". */
  recent: string[]
  /** Two different players of this name appeared in one game, so the row may be two people. */
  possiblyMerged: boolean
}

export type DangerBowler = {
  key: string
  name: string
  spells: number
  balls: number
  runs: number
  wickets: number
  /** Runs per over, null below `minBalls`. */
  economy: number | null
  recent: string[]
  possiblyMerged: boolean
}

export type PositionBatting = { position: number; innings: number; runs: number; outs: number; average: number | null; highScore: number }
export type OrderBowling = { order: number; spells: number; balls: number; runs: number; wickets: number; economy: number | null }

type Min = { minInnings: number; minBalls: number; top: number; recent: number }

const nameCounts = (m: ScoutMatch) => {
  const byKey = new Map<string, Set<string>>()
  for (const p of m.people) {
    if (!p.nameKey) continue
    const set = byKey.get(p.nameKey) ?? new Set<string>()
    set.add(p.appearanceId)
    byKey.set(p.nameKey, set)
  }
  return byKey
}

const personOf = (m: ScoutMatch, appearanceId: string) => m.people.find((p) => p.appearanceId === appearanceId)

export function dangerBatters(matches: readonly ScoutMatch[], min: Pick<Min, 'minInnings' | 'top' | 'recent'>): DangerBatter[] {
  type Acc = DangerBatter & { line: string[]; knownRuns: number }
  const acc = new Map<string, Acc>()
  for (const m of [...matches].sort(oldestFirst)) {
    const dup = nameCounts(m)
    for (const b of m.bat) {
      if (b.status === 'did_not_bat') continue
      const person = personOf(m, b.appearanceId)
      if (!person?.nameKey) continue
      const key = person.nameKey
      let r = acc.get(key)
      if (!r) {
        r = { key, name: person.displayName?.trim() || key, innings: 0, runs: 0, outs: 0, average: null, highScore: 0, highScoreNotOut: false, fifties: 0, recent: [], possiblyMerged: false, line: [], knownRuns: 0 }
        acc.set(key, r)
      }
      if ((dup.get(key)?.size ?? 0) > 1) r.possiblyMerged = true
      const notOut = b.status === 'not_out'
      r.innings++
      r.runs += b.runs
      if (b.status === 'out' || notOut) r.knownRuns += b.runs
      if (b.status === 'out') r.outs++
      if (b.runs >= 50) r.fifties++
      if (b.runs > r.highScore || (b.runs === r.highScore && notOut && !r.highScoreNotOut)) {
        r.highScore = b.runs
        r.highScoreNotOut = notOut
      }
      r.line.push(`${b.runs}${notOut ? '*' : ''}`)
    }
  }
  return [...acc.values()]
    .filter((r) => r.innings >= min.minInnings)
    .map(({ line, knownRuns, ...r }) => ({ ...r, average: r.outs > 0 ? knownRuns / r.outs : null, recent: line.slice(-min.recent) }))
    .sort((a, b) => b.runs - a.runs || b.innings - a.innings || a.name.localeCompare(b.name))
    .slice(0, min.top)
}

export function dangerBowlers(matches: readonly ScoutMatch[], min: Pick<Min, 'minBalls' | 'top' | 'recent'>): DangerBowler[] {
  type Acc = DangerBowler & { line: string[] }
  const acc = new Map<string, Acc>()
  for (const m of [...matches].sort(oldestFirst)) {
    const dup = nameCounts(m)
    for (const w of m.bowl) {
      if (w.balls <= 0) continue
      const person = personOf(m, w.appearanceId)
      if (!person?.nameKey) continue
      const key = person.nameKey
      let r = acc.get(key)
      if (!r) {
        r = { key, name: person.displayName?.trim() || key, spells: 0, balls: 0, runs: 0, wickets: 0, economy: null, recent: [], possiblyMerged: false, line: [] }
        acc.set(key, r)
      }
      if ((dup.get(key)?.size ?? 0) > 1) r.possiblyMerged = true
      r.spells++
      r.balls += w.balls
      r.runs += w.runs
      r.wickets += w.wickets
      r.line.push(`${w.wickets}/${w.runs}`)
    }
  }
  return [...acc.values()]
    .filter((r) => r.balls >= min.minBalls)
    .map(({ line, ...r }) => ({ ...r, economy: r.runs / (r.balls / 6), recent: line.slice(-min.recent) }))
    .sort((a, b) => b.wickets - a.wickets || b.balls - a.balls || a.name.localeCompare(b.name))
    .slice(0, min.top)
}

/** The no-names view of batters: one row per batting position (the scorer's card order; 0 means unknown and is skipped). */
export function battingByPosition(matches: readonly ScoutMatch[], minInnings: number): PositionBatting[] {
  const acc = new Map<number, PositionBatting & { knownRuns: number }>()
  for (const m of matches) {
    for (const b of m.bat) {
      if (b.status === 'did_not_bat' || b.position <= 0) continue
      let r = acc.get(b.position)
      if (!r) {
        r = { position: b.position, innings: 0, runs: 0, outs: 0, average: null, highScore: 0, knownRuns: 0 }
        acc.set(b.position, r)
      }
      r.innings++
      r.runs += b.runs
      if (b.status === 'out' || b.status === 'not_out') r.knownRuns += b.runs
      if (b.status === 'out') r.outs++
      r.highScore = Math.max(r.highScore, b.runs)
    }
  }
  return [...acc.values()]
    .filter((r) => r.innings >= minInnings)
    .map(({ knownRuns, ...r }) => ({ ...r, average: r.outs > 0 ? knownRuns / r.outs : null }))
    .sort((a, b) => a.position - b.position)
}

/** The no-names view of bowlers: one row per bowling order (1 = first change). */
export function bowlingByOrder(matches: readonly ScoutMatch[], minBalls: number): OrderBowling[] {
  const acc = new Map<number, OrderBowling>()
  for (const m of matches) {
    for (const w of m.bowl) {
      if (w.balls <= 0 || w.order <= 0) continue
      const r = acc.get(w.order) ?? { order: w.order, spells: 0, balls: 0, runs: 0, wickets: 0, economy: null }
      r.spells++
      r.balls += w.balls
      r.runs += w.runs
      r.wickets += w.wickets
      acc.set(w.order, r)
    }
  }
  return [...acc.values()]
    .filter((r) => r.balls >= minBalls)
    .map((r) => ({ ...r, economy: r.runs / (r.balls / 6) }))
    .sort((a, b) => a.order - b.order)
}
