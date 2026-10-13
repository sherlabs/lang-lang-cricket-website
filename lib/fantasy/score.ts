import type { BatFact, BowlFact, CreditFact, FactSet, MatchHeader } from '../stats/match/types'
import { SCORING_LABELS, type ScoringKey, type ScoringTable } from './rules'
import { weekendKey } from '../selection/weekend'

/**
 * Fantasy scoring (wave F spec 4.6). Pure: facts in, points and a "why" out. A fact that is missing scores nothing and is never
 * invented: `fours: null` fires no four bonus, a null stumping count adds nothing, a player with no appearance scores 0.
 * Catches come from `catches` only (it already holds a keeper's catches, because the keeper is the credited fielder on a caught
 * dismissal), so `keeperCatches` (the scorer's separate fielding stat) is deliberately never added.
 */
export type ScorePart = { key: ScoringKey; label: string; count: number; points: number }
export type GameScore = { points: number; parts: ScorePart[] }

const RETIRED = new Set(['retired', 'retired_hurt', 'retired_out'])

export type PlayerGameFacts = { appeared: boolean; bat: readonly BatFact[]; bowl: readonly BowlFact[]; credits: readonly CreditFact[] }

export function scorePlayerGame(facts: PlayerGameFacts, table: ScoringTable): GameScore {
  const counts = new Map<ScoringKey, number>()
  const add = (k: ScoringKey, n: number) => {
    if (n !== 0) counts.set(k, (counts.get(k) ?? 0) + n)
  }
  if (!facts.appeared) return { points: 0, parts: [] }
  add('appearance', 1)
  for (const b of facts.bat) {
    add('run', b.runs)
    if (b.fours !== null) add('four', b.fours)
    if (b.sixes !== null) add('six', b.sixes)
    if (b.runs >= 50) add('fifty', 1)
    if (b.runs >= 100) add('hundred', 1)
    if (b.status === 'out' && b.runs === 0 && !(b.dismissal && RETIRED.has(b.dismissal))) add('duck', 1)
  }
  for (const w of facts.bowl) {
    add('wicket', w.wickets)
    add('maiden', w.maidens)
    if (w.wickets >= 3) add('threeWickets', 1)
    if (w.wickets >= 5) add('fiveWickets', 1)
  }
  for (const c of facts.credits) {
    add('catch', c.catches)
    if (c.stumpings !== null) add('stumping', c.stumpings)
    if (c.runOuts !== null) add('runOut', c.runOuts)
  }
  const parts: ScorePart[] = []
  let points = 0
  for (const [key, count] of counts) {
    const p = count * table[key]
    parts.push({ key, label: SCORING_LABELS[key], count, points: p })
    points += p
  }
  return { points, parts }
}

/** A stored FINAL game played to no result scores no appearance (an abandoned game, or a forfeit). */
export const isNoResultHeader = (h: Pick<MatchHeader, 'forfeit' | 'result'>): boolean => h.forfeit || h.result === 'abandoned'

export type PlayerRound = { points: number; parts: ScorePart[]; games: number }

/** Matches of the set that score (everything but a no-result game), optionally limited to one weekend. */
export function scoringMatchIds(set: FactSet, round?: string): Set<number> {
  const ids = new Set<number>()
  for (const [id, h] of set.matches) {
    if (isNoResultHeader(h)) continue
    if (round !== undefined && (!h.date || weekendKey(h.date) !== round)) continue
    ids.add(id)
  }
  return ids
}

/**
 * Points per player over the given matches. `eligible` is the set of players who may score (no juniors; the facts layer already
 * drops hidden players). A player who played twice sums both games.
 */
export function pointsForMatches(set: FactSet, matchIds: ReadonlySet<number>, table: ScoringTable, eligible: ReadonlySet<number>): Map<number, PlayerRound> {
  const out = new Map<number, PlayerRound>()
  if (!matchIds.size) return out
  type Slot = { appeared: boolean; bat: BatFact[]; bowl: BowlFact[]; credits: CreditFact[] }
  const per = new Map<string, Slot>()
  const slot = (m: number, p: number): Slot => {
    const k = `${m}:${p}`
    let s = per.get(k)
    if (!s) per.set(k, (s = { appeared: false, bat: [], bowl: [], credits: [] }))
    return s
  }
  for (const a of set.appearances) if (matchIds.has(a.m) && eligible.has(a.player)) slot(a.m, a.player).appeared = true
  for (const r of set.bat) if (matchIds.has(r.m) && eligible.has(r.player)) slot(r.m, r.player).bat.push(r)
  for (const r of set.bowl) if (matchIds.has(r.m) && eligible.has(r.player)) slot(r.m, r.player).bowl.push(r)
  for (const r of set.credits) if (matchIds.has(r.m) && eligible.has(r.player)) slot(r.m, r.player).credits.push(r)
  for (const [k, s] of per) {
    // Never score someone who has facts but no appearance row.
    if (!s.appeared) continue
    const player = Number(k.split(':')[1])
    const g = scorePlayerGame(s, table)
    const cur = out.get(player) ?? { points: 0, parts: [], games: 0 }
    cur.points += g.points
    cur.games += 1
    for (const p of g.parts) {
      const same = cur.parts.find((x) => x.key === p.key)
      if (same) {
        same.count += p.count
        same.points += p.points
      } else cur.parts.push({ ...p })
    }
    out.set(player, cur)
  }
  return out
}

/** Points per player for one round (weekend). */
export const roundPoints = (set: FactSet, round: string, table: ScoringTable, eligible: ReadonlySet<number>): Map<number, PlayerRound> =>
  pointsForMatches(set, scoringMatchIds(set, round), table, eligible)

/** Apply the captain multiplier to a total (negatives double too). */
export const withCaptain = (points: number, isCaptain: boolean, multiplier: number): number => (isCaptain ? points * multiplier : points)
