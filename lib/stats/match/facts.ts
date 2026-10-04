import type { StoredBundle } from '@/lib/match-store/read'
import type { BattingRow, FieldingRow } from '@/lib/playhq/match-rows'
import { derivePartnerships, type PartnershipRow } from './partnerships'
import { oppositionKey, oppositionLabel } from './opposition-key'
import {
  BOWLER_TYPES, inningsKey, type Appearance, type BatFact, type BatStatus, type BowlFact, type BowlerType, type CreditFact,
  type FactSet, type InningsMeta, type MatchHeader, type PartnershipFact,
} from './types'

/**
 * `deriveFacts` turns one stored match into facts (W2 spec 2.1). Pure: the caller supplies the ids of
 * visible players. Rules:
 * - only FINAL matches; an innings counts only when `played` (so a forfeit contributes no innings);
 * - a batting row counts when `battingStatus != did_not_bat` (`unknown` is an innings, neither out nor not out);
 * - a club-side row without a visible player produces no fact (it only takes part in pairing partnerships);
 * - appearances (games) include forfeits and count one per listed row, as the season table does.
 */
export type BundleFacts = {
  header: MatchHeader
  appearances: Appearance[]
  innings: InningsMeta[]
  bat: BatFact[]
  bowl: BowlFact[]
  credits: CreditFact[]
  partnerships: PartnershipFact[]
}

const BOWLER_CREDIT = new Set<string>(BOWLER_TYPES)
const zeroByType = (): Record<BowlerType, number> => ({ bowled: 0, caught: 0, caught_and_bowled: 0, lbw: 0, stumped: 0, hit_wicket: 0 })

export function deriveFacts(bundle: StoredBundle, visibleIds: ReadonlySet<number>, id: number = bundle.id ?? 0): BundleFacts | null {
  const mt = bundle.match
  if (mt.status !== 'FINAL') return null
  const header: MatchHeader = {
    id, gameId: mt.gameId, date: mt.localDate, seasonName: mt.seasonName, seasonStartYear: mt.seasonStartYear,
    grade: mt.gradeName, team: mt.clubTeamName, format: mt.type, result: mt.result, forfeit: mt.byForfeit, firstInnings: mt.onFirstInnings,
    oppKey: oppositionKey(mt), oppLabel: oppositionLabel(mt),
  }
  const app = new Map(bundle.appearances.map((a) => [a.appearanceId, a]))
  const playerOf = (aid: string | null): number | null => {
    const a = aid ? app.get(aid) : undefined
    return a && a.isClubSide && a.player !== null && visibleIds.has(a.player) ? a.player : null
  }
  const isClub = (aid: string | null) => !!(aid && app.get(aid)?.isClubSide)
  // One appearance per listed row, like the season table (a same-name pair merged into one player counts twice).
  const appearances: Appearance[] = []
  for (const a of bundle.appearances) {
    const p = playerOf(a.appearanceId)
    if (p !== null) appearances.push({ m: id, player: p })
  }

  const out: BundleFacts = { header, appearances, innings: [], bat: [], bowl: [], credits: [], partnerships: [] }
  for (const inn of [...bundle.innings].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    if (!inn.played) continue
    const seq = inn.sequenceNo
    const rows = bundle.batting.filter((r) => r.inningsSeq === seq && r.battingStatus !== 'did_not_bat')
    const meta: InningsMeta = {
      m: id, seq, clubBatting: inn.isClubBatting, declared: inn.declared, allOut: inn.allOut, runs: inn.totalRuns, wickets: inn.totalWickets,
      hasFow: inn.hasFallOfWickets, hasBowling: inn.hasBowlingData, hasBall: inn.hasBallData, partnerships: null,
    }
    if (inn.isClubBatting) {
      const clubRows = rows.filter((r) => isClub(r.appearanceId))
      for (const r of clubRows) {
        const player = playerOf(r.appearanceId)
        if (player !== null) out.bat.push(batFact(id, seq, player, r))
      }
      const input: PartnershipRow[] = clubRows.map((r) => ({
        player: playerOf(r.appearanceId), position: r.position, status: r.battingStatus as BatStatus, dismissal: r.dismissalType, fowWicket: r.fowWicket, fowRuns: r.fowRuns,
      }))
      const res = derivePartnerships({ hasFow: inn.hasFallOfWickets, allOut: inn.allOut, totalRuns: inn.totalRuns, totalWickets: inn.totalWickets, rows: input })
      meta.partnerships = res.unavailable ?? 'ok'
      for (const p of res.pairs) out.partnerships.push({ m: id, seq, ...p })
    } else {
      // The club bowls: the other side's rows hold the dismissal events.
      const credited = new Map<string, Record<BowlerType, number>>()
      const catches = new Map<string, number>()
      for (const r of rows) {
        if (isClub(r.appearanceId) || r.battingStatus === 'not_out') continue
        const t = r.dismissalType
        if (t && BOWLER_CREDIT.has(t) && r.bowlerAppearanceId) {
          const c = credited.get(r.bowlerAppearanceId) ?? zeroByType()
          c[t as BowlerType]++
          credited.set(r.bowlerAppearanceId, c)
        }
        const fielder = t === 'caught' ? r.fielderAppearanceId : t === 'caught_and_bowled' ? r.bowlerAppearanceId : null
        if (fielder) catches.set(fielder, (catches.get(fielder) ?? 0) + 1)
      }
      for (const b of bundle.bowling.filter((r) => r.inningsSeq === seq)) {
        const player = playerOf(b.appearanceId)
        if (player === null) continue
        const byType = credited.get(b.appearanceId) ?? zeroByType()
        const total = BOWLER_TYPES.reduce((s, k) => s + byType[k], 0)
        out.bowl.push({
          m: id, seq, player, balls: b.balls, maidens: b.maidens, runs: b.runs, wickets: b.wickets,
          reconciled: inn.hasBowlingData && total === b.wickets, byType,
        })
      }
      const fielding = new Map<string, FieldingRow>(bundle.fielding.filter((f) => f.inningsSeq === seq).map((f) => [f.appearanceId, f]))
      const fielders = new Set([...catches.keys(), ...fielding.keys()])
      for (const aid of fielders) {
        const player = playerOf(aid)
        if (player === null) continue
        const f = fielding.get(aid)
        out.credits.push({
          m: id, seq, player, catches: catches.get(aid) ?? 0,
          keeperCatches: f ? f.keeperCatches : null, runOuts: f ? f.runOutsAssisted + f.runOutsUnassisted : null, stumpings: f ? f.stumpings : null,
        })
      }
    }
    out.innings.push(meta)
  }
  return out
}

function batFact(m: number, seq: number, player: number, r: BattingRow): BatFact {
  return {
    m, seq, player, pos: r.position, status: r.battingStatus as BatStatus, runs: r.runs, balls: r.balls, fours: r.fours, sixes: r.sixes, dismissal: r.dismissalType,
  }
}

/** Fold bundle facts into one `FactSet` (for one season blob or any custom selection). */
export function assembleFacts(parts: readonly BundleFacts[]): FactSet {
  const set: FactSet = { matches: new Map(), innings: new Map(), appearances: [], bat: [], bowl: [], credits: [], partnerships: [] }
  for (const p of parts) {
    set.matches.set(p.header.id, p.header)
    for (const i of p.innings) set.innings.set(inningsKey(i.m, i.seq), i)
    set.appearances.push(...p.appearances)
    set.bat.push(...p.bat)
    set.bowl.push(...p.bowl)
    set.credits.push(...p.credits)
    set.partnerships.push(...p.partnerships)
  }
  return set
}

/** Merge fact sets with distinct match ids (one per season). */
export function mergeFactSets(sets: readonly FactSet[]): FactSet {
  const out: FactSet = { matches: new Map(), innings: new Map(), appearances: [], bat: [], bowl: [], credits: [], partnerships: [] }
  for (const s of sets) {
    for (const [k, v] of s.matches) out.matches.set(k, v)
    for (const [k, v] of s.innings) out.innings.set(k, v)
    out.appearances.push(...s.appearances)
    out.bat.push(...s.bat)
    out.bowl.push(...s.bowl)
    out.credits.push(...s.credits)
    out.partnerships.push(...s.partnerships)
  }
  return out
}

/** Keep only the matches that pass `keep` (grade category, season, opposition, ...), and every row of those matches. */
export function filterFacts(set: FactSet, keep: (h: MatchHeader) => boolean): FactSet {
  const matches = new Map([...set.matches].filter(([, h]) => keep(h)))
  const has = (m: number) => matches.has(m)
  return {
    matches,
    innings: new Map([...set.innings].filter(([, i]) => has(i.m))),
    appearances: set.appearances.filter((a) => has(a.m)),
    bat: set.bat.filter((r) => has(r.m)),
    bowl: set.bowl.filter((r) => has(r.m)),
    credits: set.credits.filter((r) => has(r.m)),
    partnerships: set.partnerships.filter((r) => has(r.m)),
  }
}

/** One player's slice of a fact set. Matches and innings are shared (not copied). */
export function playerFacts(set: FactSet, playerId: number): FactSet {
  const mine = set.appearances.filter((a) => a.player === playerId)
  const ms = new Set(mine.map((a) => a.m))
  return {
    matches: new Map([...set.matches].filter(([m]) => ms.has(m))),
    innings: new Map([...set.innings].filter(([, i]) => ms.has(i.m))),
    appearances: mine,
    bat: set.bat.filter((r) => r.player === playerId),
    bowl: set.bowl.filter((r) => r.player === playerId),
    credits: set.credits.filter((r) => r.player === playerId),
    partnerships: set.partnerships.filter((p) => p.a === playerId || p.b === playerId),
  }
}

/** Split into per-player fact sets in one pass (partnerships are not split: use `partnershipsForPlayer`). */
export function splitByPlayer(set: FactSet): Map<number, FactSet> {
  const by = new Map<number, FactSet>()
  const get = (p: number) => {
    let s = by.get(p)
    if (!s) by.set(p, (s = { matches: set.matches, innings: set.innings, appearances: [], bat: [], bowl: [], credits: [], partnerships: [] }))
    return s
  }
  for (const a of set.appearances) get(a.player).appearances.push(a)
  for (const r of set.bat) get(r.player).bat.push(r)
  for (const r of set.bowl) get(r.player).bowl.push(r)
  for (const r of set.credits) get(r.player).credits.push(r)
  return by
}
