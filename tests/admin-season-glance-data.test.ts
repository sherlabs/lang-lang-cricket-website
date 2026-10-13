import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/stats/label-queries', () => ({ getLabelMap: async () => ({}) }))
vi.mock('@/lib/stats/queries', () => ({ getLastSyncAt: async () => null }))

import { loadSeasonGlance } from '@/payload/components/seasonGlanceData'

type Row = { gameId: string; status: string; seasonStartYear: number | null }

/** A tiny stand-in that, like Postgres `ORDER BY ... DESC`, puts NULL first unless the query excludes it. */
function fakePayload(rows: Row[]) {
  const wheres: unknown[] = []
  const requiresSeason = (w: unknown): boolean => JSON.stringify(w).includes('"seasonStartYear":{"exists":true}')
  return {
    wheres,
    payload: {
      find: async (args: { collection: string; where?: unknown; limit?: number }) => {
        wheres.push(args.where)
        if (args.collection !== 'matches') return { docs: [] }
        let docs = rows.filter((r) => r.status === 'FINAL')
        if (requiresSeason(args.where)) docs = docs.filter((r) => r.seasonStartYear !== null)
        docs = [...docs].sort((a, b) => (b.seasonStartYear === null ? 1 : 0) - (a.seasonStartYear === null ? 1 : 0))
        return { docs: args.limit === 1 ? docs.slice(0, 1) : docs }
      },
      findGlobal: async () => null,
    },
  }
}

describe('loadSeasonGlance season pick', () => {
  it('ignores FINAL matches with no season when choosing the newest season', async () => {
    const f = fakePayload([
      { gameId: 'demo-match-1', status: 'FINAL', seasonStartYear: null },
      { gameId: 'g1', status: 'FINAL', seasonStartYear: 2026 },
    ])
    await loadSeasonGlance(f.payload as never)
    // The second query only runs when a numeric season was found: the null-season row did not win.
    expect(JSON.stringify(f.wheres[1])).toContain('"seasonStartYear":{"equals":2026}')
  })
})
