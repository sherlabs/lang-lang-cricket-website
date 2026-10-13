/**
 * insights-cache.int (wave E, WP-3, spec 5.2): the "build, hide, re-read" requirement with a real tag cache. `unstable_cache` is
 * replaced by a small keyed store that honours tags and `revalidateTag`, so a hide through Payload (hooks on) must expire the
 * stored facts before the player page and the trends list are read again. The other insights int file bypasses the cache.
 */
import { eq } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { matchTables } from '@/lib/match-store/db'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('@/components/stats/stats-sub-nav', () => ({ StatsSubNav: () => null }))
const store = vi.hoisted(() => ({ entries: new Map<string, { value: unknown; tags: string[] }>(), builds: 0 }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: (tag: string) => {
    for (const [k, e] of store.entries) if (e.tags.includes(tag)) store.entries.delete(k)
  },
  unstable_cache: <T,>(fn: () => Promise<T>, keyParts: string[] = [], opts: { tags?: string[] } = {}) => async () => {
    const key = keyParts.join('|')
    const hit = store.entries.get(key)
    if (hit) return hit.value as T
    store.builds++
    const value = await fn()
    store.entries.set(key, { value, tags: opts.tags ?? [] })
    return value
  },
}))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let slug: string
let playerId: number
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK|NOT_FOUND/

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const render = async (node: unknown) => text(renderToStaticMarkup(await (node as Promise<React.ReactElement>)))
const trends = async () => render((await import('@/app/(frontend)/stats/insights/trends/page')).default({ searchParams: Promise.resolve({}) }))
const player = async () => render((await import('@/app/(frontend)/stats/insights/players/[slug]/page')).default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }))

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const t = matchTables(payload)
  const [row] = await payload.db.drizzle
    .select({ id: t.players.id, slug: t.players.slug })
    .from(t.players)
    .innerJoin(t.player_aliases, eq(t.player_aliases.player, t.players.id))
    .where(eq(t.player_aliases.nameKey, 'gavin|tolliver'))
  slug = row.slug
  playerId = row.id
}, 180_000)
afterAll(async () => {
  await payload.update({ collection: 'players', id: playerId, data: { hidden: false }, overrideAccess: true })
  await resetMatches(payload)
  await resetGlobal(payload, 'site-settings')
  await destroyTestPayload(payload)
})

describe('hide after the cache was built', () => {
  it('serves the page and the list from the cache, then a hide through Payload removes both', async () => {
    expect(await player()).toContain('Runs in each innings')
    expect(await trends()).toContain('Gavin Tolliver')
    const built = store.builds
    expect(store.entries.size).toBeGreaterThan(0)
    // Warm: a second read builds nothing, so the next two assertions really are about expiry, not a fresh build.
    await player()
    await trends()
    expect(store.builds).toBe(built)

    await payload.update({ collection: 'players', id: playerId, data: { hidden: true }, overrideAccess: true })
    await expect(player()).rejects.toThrow(NOT_FOUND)
    const list = await trends()
    expect(list).not.toContain('Gavin Tolliver')
    expect(store.builds).toBeGreaterThan(built)

    await payload.update({ collection: 'players', id: playerId, data: { hidden: false }, overrideAccess: true })
    expect(await player()).toContain('Runs in each innings')
    expect(await trends()).toContain('Gavin Tolliver')
  })
})
