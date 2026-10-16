import { describe, expect, it } from 'vitest'
import { unknownFilters, droppedColumns, MAX_QUERY_LENGTH, canonicaliseReport, savedReportHref } from '@/lib/stats/saved-reports'

describe('canonicaliseReport (W2 spec 5.3)', () => {
  it('returns the canonical form: sorted keys, defaults omitted, no leading question mark', () => {
    const r = canonicaliseReport('?sort=fifties.desc&cols=fifties,runs&min.fifties=1&scope=career')
    expect(r).toEqual({ ok: true, query: 'cols=fifties,runs&min.fifties=1' })
  })

  it('accepts a pasted address and drops unknown params and columns', () => {
    const r = canonicaliseReport('/statlab?cols=runs,notAColumn,avg&utm_source=x&evil=%3Cscript%3E')
    expect(r).toEqual({ ok: true, query: 'cols=runs,avg' })
  })

  it('keeps an opposition and a format filter', () => {
    const r = canonicaliseReport('cols=runs,fifties&opp=abc-123&fmt=oneDay')
    expect(r).toEqual({ ok: true, query: 'cols=runs,fifties&fmt=oneDay&opp=abc-123' })
  })

  it('is stable: canonical output canonicalises to itself', () => {
    const first = canonicaliseReport('fmt=twoDay&cols=wins,winPct&sort=winPct.desc&min.wins=2')
    expect(first.ok).toBe(true)
    if (first.ok) expect(canonicaliseReport(first.query)).toEqual(first)
  })

  it('rejects a column list with no known column', () => {
    expect(canonicaliseReport('cols=nope,alsoNope').ok).toBe(false)
  })

  it.each(['', '   ', 'hello world', '{"cols":["runs"]}', '<script>alert(1)</script>', 'cols', 'x'.repeat(MAX_QUERY_LENGTH + 1)])('rejects %j as not a query string', (s) => {
    expect(canonicaliseReport(s).ok).toBe(false)
  })

  it('rejects a report that is just the defaults, with a reason', () => {
    const r = canonicaliseReport('scope=career')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Nothing to save/)
  })
})

describe('droppedColumns', () => {
  it('lists columns that no longer exist', () => {
    expect(droppedColumns('cols=runs,gone,avg,alsoGone')).toEqual(['gone', 'alsoGone'])
    expect(droppedColumns('cols=runs')).toEqual([])
  })
  it('builds the share link from the query', () => {
    expect(savedReportHref('cols=runs')).toBe('/statlab?cols=runs')
  })
})

describe('unknownFilters', () => {
  const known = { seasons: ['2025/26'], grades: ['A Grade'], opps: ['o1'] }
  it('reports values outside the real lists and accepts real ones', () => {
    expect(unknownFilters('cols=runs&opp=zzz&season=1999&grade=Nope', known)).toEqual(['season "1999"', 'grade "Nope"', 'opposition "zzz"'])
    expect(unknownFilters('cols=runs&opp=o1&season=2025/26&grade=A%20Grade', known)).toEqual([])
  })
})
