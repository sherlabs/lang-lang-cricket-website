/**
 * notifications.int (W2 spec 6.4, 6.10 step 5): the Home page's attention list, rendered for real. A failed sync run in the
 * test database shows the committee wording to an editor and the counts to an admin.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))

let payload: Payload
beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
  // Other files may leave submissions waiting for approval; this file counts on an empty queue.
  for (const collection of ['stories', 'event-photos'] as const) {
    await payload.delete({ collection, where: { status: { equals: 'pending' } }, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  }
})

async function addRun(values: Record<string, unknown>) {
  const t = playerTables(payload)
  const stamp = new Date().toISOString()
  await payload.db.drizzle.insert(t.player_sync_runs).values({ startedAt: stamp, finishedAt: stamp, playersCreated: 0, seasonRows: 0, createdAt: stamp, updatedAt: stamp, ...values })
}
async function render(isAdmin: boolean) {
  const { NotificationCentre } = await import('@/payload/components/NotificationCentre')
  return renderToStaticMarkup(await NotificationCentre({ payload, isAdmin }))
}

describe('notification centre', () => {
  it('a good update is one plain sentence for the committee', async () => {
    await addRun({ status: 'ok', matchesUpserted: 3 })
    const html = await render(false)
    expect(html).toContain('Player stats were updated last night.')
    expect(html).toContain('You are all caught up.')
    expect(html).not.toContain('Matches saved')
  })

  it('a failed update shows the committee wording to editors and the counts and error to admins', async () => {
    await addRun({ status: 'error', error: 'PlayHQ returned no player data; refusing to wipe seasons', matchError: 2, matchMismatches: 1, matchesUpserted: 5 })
    const editor = await render(false)
    expect(editor).toContain('did not finish')
    expect(editor).toContain('tell the site administrator')
    expect(editor).not.toContain('refusing to wipe')
    expect(editor).not.toContain('You are all caught up.')
    const admin = await render(true)
    expect(admin).toContain('refusing to wipe seasons')
    expect(admin).toContain('Matches saved: 5. Matches that did not save: 2.')
    expect(admin).toContain('/admin/collections/player-sync-runs')
  })

  it('admins see the duplicate count', async () => {
    const t = playerTables(payload)
    const stamp = new Date().toISOString()
    for (const first of ['Jon', 'John']) {
      const [p] = await payload.db.drizzle.insert(t.players).values({ slug: `${first}-smith`, firstName: first, lastName: 'Smith', displayName: `${first} Smith`, source: 'playhq', createdAt: stamp, updatedAt: stamp }).returning({ id: t.players.id })
      await payload.db.drizzle.insert(t.player_seasons).values({ player: p.id, seasonName: 'Summer 2025/26', seasonOrder: 1, teamId: 'T1', teamName: 'T1', gradeName: 'B Grade', games: 3, createdAt: stamp, updatedAt: stamp })
    }
    const html = await render(true)
    expect(html).toContain('possible duplicate player')
    expect(await render(false)).not.toContain('duplicate')
  })
})
