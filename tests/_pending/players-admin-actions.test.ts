import { describe, it, expect, vi, beforeEach } from 'vitest'

let authed = true
let updated: Record<string, unknown> | null = null
let selectRows: unknown[] = []

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/auth', () => ({ COOKIE_NAME: 'llcc_admin_session', verifySessionCookie: async () => authed }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/players/sync', () => ({
  syncPlayers: vi.fn(async () => ({ status: 'ok', playersCreated: 0, seasonRows: 0 })),
  latestSyncRun: vi.fn(),
  revalidatePlayerPages: vi.fn(),
}))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectRows }) }) }),
    update: () => ({ set: (v: Record<string, unknown>) => { updated = v; return { where: async () => undefined } } }),
    delete: () => ({ where: async () => undefined }),
    insert: () => ({ values: async () => undefined }),
    batch: async () => undefined,
  },
}))

beforeEach(() => { authed = true; updated = null; selectRows = [] })

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('players admin actions', () => {
  it('reject unauthenticated callers', async () => {
    authed = false
    const a = await import('@/app/admin/(shell)/players/actions')
    await expect(a.updatePlayer(fd({ id: '1', firstName: 'Jo', lastName: 'Smith' }))).rejects.toThrow('Unauthorized')
    await expect(a.mergePlayers(1, 2)).rejects.toThrow('Unauthorized')
    await expect(a.runPlayerSync({ result: null }, new FormData())).rejects.toThrow('Unauthorized')
    await expect(a.deleteManualPlayer(1)).rejects.toThrow('Unauthorized')
    await expect(a.saveHonours(1, [])).rejects.toThrow('Unauthorized')
    await expect(a.createManualPlayer(fd({ firstName: 'Jo' }))).rejects.toThrow('Unauthorized')
  })
  it('updatePlayer maps auto override to null, trims, and requires a first name', async () => {
    const { updatePlayer } = await import('@/app/admin/(shell)/players/actions')
    await updatePlayer(fd({ id: '1', firstName: ' Jo ', lastName: 'Smith', bio: ' hi ', photoUrl: '', manualYears: '', activeOverride: 'auto' }))
    expect(updated).toMatchObject({ firstName: 'Jo', lastName: 'Smith', bio: 'hi', activeOverride: null, hidden: false })
    await expect(updatePlayer(fd({ id: '1', firstName: ' ', lastName: 'x' }))).rejects.toThrow('First name is required.')
  })
  it('refuses to merge a player into itself', async () => {
    const { mergePlayers } = await import('@/app/admin/(shell)/players/actions')
    await expect(mergePlayers(3, 3)).rejects.toThrow('Pick a different player')
  })
  it('refuses to delete a PlayHQ player', async () => {
    selectRows = [{ id: 1, source: 'playhq' }]
    const { deleteManualPlayer } = await import('@/app/admin/(shell)/players/actions')
    await expect(deleteManualPlayer(1)).rejects.toThrow('Only manually added players can be deleted.')
  })
})
