/**
 * home-dashboard.int (wave G WP-3): the Home page rendered for real, for an administrator and an editor, on an empty database and
 * with a failed update, a finished game and an upcoming game stored.
 */
import type { Payload } from 'payload'
import { prerender } from 'react-dom/static'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload, wipeTestData } from './helpers'
import { resetPlayers } from './players-helpers'

// Client buttons need the Next app router, which does not exist in a unit render; the server parts around them are what is tested.
vi.mock('@/payload/components/PlayHQRefreshButton', () => ({ PlayHQRefreshButton: () => null }))
vi.mock('@/payload/components/PlayerSyncPanel', () => ({ PlayerSyncPanel: () => null }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))

let payload: Payload
beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await wipeTestData(payload)
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
  for (const collection of ['stories', 'event-photos'] as const) {
    await payload.delete({ collection, where: { status: { equals: 'pending' } }, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  }
  for (const collection of ['matches', 'selection-fixtures'] as const) {
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  }
})

async function html(role: 'admin' | 'editor'): Promise<string> {
  const { Dashboard } = await import('@/payload/components/Dashboard')
  const tree = await Dashboard({ payload, user: { role, name: 'Alex Smith', email: 'alex@example.com' } })
  const { prelude } = await prerender(tree)
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '')
}

async function addRun(values: Record<string, unknown>) {
  const t = playerTables(payload)
  const stamp = new Date().toISOString()
  await payload.db.drizzle.insert(t.player_sync_runs).values({ startedAt: stamp, finishedAt: stamp, playersCreated: 0, seasonRows: 0, createdAt: stamp, updatedAt: stamp, ...values })
}

describe('Home dashboard', () => {
  it('renders for an administrator on an empty database: one h1, quick actions, no attention box, System health inside Advanced', async () => {
    const out = await html('admin')
    expect(out.match(/<h1/g)).toHaveLength(1)
    expect(out).toContain('Hello, Alex')
    expect(out).toContain("You&#x27;re all caught up.")
    expect(out).not.toContain('Needs your attention')
    expect(out).toContain('Quick actions')
    expect(out).toContain('Make a social post')
    expect(out).not.toContain('Season at a glance')
    expect(out).toContain('Advanced (site administrators)')
    expect(out).toContain('id="system-health"')
  })

  it('renders for an editor without the Advanced area', async () => {
    const out = await html('editor')
    expect(out).toContain('Hello, Alex')
    expect(out).toContain('Quick actions')
    expect(out).not.toContain('Advanced (site administrators)')
    expect(out).not.toContain('System health')
  })

  it('a failed update is a plain row: a button for the administrator, none for the editor, counts only under System health', async () => {
    await addRun({ status: 'error', error: 'PlayHQ returned no player data', matchError: 2, matchMismatches: 1, matchesUpserted: 5 })
    const admin = await html('admin')
    expect(admin).toContain('Needs your attention')
    expect(admin).toContain('One thing is waiting for you.')
    expect(admin).toContain('Open System health')
    expect(admin.indexOf('Matches saved: 5')).toBeGreaterThan(admin.indexOf('id="system-health"'))
    const editor = await html('editor')
    expect(editor).toContain('Needs your attention')
    expect(editor).not.toContain('Open System health')
    expect(editor).not.toContain('Matches saved')
    expect(editor).not.toContain('PlayHQ returned no player data')
  })

  it('shows Season at a glance from stored games, and leaves it out when the stored data is old', async () => {
    const recent = new Date()
    const stamp = recent.toISOString()
    const day = (back: number) => new Date(recent.getTime() - back * 86_400_000).toISOString().slice(0, 10)
    const year = recent.getUTCMonth() >= 8 ? recent.getUTCFullYear() : recent.getUTCFullYear() - 1
    const game = (n: number, back: number, result: string) => payload.create({
      collection: 'matches', overrideAccess: true, context: { disableRevalidate: true },
      data: { gameId: `home-int-${n}`, status: 'FINAL', seasonStartYear: year, gradeName: 'A Grade', clubTeamName: 'Seniors', opponentName: `Opponents ${n}`, localDate: day(back), result, syncedAt: stamp } as never,
    })
    await game(1, 14, 'won')
    await game(2, 7, 'lost')
    await payload.create({
      collection: 'selection-fixtures', overrideAccess: true, context: { disableRevalidate: true },
      data: { gameId: 'home-int-next', gradeId: 'g1', gradeName: 'A Grade', clubTeamId: 't1', clubTeamName: 'Seniors', localDate: new Date(recent.getTime() + 5 * 86_400_000).toISOString().slice(0, 10), opponentName: 'Hillcrest', status: 'upcoming', isHome: true } as never,
    })
    await addRun({ status: 'ok', finishedAt: stamp })
    const out = await html('editor')
    expect(out).toContain('Season at a glance')
    expect(out).toContain('Played 2, won 1, lost 1')
    expect(out).toContain('Hillcrest')
    expect(out).toMatch(/As of \d/)
    // The same data, but the last successful update was a month ago and the matches were written then too.
    const old = new Date(recent.getTime() - 40 * 86_400_000).toISOString()
    await payload.db.drizzle.execute(`DELETE FROM payload.player_sync_runs`).catch(() => undefined)
    await payload.update({ collection: 'matches', where: { gameId: { like: 'home-int-' } }, data: { syncedAt: old } as never, overrideAccess: true, context: { disableRevalidate: true } })
    await addRun({ status: 'ok', finishedAt: old, startedAt: old })
    expect(await html('editor')).not.toContain('Season at a glance')
  })
})
