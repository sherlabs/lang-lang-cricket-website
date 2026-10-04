/**
 * match-stats-pages.int (W2 WP-S1): the new pages render against the seeded match store. The opposition
 * totals equal the seeded match list, forfeits are marked and kept out of the win percentage, the
 * partnership records are labelled as inferred, a profile shows its match analysis sections with
 * captions, a hidden player appears nowhere, and an unknown opposition key falls back to the table.
 */
import { eq } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { matchTables } from '@/lib/match-store/db'
import { generateMatchSeed, MATCH_SEED_HIDDEN_KEY } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let slugOf: Map<string, string>

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const render = async (node: unknown) => text(renderToStaticMarkup(await (node as Promise<React.ReactElement>)))

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const t = matchTables(payload)
  const rows: { slug: string; nameKey: string }[] = await payload.db.drizzle.select({ slug: t.players.slug, nameKey: t.player_aliases.nameKey }).from(t.players).innerJoin(t.player_aliases, eq(t.player_aliases.player, t.players.id))
  slugOf = new Map(rows.map((r) => [r.nameKey, r.slug]))
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await resetGlobal(payload, 'site-settings')
  await destroyTestPayload(payload)
})

describe('/stats/opposition', () => {
  it('totals match the seeded match list, forfeits are marked and win percentage excludes them', async () => {
    const { default: Page } = await import('@/app/(frontend)/stats/opposition/page')
    const html = await render(Page({ searchParams: Promise.resolve({}) }))
    const stored = generateMatchSeed(ORG).filter((g) => g.raw.status === 'FINAL')
    expect(html).toContain(`${stored.length} games stored`)
    // Played across the table sums to the stored games (the table has one row per club).
    const played = new Map<string, number>()
    for (const g of stored) {
      const club = g.raw.teams.find((t) => t.organisation.id !== ORG)!.organisation.name
      played.set(club, (played.get(club) ?? 0) + 1)
    }
    for (const [club, n] of played) expect(html, club).toContain(`${club} ${n} `)
    expect(html).toMatch(/1 won/)
    expect(html).toMatch(/1 lost/)
    expect(html).toContain('Win percentage excludes forfeits')
    expect(html).toContain('junior games are not in the match data')
    expect(html).not.toMatch(/glover/i)
  })

  it('shows a meeting list for a known club and ignores an unknown one', async () => {
    const { default: Page } = await import('@/app/(frontend)/stats/opposition/page')
    const known = await render(Page({ searchParams: Promise.resolve({ club: generateMatchSeed(ORG)[0].raw.teams.find((t) => t.organisation.id !== ORG)!.organisation.id }) }))
    expect(known).toContain('Meetings')
    expect(known).toMatch(/Won|Lost/)
    const unknown = await render(Page({ searchParams: Promise.resolve({ club: 'nope' }) }))
    expect(unknown).not.toContain('Meetings')
  })
})

describe('/records/partnerships and /records', () => {
  it('labels pairs as inferred, marks unbroken stands and counts unavailable innings in the caption', async () => {
    const { default: Page } = await import('@/app/(frontend)/records/partnerships/page')
    const html = await render(Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('inferred')
    expect(html).toContain('Best at each wicket')
    expect(html).toContain('unbroken')
    expect(html).toMatch(/innings unavailable \(.*retirement.*\)/)
    expect(html).toMatch(/Top 25 overall/)
    expect(html).not.toMatch(/glover/i)
  })

  it('a season filter narrows the records and an unknown season falls back to all', async () => {
    const { default: Page } = await import('@/app/(frontend)/records/partnerships/page')
    const one = await render(Page({ searchParams: Promise.resolve({ season: 'Summer 2024/25' }) }))
    const all = await render(Page({ searchParams: Promise.resolve({ season: 'Nope' }) }))
    expect(one).toMatch(/From \d+ \w+ 2024, \d+ games stored/)
    expect(all).toMatch(/From 12 Oct 2024, 32 games stored/)
  })

  it('the records page has the match-data lists with captions', async () => {
    const { default: Page } = await import('@/app/(frontend)/records/page')
    const html = await render(Page())
    expect(html).toContain('From match data')
    for (const t of ['Most fifties', 'Most hundreds', 'Highest scores', 'Lowest completed innings', 'Best at each wicket']) expect(html).toContain(t)
    expect(html).not.toMatch(/glover/i)
  })
})

describe('/stats leaderboards with match metrics', () => {
  it('ranks fifties with the match caption', async () => {
    const { default: Page } = await import('@/app/(frontend)/stats/page')
    const html = await render(Page({ searchParams: Promise.resolve({ metric: 'fifties' }) }))
    expect(html).toContain('Fifties')
    expect(html).toMatch(/From match data\. From 12 Oct 2024, 32 games stored/)
    expect(html).toContain('Counts recorded innings only')
  })
})

describe('player profile', () => {
  it('shows each match analysis section with its caption, and a hidden partner never appears', async () => {
    const { default: Page } = await import('@/app/(frontend)/players/[slug]/page')
    const slug = slugOf.get('gavin|tolliver')!
    const html = await render(Page({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }))
    expect(html).toContain('Match analysis')
    for (const s of ['Against each opposition', 'How out', 'How wickets came', 'Partnerships', 'Batting position']) expect(html).toContain(s)
    expect(html).toMatch(/dismissals have a recorded type/)
    expect(html).toMatch(/wicket-taking innings reconcile with the scorecard/)
    expect(html).toContain('Positions are as scored')
    expect(html).toMatch(/Partnerships with other club players: \d+, best \d+/)
    expect(html).not.toMatch(/glover/i)
  })

  it('a hidden player has no profile', async () => {
    const { default: Page } = await import('@/app/(frontend)/players/[slug]/page')
    await expect(Page({ params: Promise.resolve({ slug: slugOf.get(MATCH_SEED_HIDDEN_KEY)! }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NOT_FOUND/)
  })
})
