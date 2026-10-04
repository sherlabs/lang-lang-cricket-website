import { describe, expect, it } from 'vitest'
import { decodeFacts, encodeFacts } from '@/lib/stats/match/codec'
import { coverageCaption, coverageOf } from '@/lib/stats/match/coverage'
import { assembleFacts, deriveFacts, filterFacts, mergeFactSets } from '@/lib/stats/match/facts'
import { filterMatchFacts } from '@/lib/stats/match/filter'
import { emptyFactSet, inningsKey, type FactSet } from '@/lib/stats/match/types'
import { mkBundle, everyone } from './match-facts-helpers'
import { generateMatchSeed } from '@/payload/scripts/fixtures/match-seed-data'
import { mapMatchBundle, isSkip } from '@/lib/playhq/match-rows'

describe('coverage caption (one format, rule 0.3)', () => {
  const set = assembleFacts([
    deriveFacts(mkBundle({ id: 1, date: '2025-10-11', innings: [
      { seq: 1, clubBatting: true, hasBall: true, hasFow: true, bat: [] }, { seq: 2, clubBatting: false, hasBowling: false, bowl: [] },
    ] }), everyone)!,
    deriveFacts(mkBundle({ id: 2, gameId: 'g2', date: '2025-09-20', innings: [{ seq: 1, clubBatting: true, hasBall: false, hasFow: true, bat: [] }, { seq: 2, clubBatting: false, bowl: [] }] }), everyone)!,
  ])
  it('states the first stored date and the number of games', () => {
    expect(coverageCaption(coverageOf(set), undefined, 'en-AU')).toMatch(/^From 20 Sept? 2025, 2 games stored\.$/)
  })
  it.each([
    ['balls', 'From 20 Sep 2025, 2 games stored. 1 of 2 innings have ball-by-ball totals.'],
    ['fow', 'From 20 Sep 2025, 2 games stored. 2 of 2 innings have fall of wickets.'],
    ['bowling', 'From 20 Sep 2025, 2 games stored. 1 of 2 innings have bowling figures.'],
  ] as const)('adds the %s denominator', (need, text) => {
    expect(coverageCaption(coverageOf(set), need, 'en-AU').replace('Sept ', 'Sep ')).toBe(text)
  })
  it('lists each distinct need once, and says when only the newest seasons were read', () => {
    const text = coverageCaption(coverageOf(set), ['balls', 'bowling', 'balls', null, undefined], 'en-AU').replace('Sept ', 'Sep ')
    expect(text).toBe('From 20 Sep 2025, 2 games stored. 1 of 2 innings have ball-by-ball totals. 1 of 2 innings have bowling figures.')
    const capped = coverageCaption(coverageOf({ ...set, seasonCap: { kept: 8, total: 11 } }), undefined, 'en-AU')
    expect(capped).toContain('Only the newest 8 of 11 stored seasons are included.')
    // A filter to one season drops the note; a player slice keeps it.
    expect(coverageOf(filterMatchFacts({ ...set, seasonCap: { kept: 8, total: 11 } }, { season: set.matches.get(1)!.seasonName })).seasonCap).toBeUndefined()
    expect(coverageOf(filterMatchFacts({ ...set, seasonCap: { kept: 8, total: 11 } }, {})).seasonCap).toEqual({ kept: 8, total: 11 })
  })
  it('handles an empty store and a single game', () => {
    expect(coverageCaption(coverageOf(emptyFactSet()))).toBe('No matches are stored yet.')
    expect(coverageCaption(coverageOf(filterFacts(set, (h) => h.id === 1)), undefined, 'en-AU')).toBe('From 11 Oct 2025, 1 game stored.')
  })
  it('is computed from matches, so a filter changes it', () => {
    expect(coverageOf(filterFacts(set, (h) => h.id === 2)).firstDate).toBe('2025-09-20')
  })
})

describe('fact codec and the per-season blob size guard', () => {
  const seed = generateMatchSeed('seed-org')
  const bundles = seed.flatMap((g) => {
    const b = mapMatchBundle(g.raw, { clubOrgId: 'seed-org', clubIds: new Set(g.raw.teams.filter((t) => t.organisation.id === 'seed-org').map((t) => t.id)), seasonName: g.seasonName, seasonStartYear: g.seasonStartYear, competitionName: g.competitionName, isJunior: false, fixture: g.fixture })
    return isSkip(b) ? [] : [b]
  })
  const toStored = (b: (typeof bundles)[number], i: number) => ({
    ...b, id: i + 1, appearances: b.appearances.map((a, k) => ({ ...a, player: a.isClubSide ? 1000 + (k % 15) : null })),
  })
  const parts = bundles.map(toStored).map((b) => deriveFacts(b, new Set(Array.from({ length: 15 }, (_, i) => 1000 + i)))!)
  const set = assembleFacts(parts)

  it('round-trips a generated season exactly', () => {
    expect(decodeFacts(JSON.parse(JSON.stringify(encodeFacts(set))))).toEqual(set)
  })
  it('keeps a worst case of ten teams under 1.5 MB per season (the cache entry cap is 2 MB)', () => {
    // Ten teams play about as many games as the generated season has: ten shifted copies of it.
    const shift = (offset: number): FactSet => {
      const mv = <T extends { m: number }>(rows: T[]): T[] => rows.map((r) => ({ ...r, m: r.m + offset }))
      return {
        matches: new Map([...set.matches].map(([id, h]) => [id + offset, { ...h, id: id + offset }])),
        innings: new Map([...set.innings.values()].map((i) => [inningsKey(i.m + offset, i.seq), { ...i, m: i.m + offset }])),
        appearances: mv(set.appearances), bat: mv(set.bat), bowl: mv(set.bowl), credits: mv(set.credits), partnerships: mv(set.partnerships),
      }
    }
    const big = mergeFactSets(Array.from({ length: 10 }, (_, t) => shift(t * 1000)))
    expect(big.matches.size).toBe(set.matches.size * 10)
    expect(JSON.stringify(encodeFacts(big)).length).toBeLessThan(1_500_000)
  })
  it('stores far fewer bytes than the same facts as objects', () => {
    const slim = JSON.stringify(encodeFacts({ ...set, matches: new Map() })).length
    const objects = JSON.stringify({ bat: set.bat, bowl: set.bowl, credits: set.credits, partnerships: set.partnerships, appearances: set.appearances }).length
    expect(slim).toBeLessThan(objects / 2)
  })
})
