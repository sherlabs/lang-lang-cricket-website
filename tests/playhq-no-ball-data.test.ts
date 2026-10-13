/**
 * Close-out guard for issue #35 (innings phases). The stored PlayHQ fixtures carry no over, ball,
 * delivery, time or shot field, so powerplay/middle/death phases, wagon wheels, strike rotation
 * and dot-ball analysis cannot be derived honestly and are not built. This test fails if a stored
 * fixture ever gains such a key, which is the signal to reopen the work package. It guards the
 * fixtures only: it cannot see a change in the live PlayHQ response (that needs a refreshed fixture).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.resolve(__dirname, 'fixtures', 'playhq')
const summaries = readdirSync(dir).filter((f) => f.startsWith('game-summary-') && f.endsWith('.json'))

/** Every key in the response that would point at delivery-level data. */
const DELIVERY_KEY = /^(overs?|overNo|overNumber|ballNo|ballNumber|balls?|deliver(y|ies)|shots?|wagon|fieldPosition|timestamp|minute|minutes|powerplay|phase|strike(r|Rate)?)$/i

/** Innings-level statistic types that exist today (whole-innings totals, never a delivery record). */
const KNOWN_INNINGS_TYPES = new Set([
  'TOTALS', 'TOTAL_SCORE', 'TOTAL_OVERS', 'TOTAL_OUTS', 'TOTAL_EXTRAS', 'EXTRA_LEG_BYES', 'EXTRA_WIDES',
  'EXTRA_BYES', 'EXTRA_NO_BALLS', 'EXTRA_PENALTY_RUNS', 'OVER_LIMIT',
])

function collectKeys(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) node.forEach((n) => collectKeys(n, out))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.add(k)
      collectKeys(v, out)
    }
  }
}

describe('stored PlayHQ game summaries have no ball or over data', () => {
  it('finds the fixtures', () => {
    expect(summaries.length).toBeGreaterThanOrEqual(6)
  })

  describe.each(summaries)('%s', (file) => {
    const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))

    it('has no over, ball, delivery, time or shot key', () => {
      const keys = new Set<string>()
      collectKeys(json, keys)
      expect([...keys].filter((k) => DELIVERY_KEY.test(k))).toEqual([])
    })

    it('fall of wickets has only sequence, appearance and runs', () => {
      const fows: Array<Record<string, unknown>> = []
      const walk = (n: unknown) => {
        if (Array.isArray(n)) n.forEach(walk)
        else if (n && typeof n === 'object') {
          for (const [k, v] of Object.entries(n)) {
            if (k === 'fallOfWickets' && Array.isArray(v)) fows.push(...(v as Array<Record<string, unknown>>))
            else walk(v)
          }
        }
      }
      walk(json)
      for (const f of fows) expect(Object.keys(f).sort()).toEqual(['appearanceId', 'runs', 'sequenceNo'])
    })

    it('innings-level statistic types are the known totals', () => {
      const data = json.data ?? json
      const types = new Set<string>()
      for (const p of data.periods ?? []) {
        for (const t of p.teams ?? []) for (const s of t.statistics ?? []) types.add(s.type)
      }
      expect([...types].filter((t) => !KNOWN_INNINGS_TYPES.has(t))).toEqual([])
    })
  })
})
