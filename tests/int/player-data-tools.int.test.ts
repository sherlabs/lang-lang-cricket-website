/**
 * player-data-tools.int (W2 spec 6.1, 6.2): the admin view refuses everyone but an admin, and for an admin lists the ranked
 * duplicate pair (and not the same-game pair), the recent merge and the import log.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyImport } from '@/lib/history-import/server'
import { mergePlayerInto } from '@/lib/players/merge-core'
import { playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))
// The real AdminPage wraps the view in Payload's template (needs a full request); the view's own output is what is under test.
vi.mock('@/payload/components/AdminPage', () => ({ AdminPage: ({ children }: { children: unknown }) => children, requireUser: () => undefined }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@payloadcms/ui', () => ({ SetStepNav: () => null, Button: () => null, toast: {} }))

let payload: Payload
beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
})

const stamp = () => new Date().toISOString()
const view = (user: unknown) => ({ initPageResult: { req: { user, payload } } }) as never

async function person(first: string, last: string) {
  const t = playerTables(payload)
  const [p] = await payload.db.drizzle.insert(t.players).values({ slug: `${first}-${last}`.toLowerCase(), firstName: first, lastName: last, displayName: `${first} ${last}`, source: 'playhq', createdAt: stamp(), updatedAt: stamp() }).returning({ id: t.players.id })
  await payload.db.drizzle.insert(t.player_aliases).values({ nameKey: `${first}|${last}`.toLowerCase(), player: p.id, createdAt: stamp(), updatedAt: stamp() })
  await payload.db.drizzle.insert(t.player_seasons).values({ player: p.id, seasonName: 'Summer 2025/26', seasonOrder: 1, teamId: 'T', teamName: 'T', gradeName: 'B Grade', games: 4, createdAt: stamp(), updatedAt: stamp() })
  return p.id as number
}

describe('Player data tools view', () => {
  it('shows an editor nothing but a refusal', async () => {
    const { PlayerDataToolsView } = await import('@/payload/components/PlayerDataToolsView')
    const html = renderToStaticMarkup((await PlayerDataToolsView(view({ id: 2, role: 'editor' }))) as never)
    expect(html).toContain('Only the person who looks after the site')
    expect(html).not.toContain('Duplicate players')
  })

  it('shows an admin the ranked pair, the recent merge and the import log', async () => {
    await person('Jon', 'Sample'); await person('John', 'Sample')
    const src = await person('Sammy', 'Mergeable'); const dst = await person('Sam', 'Mergeable')
    expect((await mergePlayerInto(payload, { sourceId: src, targetId: dst, userId: null })).ok).toBe(true)
    await applyImport(payload, 'season-totals', 'season,team,first_name,last_name,games\n2012/13,Demo A,Imp,Orted,5\n', { createUnknown: true })
    const { PlayerDataToolsView } = await import('@/payload/components/PlayerDataToolsView')
    const html = renderToStaticMarkup((await PlayerDataToolsView(view({ id: 1, role: 'admin' }))) as never)
    expect(html).toContain('Duplicate players')
    expect(html).toContain('Jon Sample')
    expect(html).toContain('First names differ by one letter')
    expect(html).toContain('Sammy Mergeable')
    expect(html).toContain('Recent merges')
    expect(html).toContain('Imports on the site')
  })
})
