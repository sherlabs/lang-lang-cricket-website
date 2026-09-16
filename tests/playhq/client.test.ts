import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { phqFetch, phqFetchAll, mapLimit, PlayHQError } from '@/lib/playhq/client'

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

describe('phqFetch', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    process.env.PLAYHQ_CLIENT_ID = 'key-123'
    process.env.PLAYHQ_TENANT = 'ca'
  })
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset() })

  it('sends api headers and cache options', async () => {
    fetchMock.mockResolvedValue(json({ data: [] }))
    await phqFetch('/v1/x', { revalidate: 60, tags: ['t'] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.playhq.com/v1/x')
    expect(init.headers['x-api-key']).toBe('key-123')
    expect(init.headers['x-phq-tenant']).toBe('ca')
    expect(init.next).toEqual({ revalidate: 60, tags: ['playhq', 't'] })
  })

  it('throws PlayHQError on non-2xx', async () => {
    fetchMock.mockResolvedValue(json({ error: 'nope' }, 404))
    await expect(phqFetch('/v1/missing', { revalidate: 1 })).rejects.toBeInstanceOf(PlayHQError)
  })

  it('phqFetchAll follows nextCursor', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: [1, 2], metadata: { hasMore: true, nextCursor: 'MTAw' } }))
      .mockResolvedValueOnce(json({ data: [3], metadata: { hasMore: false, nextCursor: null } }))
    const all = await phqFetchAll<number>('/v1/seasons/s/teams', { revalidate: 1 })
    expect(all).toEqual([1, 2, 3])
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.playhq.com/v1/seasons/s/teams?cursor=MTAw')
  })
})

describe('mapLimit', () => {
  it('runs at most `limit` concurrently and preserves order', async () => {
    let active = 0, peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--; return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })
})
