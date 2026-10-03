import { describe, it, expect, vi, beforeEach } from 'vitest'

const writes: string[] = []
let latestRun: unknown[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/playhq/queries', () => ({
  getSeasonGroups: vi.fn(async () => { throw new Error('PlayHQ 503') }),
  getClubTeams: vi.fn(), getTeamGames: vi.fn(), getGameSummary: vi.fn(), isJuniorGrade: vi.fn(() => false),
}))
vi.mock('@/db', () => {
  const chain = (label: string) => {
    const p: Record<string, unknown> = {}
    const self = new Proxy(p, {
      get(_t, prop) {
        if (prop === 'then') return (res: (v: unknown) => void) => res(label === 'select' ? latestRun : [{ id: 1 }])
        return () => self
      },
    })
    return self
  }
  return {
    db: {
      select: () => chain('select'),
      insert: (t: { [k: symbol]: unknown }) => { writes.push('insert'); return chain('insert') },
      update: () => { writes.push('update'); return chain('update') },
      delete: () => { writes.push('delete'); return chain('delete') },
      batch: async () => { writes.push('batch') },
    },
  }
})

beforeEach(() => { writes.length = 0; latestRun = [] })

describe('isLocked', () => {
  it('locks only on a fresh running row', async () => {
    const { isLocked } = await import('@/lib/players/sync')
    const now = new Date('2026-09-30T10:00:00Z')
    expect(isLocked(undefined, now)).toBe(false)
    expect(isLocked({ status: 'ok', startedAt: new Date('2026-09-30T09:59:00Z') }, now)).toBe(false)
    expect(isLocked({ status: 'running', startedAt: new Date('2026-09-30T09:55:00Z') }, now)).toBe(true)
    expect(isLocked({ status: 'running', startedAt: new Date('2026-09-30T09:40:00Z') }, now)).toBe(false)
  })
})

describe('syncPlayers', () => {
  it('returns locked without writing when a run is in progress', async () => {
    latestRun = [{ status: 'running', startedAt: new Date() }]
    const { syncPlayers } = await import('@/lib/players/sync')
    const r = await syncPlayers()
    expect(r.status).toBe('locked')
    expect(writes).toEqual([])
  })
  it('records an error and never touches players/seasons when PlayHQ fails', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    const r = await syncPlayers()
    expect(r).toMatchObject({ status: 'error', error: 'PlayHQ 503' })
    // only the sync-run row insert + its status update
    expect(writes).toEqual(['insert', 'update'])
  })
})
