import { describe, it, expect, vi, beforeEach } from 'vitest'

const syncPlayers = vi.fn(async () => ({ status: 'ok', playersCreated: 1, seasonRows: 2 }))
vi.mock('@/lib/players/sync', () => ({ syncPlayers }))

beforeEach(() => { syncPlayers.mockClear(); process.env.CRON_SECRET = 's3cret' })

const req = (auth?: string) => new Request('http://x/api/cron/players-sync', { headers: auth ? { authorization: auth } : {} })

describe('GET /api/cron/players-sync', () => {
  it('401 without or with a wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/players-sync/route')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(syncPlayers).not.toHaveBeenCalled()
  })
  it('401 when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('@/app/api/cron/players-sync/route')
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
  })
  it('runs the sync with the right secret', async () => {
    const { GET } = await import('@/app/api/cron/players-sync/route')
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })
})
