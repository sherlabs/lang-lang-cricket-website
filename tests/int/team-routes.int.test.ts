import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { publishSheets, saveSheet, withdrawSheet } from '@/lib/selector-team-queries'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/lib/selector-auth', async (orig) => ({ ...(await orig<typeof import('@/lib/selector-auth')>()), getSelectionUser: vi.fn(async () => auth.user) }))

/** The lineup picture routes: 200 PNG for a published team with an explicit cache header, one identical 404 for everything else. */
describe('lineup image routes and the public team pages', () => {
  let payload: Payload
  let user: { id: number; role: 'selector'; collection: 'users'; email: string }
  const year = currentSeasonStartYear()
  const u = () => user as never
  const size = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) })

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const row = await payload.create({ collection: 'users', data: { email: 'selector@example.com', password: 'selector-pass-123', role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })
    user = { id: row.id, role: 'selector', collection: 'users', email: row.email }
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    auth.user = null
  })

  async function publishedGame() {
    await makeFixture(payload, { gameId: 'game-img' })
    const squad = await makeSquad(payload, year, 'grade-b', 'B Grade')
    const ids: number[] = []
    for (const n of ['One', 'Two', 'Three']) {
      const p = await makePlayer(payload, n, 'Tester')
      await addToSquad(payload, squad.id, p.id)
      ids.push(p.id)
    }
    await saveSheet(u(), { gameId: 'game-img', expectedRevision: 0, size: 11, markedReady: true, slots: [{ playerId: ids[0], isCaptain: true }, { playerId: ids[1], isKeeper: true }, { guestName: 'Long Surname-Hyphenated O’Connell' }] } as never)
    return ids
  }
  const image = async (gameId: string, qs = '') => {
    const { GET } = await import('@/app/(frontend)/teams/[gameId]/lineup-image/route')
    return GET(new Request(`http://localhost:3000/teams/${gameId}/lineup-image${qs}`), { params: Promise.resolve({ gameId }) })
  }

  it('is a 1200x630 PNG with an explicit cache header for a published team, and downloadable', async () => {
    await publishedGame()
    await publishSheets(u(), { gameIds: ['game-img'], announce: false, acknowledged: true })
    const res = await image('game-img')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
    expect(size(Buffer.from(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 })
    const dl = await image('game-img', '?download=1')
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment; filename=".*b-grade-\d{4}-\d{2}-\d{2}\.png"$/)
  }, 90_000)

  it('draft, withdrawn, unknown and malformed ids all give the same 404', async () => {
    await publishedGame()
    const draft = await image('game-img')
    await publishSheets(u(), { gameIds: ['game-img'], announce: false, acknowledged: true })
    await withdrawSheet(u(), 'game-img')
    const bodies = await Promise.all([draft, await image('game-img'), await image('nope'), await image('..%2Fetc')].map(async (r) => ({ status: r.status, text: await r.text(), cache: r.headers.get('cache-control'), type: r.headers.get('content-type') })))
    for (const b of bodies) expect(b).toEqual(bodies[0])
    expect(bodies[0].status).toBe(404)
  })

  it('the selector preview picture needs a signed-in selector and never caches', async () => {
    await publishedGame()
    const call = async (gameId: string) => {
      const { GET } = await import('@/app/(frontend)/selector/(area)/teams/[gameId]/preview-image/route')
      return GET(new Request(`http://localhost:3000/selector/teams/${gameId}/preview-image`), { params: Promise.resolve({ gameId }) })
    }
    expect((await call('game-img')).status).toBe(404)
    auth.user = user
    const ok = await call('game-img')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('private, no-store')
    expect((await call('nope')).status).toBe(404)
  }, 90_000)

  it('team page metadata carries the lineup picture, and an unpublished game gets no picture', async () => {
    await publishedGame()
    const { generateMetadata } = await import('@/app/(frontend)/teams/[gameId]/page')
    const before = (await generateMetadata({ params: Promise.resolve({ gameId: 'game-img' }) })) as { robots?: unknown; openGraph?: { images?: { url: string }[] } }
    expect(before.openGraph?.images).toBeUndefined()
    expect(before.robots).toEqual({ index: false, follow: false })
    await publishSheets(u(), { gameIds: ['game-img'], announce: false, acknowledged: true })
    const after = (await generateMetadata({ params: Promise.resolve({ gameId: 'game-img' }) })) as { openGraph?: { images?: { url: string; width: number }[] }; twitter?: { images?: string[] } }
    expect(after.openGraph?.images?.[0].url).toMatch(/\/teams\/game-img\/lineup-image\?v=\d+$/)
    expect(after.openGraph?.images?.[0].width).toBe(1200)
    expect(after.twitter?.images?.[0]).toMatch(/lineup-image\?v=\d+$/)
  })

  it('the sitemap lists the published team and not the draft', async () => {
    await publishedGame()
    await makeFixture(payload, { gameId: 'game-draft', gradeId: 'grade-a', gradeName: 'A Grade' })
    await publishSheets(u(), { gameIds: ['game-img'], announce: false, acknowledged: true })
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.some((x) => x.endsWith('/teams'))).toBe(true)
    expect(urls.some((x) => x.endsWith('/teams/game-img'))).toBe(true)
    expect(urls.some((x) => x.endsWith('/teams/game-draft'))).toBe(false)
  })
})
