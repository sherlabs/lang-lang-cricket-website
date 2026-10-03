import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PLANTED } from '@/payload/scripts/fixtures/stats-seed-data'
import { seedStats } from '@/payload/scripts/fixtures/stats-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetPlayers } from './players-helpers'

// Spec section 6: the card route against the seeded langlang_test DB.
describe('GET /api/public/players/[slug]/card', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetGlobal(payload, 'site-settings')
    await resetPlayers(payload)
    await seedStats(payload)
  }, 180_000)

  afterAll(async () => {
    await resetPlayers(payload)
    await resetGlobal(payload, 'site-settings')
    await destroyTestPayload(payload)
  })

  const call = async (slug: string, qs = '') => {
    const { GET } = await import('@/app/api/public/players/[slug]/card/route')
    return GET(new Request(`http://localhost:3000/api/public/players/${slug}/card${qs}`), { params: Promise.resolve({ slug }) })
  }
  /** PNG IHDR: width and height are big-endian u32 at byte offsets 16 and 20. */
  const size = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) })

  it('returns an OG-sized PNG with the long cache header', async () => {
    const res = await call(PLANTED.careerLeader.slug)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(size(Buffer.from(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 })
  }, 60_000)

  it('?format=square is a different size', async () => {
    const res = await call(PLANTED.careerLeader.slug, '?format=square')
    expect(res.status).toBe(200)
    expect(size(Buffer.from(await res.arrayBuffer()))).toEqual({ width: 1080, height: 1080 })
  }, 60_000)

  it('ignores an unknown format and an unknown season', async () => {
    const res = await call(PLANTED.careerLeader.slug, '?format=giant&season=Summer%201999%2F00')
    expect(res.status).toBe(200)
    expect(size(Buffer.from(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 })
  }, 60_000)

  it('accepts a known season', async () => {
    const res = await call(PLANTED.careerLeader.slug, '?season=Summer%202025%2F26')
    expect(res.status).toBe(200)
  }, 60_000)

  it('404s a hidden player with a short cache, same as an unknown player', async () => {
    for (const slug of [PLANTED.hidden[0], 'nobody-by-that-name', 'Not%20A%20Slug']) {
      const res = await call(slug)
      expect(res.status).toBe(404)
      expect(res.headers.get('cache-control')).toBe('public, s-maxage=60')
      expect(res.headers.get('content-type')).not.toMatch(/image/)
    }
  })
})
