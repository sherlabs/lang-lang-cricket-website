/**
 * insights-wickets.int (wave E, WP-4): the Wickets page renders from the seeded match store. Score at wicket per side and format,
 * collapses with the seeded one found on both sides, the honest excluded and rejected counts, a game with its fall of wickets
 * taken away counted as excluded, a season filter, and no opposition person or hidden player anywhere in the output.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fowInnings, collapseSummary } from '@/lib/insights/wickets'
import { encodeFacts } from '@/lib/stats/match/codec'
import { filterFacts } from '@/lib/stats/match/facts'
import { getAllFacts } from '@/lib/match-store/stats-queries'
import { INSIGHTS } from '@/config/site'
import { MATCH_SEED_HIDDEN_KEY } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('@/components/stats/stats-sub-nav', () => ({ StatsSubNav: () => null }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let oppositionNames: string[] = []

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')
const html = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await (await import('@/app/(frontend)/stats/insights/wickets/page')).default({ searchParams: Promise.resolve(sp) }))
const page = async (sp: Record<string, string> = {}) => text(await html(sp))

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const opp = await payload.find({ collection: 'match-appearances', where: { isClubSide: { equals: false } }, pagination: false, depth: 0, select: { displayName: true } })
  oppositionNames = [...new Set(opp.docs.flatMap((d) => (d.displayName ? [d.displayName] : [])))]
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await resetGlobal(payload, 'site-settings')
  await destroyTestPayload(payload)
})

describe('seed supports the page', () => {
  it('has valid fall of wickets, innings without it, a rejected one and a collapse on each side', async () => {
    const set = await getAllFacts()
    const { list, coverage } = fowInnings(set)
    expect(coverage.valid).toBeGreaterThan(20)
    expect(coverage.noFow).toBeGreaterThanOrEqual(3)
    expect(coverage.rejected.fow_gap).toBeGreaterThanOrEqual(2)
    expect(oppositionNames.length).toBeGreaterThan(10)
    const s = collapseSummary(list, set.partnerships, set.innings, { wickets: INSIGHTS.fow.collapseWickets, runs: INSIGHTS.fow.collapseRuns })
    const round23 = s.entries.filter((e) => e.header.date === '2026-04-25')
    expect(new Set(round23.map((e) => e.side))).toEqual(new Set(['ours', 'theirs']))
    expect(round23.every((e) => e.collapse.wickets >= 4 && e.collapse.runs <= 20 + 5 * 3)).toBe(true)
  })
})

describe('cache blob size', () => {
  it('the fall-of-wickets scores add little to a season blob, which stays far below the 2 MB cache entry limit', async () => {
    const set = await getAllFacts()
    const years = [...new Set([...set.matches.values()].map((h) => h.seasonStartYear))]
    for (const y of years) {
      const slim = encodeFacts(filterFacts(set, (h) => h.seasonStartYear === y))
      const total = JSON.stringify(slim).length
      const withoutFow = JSON.stringify({ ...slim, innings: slim.innings.map((r) => r.slice(0, 11)) }).length
      console.info(`[blob] season ${y}: ${slim.innings.length} innings, ${total} bytes, fall of wickets adds ${total - withoutFow} bytes`)
      expect(total).toBeLessThan(2 * 1024 * 1024 * 0.1)
      expect(total - withoutFow).toBeLessThan(slim.innings.length * 70)
    }
  })
})

describe('/stats/insights/wickets', () => {
  it('renders score-at-wicket for both sides, by format, with the coverage counts and the not-an-over note', async () => {
    const t = await page()
    expect(t).toContain('Score at each wicket')
    expect(t).toContain('Our batting')
    expect(t).toContain('Opposition batting against us')
    expect(t).toContain('Our batting: limited-overs games')
    expect(t).toContain('Our batting: two-day games')
    expect(t).toMatch(/Of \d+ innings in this view, \d+ have a usable fall of wickets/)
    expect(t).toMatch(/\d+ innings? (has|have) no fall of wickets/)
    expect(t).toMatch(/were rejected because the stored figures do not add up \(.*missing fall of wicket number/)
    expect(t).toContain('PlayHQ does not record the over')
  })

  it('lists the collapses with the rule in use, the seeded one for both sides, a scorecard link and an inferred recovery stand', async () => {
    const h = await html()
    const t = text(h)
    expect(t).toMatch(/4 wickets for 20 runs or fewer/)
    expect(t).toMatch(/We lost \d+ wickets for \d+ runs\s*, from \d+ for \d+ to \d+ for \d+/)
    expect(t).toMatch(/We took \d+ wickets for \d+ runs/)
    expect(t).toContain('25 Apr 2026')
    expect(h).toMatch(/href="\/fixtures\/[0-9a-f-]+"/)
    expect(t).toMatch(/Biggest stand after it: \d+ \(inferred/)
  })

  it('a season filter narrows it and an unknown season falls back to everything', async () => {
    const all = await page()
    const one = await page({ season: 'Summer 2024/25' })
    const unknown = await page({ season: 'not a season' })
    expect(one).not.toContain('25 Apr 2026')
    expect(one).toMatch(/Of \d+ innings in this view/)
    expect(Number(one.match(/Of (\d+) innings/)![1])).toBeLessThan(Number(all.match(/Of (\d+) innings/)![1]))
    expect(unknown).toBe(all)
  })

  it('an innings whose fall of wickets is taken away is counted as excluded, not as zero', async () => {
    const before = (await page()).match(/Of (\d+) innings in this view, (\d+) have/)!
    const doc = (await payload.find({ collection: 'match-innings', where: { and: [{ hasFallOfWickets: { equals: true } }, { played: { equals: true } }] }, limit: 1, sort: 'id', depth: 0 })).docs[0]
    await payload.update({ collection: 'match-innings', id: doc.id, data: { hasFallOfWickets: false }, overrideAccess: true })
    try {
      const after = (await page()).match(/Of (\d+) innings in this view, (\d+) have/)!
      expect(after[1]).toBe(before[1])
      expect(Number(after[2])).toBe(Number(before[2]) - 1)
    } finally {
      await payload.update({ collection: 'match-innings', id: doc.id, data: { hasFallOfWickets: true }, overrideAccess: true })
    }
  })

  it('names no opposition person and no hidden player', async () => {
    const t = await page()
    for (const name of oppositionNames) expect(t).not.toContain(name)
    const [first, last] = MATCH_SEED_HIDDEN_KEY.split('|')
    expect(t.toLowerCase()).not.toContain(`${first} ${last}`.toLowerCase())
  })
})
