/**
 * insights-pages.int (wave E, WP-3): the Insights pages render against the seeded match store. Team analysis and trends show their
 * samples, a player's trends page has charts and a season comparison, a hidden player and an unknown slug are 404, a player with
 * too few games and a player whose games are all in a junior grade get no per-innings detail, and no opposition person (the
 * seeded one included) appears in any of the output.
 */
import { eq } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { matchTables } from '@/lib/match-store/db'
import { getAllFacts } from '@/lib/match-store/stats-queries'
import { DEMO_OPPOSITION_PLAYER, MATCH_SEED_HIDDEN_KEY } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetMatches } from './match-helpers'

// The stats menu is an async server component (it asks whether the vote board is on); it cannot render to static markup here.
vi.mock('@/components/stats/stats-sub-nav', () => ({ StatsSubNav: () => null }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let slugOf: Map<string, string>
let oppositionNames: string[] = []

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')
const render = async (node: unknown) => text(renderToStaticMarkup(await (node as Promise<React.ReactElement>)))
const team = async (sp: Record<string, string> = {}) => render((await import('@/app/(frontend)/stats/insights/page')).default({ searchParams: Promise.resolve(sp) }))
const trends = async (sp: Record<string, string> = {}) => render((await import('@/app/(frontend)/stats/insights/trends/page')).default({ searchParams: Promise.resolve(sp) }))
const player = async (slug: string, sp: Record<string, string> = {}) =>
  render((await import('@/app/(frontend)/stats/insights/players/[slug]/page')).default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(sp) }))

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const t = matchTables(payload)
  const rows: { slug: string; nameKey: string }[] = await payload.db.drizzle.select({ slug: t.players.slug, nameKey: t.player_aliases.nameKey }).from(t.players).innerJoin(t.player_aliases, eq(t.player_aliases.player, t.players.id))
  slugOf = new Map(rows.map((r) => [r.nameKey, r.slug]))
  const opp = await payload.find({ collection: 'match-appearances', where: { isClubSide: { equals: false } }, pagination: false, depth: 0, select: { displayName: true } })
  oppositionNames = [...new Set(opp.docs.flatMap((d) => (d.displayName ? [d.displayName] : [])))]
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await resetGlobal(payload, 'site-settings')
  await destroyTestPayload(payload)
})

describe('seed supports the pages', () => {
  it('has stored opposition people (so the absence checks below cannot pass on an empty seed), including the named demo one', () => {
    expect(oppositionNames.length).toBeGreaterThan(10)
    expect(oppositionNames).toContain(DEMO_OPPOSITION_PLAYER)
  })
  it('has a player with six or more innings in each season and a player with too few games', async () => {
    const set = await getAllFacts()
    const bySeason = new Map<number, Map<string, number>>()
    for (const r of set.bat) {
      const y = set.matches.get(r.m)!.seasonStartYear!
      const per = bySeason.get(r.player) ?? new Map<string, number>()
      per.set(String(y), (per.get(String(y)) ?? 0) + 1)
      bySeason.set(r.player, per)
    }
    expect([...bySeason.values()].some((per) => per.size === 2 && [...per.values()].every((n) => n >= 6))).toBe(true)
    const games = new Map<number, Set<number>>()
    for (const a of set.appearances) games.set(a.player, (games.get(a.player) ?? new Set()).add(a.m))
    expect([...games.values()].some((g) => g.size < 3)).toBe(true)
  })
})

describe('/stats/insights (team analysis)', () => {
  it('renders every section with its sample and the stored game count', async () => {
    const html = await team()
    expect(html).toMatch(/From 12 Oct 2024, 33 games stored/)
    for (const s of ['Results', 'Winning margins', 'Batting', 'Bowling', 'Typical winning totals', 'Fielding']) expect(html).toContain(s)
    expect(html).toContain('Batting first')
    expect(html).toContain('Batting second')
    expect(html).toMatch(/The toss is recorded for \d+ of \d+ games/)
    expect(html).toContain('junior games are not in the match data')
    expect(html).toContain('Forfeits (')
  })
  it('a grade or season filter narrows the games, and an unknown one falls back to everything', async () => {
    const one = await team({ season: 'Summer 2024/25' })
    const all = await team({ season: 'Nope' })
    expect(one).toMatch(/From 12 Oct 2024, \d+ games stored/)
    expect(one).not.toMatch(/33 games stored/)
    expect(all).toMatch(/33 games stored/)
  })
  it('names no opposition person and no hidden player', async () => {
    const html = await team()
    for (const n of oppositionNames) expect(html, n).not.toContain(n)
    expect(html).not.toMatch(/glover/i)
  })
})

describe('/stats/insights/trends', () => {
  it('shows the results strip, season averages, rolling totals and a list of players to open', async () => {
    const html = await trends()
    expect(html).toContain('Last results')
    expect(html).toContain('Average team total by season')
    expect(html).toContain('Our total when batting first')
    expect(html).toContain('Show as table')
    expect(html).toContain('Player trends')
    expect(html).toMatch(/Gavin Tolliver \d+ games/)
    for (const n of oppositionNames) expect(html, n).not.toContain(n)
    expect(html).not.toMatch(/glover/i)
  })
})

describe('/stats/insights/players/[slug]', () => {
  it('shows batting and bowling charts, the season table and a season comparison with samples', async () => {
    const html = await player(slugOf.get('gavin|tolliver')!)
    expect(html).toContain('Runs in each innings')
    expect(html).toContain('Wickets in each spell')
    expect(html).toContain('Season by season')
    expect(html).toContain('Compare seasons')
    expect(html).toMatch(/\d+ inn\)/)
    expect(html).toContain('Show as table')
    expect(html).toMatch(/compared with/)
    expect(html).not.toMatch(/glover/i)
    for (const n of oppositionNames) expect(html, n).not.toContain(n)
  })
  it('the compare picker takes a season and ignores an unknown one', async () => {
    const slug = slugOf.get('gavin|tolliver')!
    const ok = await player(slug, { season: 'Summer 2025/26', vs: 'Summer 2024/25' })
    expect(ok).toContain('2025/26 compared with 2024/25')
    const bad = await player(slug, { season: 'Nope', vs: 'Nope' })
    expect(bad).toContain('compared with')
  })
  it('a player with too few games gets the not-enough message and no chart', async () => {
    const set = await getAllFacts()
    const games = new Map<number, Set<number>>()
    for (const a of set.appearances) games.set(a.player, (games.get(a.player) ?? new Set()).add(a.m))
    const few = [...games].find(([, g]) => g.size < 3)![0]
    const t = matchTables(payload)
    const [row] = await payload.db.drizzle.select({ slug: t.players.slug }).from(t.players).where(eq(t.players.id, few))
    const html = await player(row.slug)
    expect(html).toContain('Not enough games stored yet')
    expect(html).not.toContain('Runs in each innings')
  })
  it('a hidden player and an unknown slug are 404, and hiding after a first read removes the page', async () => {
    const slug = slugOf.get('gavin|tolliver')!
    expect(await player(slug)).toContain('Runs in each innings')
    const hidden = slugOf.get(MATCH_SEED_HIDDEN_KEY)!
    await expect(player(hidden)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NOT_FOUND/)
    await expect(player('no-such-player')).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NOT_FOUND/)
    const t = matchTables(payload)
    const [row] = await payload.db.drizzle.select({ id: t.players.id }).from(t.players).where(eq(t.players.slug, slug))
    await payload.update({ collection: 'players', id: row.id, data: { hidden: true }, overrideAccess: true })
    try {
      await expect(player(slug)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NOT_FOUND/)
      // ...and the player is gone from the trends list and every aggregate view of the pages.
      expect(await trends()).not.toContain('Gavin Tolliver')
    } finally {
      await payload.update({ collection: 'players', id: row.id, data: { hidden: false }, overrideAccess: true })
    }
  })
})

describe('junior grade', () => {
  it('a player whose games are all in a junior grade gets season totals only, with no dates or opposition, and is absent from the default aggregates', async () => {
    const slug = slugOf.get('nathan|orchard')!
    const before = await player(slug)
    expect(before).toContain('Runs in each innings')
    const set = await getAllFacts()
    const t = matchTables(payload)
    const [pl] = await payload.db.drizzle.select({ id: t.players.id }).from(t.players).where(eq(t.players.slug, slug))
    const ids = [...new Set(set.appearances.filter((a) => a.player === pl.id).map((a) => a.m))]
    const stored = await payload.find({ collection: 'matches', where: { id: { in: ids } }, pagination: false, depth: 0, select: { gradeName: true } })
    const teamBefore = /(\d+) games stored/.exec(await team())![1]
    try {
      for (const m of stored.docs) await payload.update({ collection: 'matches', id: m.id, data: { gradeName: 'Under 12 Junior' }, overrideAccess: true })
      const html = await player(slug)
      expect(html).toContain('only season totals are shown')
      expect(html).toContain('Season by season')
      expect(html).not.toContain('Runs in each innings')
      expect(html).not.toMatch(/\d{1,2} \w{3} \d{4} v /)
      for (const n of oppositionNames) expect(html, n).not.toContain(n)
      // The team pages use the default categories, so these games are no longer in them.
      const teamAfter = /(\d+) games stored/.exec(await team())![1]
      expect(Number(teamAfter)).toBe(Number(teamBefore) - ids.length)
    } finally {
      for (const m of stored.docs) await payload.update({ collection: 'matches', id: m.id, data: { gradeName: m.gradeName }, overrideAccess: true })
    }
  })
})

describe('extras reader', () => {
  it('holds numbers only (no person), and leaves an imported game out', async () => {
    const { getInsightsExtras } = await import('@/lib/match-store/insights-queries')
    const x = await getInsightsExtras()
    expect(x.toss.size).toBeGreaterThan(0)
    expect(x.extras.size).toBeGreaterThan(0)
    for (const [k, v] of x.extras) {
      expect(k).toMatch(/^\d+:\d+$/)
      expect(Object.values(v).every((n) => Number.isFinite(n))).toBe(true)
    }
    const m = (await payload.find({ collection: 'matches', limit: 1, sort: 'id', depth: 0, select: { source: true } })).docs[0]
    await payload.update({ collection: 'matches', id: m.id, data: { source: 'import' }, overrideAccess: true })
    try {
      const y = await getInsightsExtras()
      expect([...y.extras.keys()].some((k) => k.startsWith(`${m.id}:`))).toBe(false)
      expect(y.toss.has(m.id)).toBe(true)
    } finally {
      await payload.update({ collection: 'matches', id: m.id, data: { source: m.source ?? 'playhq' }, overrideAccess: true })
    }
  })
})
