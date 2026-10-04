import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildImportedBundle } from '@/lib/history-import/bundle'
import { IMPORTED_SEASON_ORDER_MIN, importedSeasonOrder, isImportedSeasonOrder } from '@/lib/history-import/constants'
import { parseCsv } from '@/lib/history-import/csv-parse'
import { parseMatchRows } from '@/lib/history-import/match-rows'
import { planMatchRowsImport, planSeasonTotalsImport, seasonSignature, type ImportContext, type KnownPlayer } from '@/lib/history-import/plan'
import { parseSeasonTotals } from '@/lib/history-import/season-totals'
import { currentSeasonOrder, seasonIndex } from '@/lib/stats/season-window'

const fixture = (name: string) => {
  const c = parseCsv(readFileSync(path.resolve(__dirname, 'fixtures/history-import', name), 'utf8'))
  if (!c.ok) throw new Error(c.error)
  return c
}
const alex: KnownPlayer = { id: 1, firstName: 'Alex', lastName: 'Demoson', hidden: false }
const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  playersByKey: new Map([['alex|demoson', alex]]),
  allPlayers: [alex, { id: 2, firstName: 'Samuel', lastName: 'Tester', hidden: true }],
  playhqSeasons: new Set(), playhqGames: new Set(), existingSeasons: new Map(), existingMatches: new Map(), createUnknown: false,
  ...over,
})

describe('season totals plan', () => {
  const parsed = parseSeasonTotals(fixture('season-totals-valid.csv'))

  it('makes unknown names errors with the closest existing players, unless new players are allowed', () => {
    const p = planSeasonTotalsImport(parsed, ctx())
    const unknown = p.rowErrors.find((e) => e.message.includes('Sam Tester'))!
    expect(unknown.message).toContain('Did you mean Samuel Tester')
    expect(unknown.message).toContain('create new players')
    expect(p.ops).toHaveLength(2)
    expect(p.summary).toMatchObject({ create: 2, errors: 1 })
  })

  it('creates unknown players as warnings when allowed', () => {
    const p = planSeasonTotalsImport(parsed, ctx({ createUnknown: true }))
    expect(p.rowErrors).toEqual([])
    expect(p.newPlayers).toEqual([{ nameKey: 'sam|tester', firstName: 'Sam', lastName: 'Tester', rows: [3] }])
    expect(p.warnings).toHaveLength(1)
    expect(p.ops.map((o) => o.action)).toEqual(['create', 'create', 'create'])
    expect(p.ops[0].teamId).toBe('import:2012/13:demo-a-grade')
    expect(p.ops.every((o) => isImportedSeasonOrder(o.seasonOrder))).toBe(true)
  })

  it('re-importing the same file is unchanged, a changed number is an update', () => {
    const first = planSeasonTotalsImport(parsed, ctx({ createUnknown: true }))
    const stored = new Map(first.ops.filter((o) => o.playerId).map((o) => [`${o.playerId}|${o.teamId}`, o.signature]))
    const again = planSeasonTotalsImport(parsed, ctx({ existingSeasons: stored }))
    expect(again.ops.filter((o) => o.playerId).map((o) => o.action)).toEqual(['unchanged', 'unchanged'])
    const key = [...stored.keys()][0]
    const changed = planSeasonTotalsImport(parsed, ctx({ existingSeasons: new Map([...stored, [key, 'something else']]) }))
    expect(changed.ops.filter((o) => o.playerId).map((o) => o.action)).toContain('update')
  })

  it('blocks a season PlayHQ already covers for that player', () => {
    const p = planSeasonTotalsImport(parsed, ctx({ createUnknown: true, playhqSeasons: new Set(['1|2012']) }))
    expect(p.overlaps).toHaveLength(1)
    expect(p.overlaps[0].message).toContain('PlayHQ already has 2012/13')
    expect(p.ops.some((o) => o.row.seasonStartYear === 2012 && o.playerId === 1)).toBe(false)
    expect(p.summary.errors).toBeGreaterThan(0)
  })

  it('signatures are stable and sensitive to the counts', () => {
    const [a] = parsed.rows
    expect(seasonSignature(a)).toBe(seasonSignature({ ...a, counts: { ...a.counts } }))
    expect(seasonSignature(a)).not.toBe(seasonSignature({ ...a, counts: { ...a.counts, batRuns: a.counts.batRuns + 1 } }))
  })
})

describe('match rows plan', () => {
  const parsed = parseMatchRows(fixture('match-rows-valid.csv'), '2026-10-04')

  it('plans four games, with the double-header as two', () => {
    const p = planMatchRowsImport(parsed, ctx({ createUnknown: true }))
    expect(p.rowErrors).toEqual([])
    expect(p.ops).toHaveLength(4)
    expect(p.newPlayers.map((n) => n.nameKey).sort()).toEqual(['jo|newplayer', 'sam|tester'])
    expect(new Set(p.ops.map((o) => o.game.gameId)).size).toBe(4)
  })

  it('reports unchanged when the stored hash matches', () => {
    const first = planMatchRowsImport(parsed, ctx({ createUnknown: true }))
    const stored = new Map(first.ops.map((o) => [o.game.gameId, o.bundle.sourceHash]))
    const again = planMatchRowsImport(parsed, ctx({ createUnknown: true, existingMatches: stored }))
    expect(again.ops.every((o) => o.action === 'unchanged')).toBe(true)
  })

  it('blocks a game PlayHQ already has (same date and opponent)', () => {
    const p = planMatchRowsImport(parsed, ctx({ createUnknown: true, playhqGames: new Set(['2013-02-09|demo rovers']) }))
    expect(p.overlaps).toHaveLength(1)
    expect(p.overlaps[0].message).toContain('PlayHQ already has the game on 2013-02-09')
    expect(p.ops).toHaveLength(3)
  })

  it('the bundle never links an opposition person', () => {
    const p = planMatchRowsImport(parsed, ctx({ createUnknown: true }))
    for (const o of p.ops) expect(buildImportedBundle(o.game).appearances.every((a) => a.isClubSide && a.displayName === null)).toBe(true)
  })
})

describe('imported season ordering', () => {
  it('sits below every PlayHQ season, newest imported year first, and is never current', () => {
    expect(importedSeasonOrder(2012)).toBeGreaterThanOrEqual(IMPORTED_SEASON_ORDER_MIN)
    expect(importedSeasonOrder(2012)).toBeGreaterThan(importedSeasonOrder(2013))
    const rows = [
      { seasonName: '2012/13', seasonOrder: importedSeasonOrder(2012) },
      { seasonName: 'Summer 2024/25', seasonOrder: 2 },
      { seasonName: '2013/14', seasonOrder: importedSeasonOrder(2013) },
    ]
    expect(seasonIndex(rows).map((s) => s.seasonName)).toEqual(['Summer 2024/25', '2013/14', '2012/13'])
    expect(currentSeasonOrder(rows)).toBe(2)
    expect(currentSeasonOrder(rows.filter((r) => r.seasonOrder > 1000))).toBeNull()
  })
})
