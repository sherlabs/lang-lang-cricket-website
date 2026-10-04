import type { DismissalType } from '@/lib/playhq/match-rows'
import {
  BOWLER_TYPES, PARTNERSHIP_REASONS, inningsKey,
  type BatFact, type BatStatus, type BowlFact, type BowlerType, type CreditFact, type FactSet, type InningsMeta, type MatchHeader, type PartnershipFact,
} from './types'

/**
 * Columnar encoding of a fact set for the per-season cache blob (W2 spec section 3): one integer row
 * per fact instead of an object, so a season stays far below the 2 MB `unstable_cache` entry cap.
 * Null is -1 (no fact value is negative). The layout is positional: bump the version segment of the `match-facts` cache key
 * in `lib/match-store/stats-queries.ts` whenever it changes, or an old cached blob decodes into wrong values. `decodeFacts(encodeFacts(x))` equals `x`.
 */
export type SlimFacts = {
  matches: MatchHeader[]
  innings: number[][]
  appearances: number[][]
  bat: number[][]
  bowl: number[][]
  credits: number[][]
  partnerships: number[][]
}

const STATUS: BatStatus[] = ['out', 'not_out', 'unknown']
const DISMISSALS: DismissalType[] = ['bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'run_out', 'hit_wicket', 'retired_hurt', 'retired', 'retired_out', 'other']
const n = (v: number | null) => (v === null ? -1 : v)
const u = (v: number) => (v < 0 ? null : v)
const b = (v: boolean) => (v ? 1 : 0)

export function encodeFacts(set: FactSet): SlimFacts {
  return {
    matches: [...set.matches.values()],
    innings: [...set.innings.values()].map((i) => [
      i.m, i.seq, b(i.clubBatting), b(i.declared), b(i.allOut), i.runs ?? -1, i.wickets ?? -1, b(i.hasFow), b(i.hasBowling), b(i.hasBall),
      i.partnerships === null ? -1 : i.partnerships === 'ok' ? 0 : PARTNERSHIP_REASONS.indexOf(i.partnerships) + 1,
    ]),
    appearances: set.appearances.map((a) => [a.m, a.player]),
    bat: set.bat.map((r) => [r.m, r.seq, r.player, r.pos, STATUS.indexOf(r.status), r.runs, n(r.balls), n(r.fours), n(r.sixes), r.dismissal === null ? -1 : DISMISSALS.indexOf(r.dismissal)]),
    bowl: set.bowl.map((r) => [r.m, r.seq, r.player, r.balls, r.maidens, r.runs, r.wickets, b(r.reconciled), ...BOWLER_TYPES.map((k) => r.byType[k])]),
    credits: set.credits.map((r) => [r.m, r.seq, r.player, r.catches, n(r.keeperCatches), n(r.runOuts), n(r.stumpings)]),
    partnerships: set.partnerships.map((p) => [p.m, p.seq, p.wicket, p.runs, n(p.a), n(p.b), b(p.unbroken)]),
  }
}

export function decodeFacts(s: SlimFacts): FactSet {
  const innings = new Map<string, InningsMeta>()
  for (const r of s.innings) {
    innings.set(inningsKey(r[0], r[1]), {
      m: r[0], seq: r[1], clubBatting: r[2] === 1, declared: r[3] === 1, allOut: r[4] === 1, runs: r[5] < 0 ? null : r[5], wickets: r[6] < 0 ? null : r[6], hasFow: r[7] === 1, hasBowling: r[8] === 1, hasBall: r[9] === 1,
      partnerships: r[10] < 0 ? null : r[10] === 0 ? 'ok' : PARTNERSHIP_REASONS[r[10] - 1],
    })
  }
  return {
    matches: new Map(s.matches.map((h) => [h.id, h])),
    innings,
    appearances: s.appearances.map((r) => ({ m: r[0], player: r[1] })),
    bat: s.bat.map<BatFact>((r) => ({ m: r[0], seq: r[1], player: r[2], pos: r[3], status: STATUS[r[4]], runs: r[5], balls: u(r[6]), fours: u(r[7]), sixes: u(r[8]), dismissal: r[9] < 0 ? null : DISMISSALS[r[9]] })),
    bowl: s.bowl.map<BowlFact>((r) => ({
      m: r[0], seq: r[1], player: r[2], balls: r[3], maidens: r[4], runs: r[5], wickets: r[6], reconciled: r[7] === 1,
      byType: Object.fromEntries(BOWLER_TYPES.map((k, i) => [k, r[8 + i]])) as Record<BowlerType, number>,
    })),
    credits: s.credits.map<CreditFact>((r) => ({ m: r[0], seq: r[1], player: r[2], catches: r[3], keeperCatches: u(r[4]), runOuts: u(r[5]), stumpings: u(r[6]) })),
    partnerships: s.partnerships.map<PartnershipFact>((r) => ({ m: r[0], seq: r[1], wicket: r[2], runs: r[3], a: u(r[4]), b: u(r[5]), unbroken: r[6] === 1 })),
  }
}
