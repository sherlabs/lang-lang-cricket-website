/**
 * WP-M reconciliation (spec M3, M9): the counts derived from the mapped match rows must equal the
 * season counts `aggregatePlayers` produces from the same raw game, on every integer field, for the
 * real captured summaries and every synthetic game. Compared after alias resolution (a player with
 * two aliases has one season row, built with `combineCounts`).
 */
import { describe, expect, it } from 'vitest'
import oneDay from './fixtures/playhq/game-summary-one-day.json'
import twoDay from './fixtures/playhq/game-summary-two-day.json'
import forfeit from './fixtures/playhq/game-summary-forfeit.json'
import wonForfeit from './fixtures/playhq/game-summary-won-forfeit.json'
import abandoned from './fixtures/playhq/game-summary-abandoned.json'
import { collectPlayerRows, compareCounts, aggregateFromMatchRows } from '@/lib/match-store/aggregate'
import { isSkip, mapMatchBundle, type MatchBundle } from '@/lib/playhq/match-rows'
import { aggregatePlayers } from '@/lib/playhq/players'
import { mapScorecard } from '@/lib/playhq/scorecard'
import type { RawGameSummary } from '@/lib/playhq/types'
import { combineCounts, countsFromStats, type SeasonCounts } from '@/lib/players/season-math'
import { generateMatchSeed, MATCH_SEED_ALIAS, MATCH_SEED_SAME_NAME } from '../payload/scripts/fixtures/match-seed-data'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const alias = (k: string) => (k === MATCH_SEED_ALIAS.nameKey ? MATCH_SEED_ALIAS.canonicalKey : k)

const ctx = (raw: RawGameSummary) => ({
  clubOrgId: ORG, clubIds: new Set(raw.teams.filter((t) => t.organisation?.id === ORG).map((t) => t.id)),
  seasonName: 'S', seasonStartYear: 2025, competitionName: 'C', isJunior: false, fixture: null,
})

type Case = { name: string; raw: RawGameSummary; season: string }
const real: Case[] = [
  { name: 'one-day fixture', raw: oneDay.data as never, season: 'real' },
  { name: 'two-day fixture', raw: twoDay.data as never, season: 'real' },
  { name: 'lost by forfeit', raw: forfeit.data as never, season: 'real' },
  { name: 'won by forfeit', raw: wonForfeit.data as never, season: 'real' },
  { name: 'abandoned', raw: abandoned.data as never, season: 'real' },
]
const seed = generateMatchSeed(ORG).map((g, i) => ({ name: `seed ${i + 1}${g.edge ? ` (${g.edge})` : ''}`, raw: g.raw, season: g.seasonName }))
const cases = [...real, ...seed]

/** What the season side would hold for these games: aggregatePlayers per game, merged through the alias map. */
function expectedFor(raws: RawGameSummary[], teamId: string): Map<string, SeasonCounts> {
  const out = new Map<string, SeasonCounts>()
  const cards = raws.map((r) => mapScorecard(r, ORG, false))
  for (const s of aggregatePlayers(cards, teamId, false)) {
    const key = alias(s.key.trim())
    const counts = countsFromStats(s)
    out.set(key, out.has(key) ? combineCounts(out.get(key)!, counts) : counts)
  }
  return out
}

const clubTeamOf = (raw: RawGameSummary) => raw.teams.find((t) => t.organisation?.id === ORG)!.id

describe('match rows reconcile with the season aggregates', () => {
  it.each(cases)('$name: derived counts equal aggregatePlayers on every integer field', ({ raw }) => {
    const bundle = mapMatchBundle(raw, ctx(raw))
    if (isSkip(bundle)) {
      // Abandoned (status ABANDONED) is never stored and never counted by aggregatePlayers.
      expect(raw.status).not.toBe('FINAL')
      expect(aggregatePlayers([mapScorecard(raw, ORG, false)], clubTeamOf(raw), false)).toEqual([])
      return
    }
    const teamId = bundle.match.clubTeamId
    const expected = expectedFor([raw], teamId)
    const derived = collectPlayerRows([bundle], teamId, (a) => (a.nameKey ? alias(a.nameKey) : null))
    const result = compareCounts(expected, derived)
    expect(result.mismatches).toEqual([])
    expect(result.compared).toBe(expected.size)
  })

  it('a whole season of seed games (with the two-alias player merged) has zero mismatches', () => {
    const games = generateMatchSeed(ORG)
    const bySeason = Map.groupBy(games, (g) => g.seasonName)
    expect(bySeason.size).toBe(2)
    let compared = 0
    for (const [, group] of bySeason) {
      const teamId = clubTeamOf(group[0].raw)
      const bundles = group.map((g) => mapMatchBundle(g.raw, { ...ctx(g.raw), seasonName: g.seasonName })).filter((b): b is MatchBundle => !isSkip(b))
      const expected = expectedFor(group.filter((g) => g.raw.status === 'FINAL').map((g) => g.raw), teamId)
      const derived = collectPlayerRows(bundles, teamId, (a) => (a.nameKey ? alias(a.nameKey) : null))
      const result = compareCounts(expected, derived)
      expect(result.mismatches).toEqual([])
      compared += result.compared
    }
    expect(compared).toBeGreaterThan(20)
  })

  it('the two-alias player really has two name keys that merge into one season row', () => {
    const games = generateMatchSeed(ORG).filter((g) => g.seasonName === 'Summer 2024/25')
    const keys = new Set(games.flatMap((g) => g.raw.appearances.filter((a) => a.teamId === clubTeamOf(g.raw)).map((a) => `${a.firstName}|${a.lastName}`.toLowerCase())))
    expect(keys.has(MATCH_SEED_ALIAS.nameKey)).toBe(true)
    const teamId = clubTeamOf(games[0].raw)
    const split = expectedFor(games.map((g) => g.raw), teamId)
    expect(split.has(MATCH_SEED_ALIAS.nameKey)).toBe(false)
    expect(split.get(MATCH_SEED_ALIAS.canonicalKey)!.games).toBeGreaterThan(1)
  })

  it('same-name pair: catches are excluded from the check and counted, everything else still matches', () => {
    const games = generateMatchSeed(ORG).filter((g) => g.edge === 'same-name pair')
    expect(games.length).toBeGreaterThan(0)
    let skipped = 0
    for (const g of games) {
      const bundle = mapMatchBundle(g.raw, ctx(g.raw)) as MatchBundle
      const teamId = bundle.match.clubTeamId
      const derived = collectPlayerRows([bundle], teamId, (a) => a.nameKey)
      expect(derived.sameName.has(MATCH_SEED_SAME_NAME)).toBe(true)
      const result = compareCounts(expectedFor([g.raw], teamId), derived)
      expect(result.mismatches).toEqual([])
      skipped += result.catchesSkippedSameName
    }
    expect(skipped).toBeGreaterThan(0)
  })

  it('a changed run makes the comparison fail (the check can fail)', () => {
    const raw = oneDay.data as never as RawGameSummary
    const bundle = mapMatchBundle(raw, ctx(raw)) as MatchBundle
    const teamId = bundle.match.clubTeamId
    const expected = expectedFor([raw], teamId)
    const clubIds = new Set(bundle.appearances.filter((a) => a.isClubSide).map((a) => a.appearanceId))
    const first = bundle.batting.findIndex((b) => clubIds.has(b.appearanceId))
    const tampered = { ...bundle, batting: bundle.batting.map((b, i) => (i === first ? { ...b, runs: b.runs + 1 } : b)) }
    const result = compareCounts(expected, collectPlayerRows([tampered], teamId, (a) => a.nameKey))
    expect(result.mismatches.length).toBeGreaterThan(0)
  })

  it('null balls, fours and sixes add nothing (not recorded is never zero runs)', () => {
    expect(aggregateFromMatchRows({
      games: 1, catches: 0, bowling: [],
      batting: [{ played: true, status: 'out', runs: 12, balls: null, fours: null, sixes: null }],
    })).toMatchObject({ batInnings: 1, batRuns: 12, batBalls: 0, batFours: 0, batSixes: 0, batHighScore: 12 })
  })

  it('sum of batting runs plus extras equals the innings total for fully listed innings (warnings only)', () => {
    const warnings: string[] = []
    for (const { name, raw } of cases) {
      const b = mapMatchBundle(raw, ctx(raw))
      if (isSkip(b)) continue
      for (const inn of b.innings.filter((i) => i.played)) {
        const runs = b.batting.filter((r) => r.inningsSeq === inn.sequenceNo).reduce((s, r) => s + r.runs, 0)
        if (runs + inn.extrasTotal !== inn.totalRuns) warnings.push(`${name} innings ${inn.sequenceNo}: ${runs}+${inn.extrasTotal} != ${inn.totalRuns}`)
      }
    }
    // Real summaries can differ when a batter is not a visible player; the synthetic games must not.
    expect(warnings.filter((w) => w.startsWith('seed'))).toEqual([])
    if (warnings.length) console.warn('[reconcile] batting+extras warnings', warnings)
  })
})
