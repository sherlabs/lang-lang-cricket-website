import { describe, expect, it } from 'vitest'
import { STATLAB_MAX_SEASONS } from '@/lib/stats/match/limits'
import { assembleFacts, deriveFacts, filterFacts } from '@/lib/stats/match/facts'
import { DEFAULT_MATCH_MINIMUMS } from '@/lib/stats/match/minimums'
import { matchKeeper } from '@/lib/stats/match/filter'
import { getMatchMetric } from '@/lib/stats/match/metrics'
import { buildMatchStatLab } from '@/lib/stats/match-statlab'
import { DEFAULT_COLS, MAX_COLUMNS, isCanonicalRequest, parseStatLabParams, rawFromSearchParams, statLabCsv, statLabHref, statLabMode, type StatLabParams } from '@/lib/stats/statlab'
import { LAB_COLUMNS, LAB_COLUMN_KEYS, getLabColumn, isMatchOnlyColumn } from '@/lib/stats/statlab-columns'
import { METRICS } from '@/lib/stats/metrics'
import { everyone, mkBundle, playerId, type BundleSpec } from './match-facts-helpers'

const known = { seasons: ['Summer 2024/25', 'Summer 2025/26'], grades: ['A Grade'], opps: ['org-rivals', 'org-others', 'n:some-club'] }
const parse = (qs: string) => parseStatLabParams(rawFromSearchParams(new URLSearchParams(qs)), known)

describe('parsing opp and fmt', () => {
  it('defaults to all, and accepts only known keys and formats', () => {
    expect(parse('')).toMatchObject({ opp: 'all', fmt: 'all' })
    expect(parse('opp=org-rivals&fmt=twoDay')).toMatchObject({ opp: 'org-rivals', fmt: 'twoDay' })
    expect(parse('opp=org-unknown&fmt=threeDay')).toMatchObject({ opp: 'all', fmt: 'all' })
    expect(parse(`opp=${'x'.repeat(200)}`).opp).toBe('all')
  })
  it('accepts any well-formed key when the list is not given (saved reports re-check at load)', () => {
    const p = parseStatLabParams({ opp: 'org-new' }, { seasons: [], grades: [] })
    expect(p.opp).toBe('org-new')
    expect(parseStatLabParams({ opp: 'a b;<x>' }, { seasons: [], grades: [] }).opp).toBe('all')
  })
  it('writes them into the canonical href, sorted, defaults omitted', () => {
    const p = parse('fmt=oneDay&opp=org-rivals&cols=runs,fifties')
    expect(statLabHref('/statlab', p)).toBe('/statlab?cols=runs,fifties&fmt=oneDay&opp=org-rivals')
    expect(statLabHref('/statlab', parse('opp=all&fmt=all'))).toBe('/statlab')
  })
})

describe('columns', () => {
  it('has about forty-five columns, unique keys, every classic metric and every match metric', () => {
    expect(LAB_COLUMNS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(LAB_COLUMN_KEYS).size).toBe(LAB_COLUMNS.length)
    for (const m of METRICS) expect(getLabColumn(m.key)?.matchOnly).toBe(false)
    for (const k of ['fifties', 'hundreds', 'ducks', 'goldenDucks', 'fiveFors', 'threeFors', 'runOuts', 'stumpings', 'bowledPct', 'caughtPct', 'lbwPct', 'notOutPct', 'avgPosition', 'bestPartnership', 'partnerships50', 'wins', 'winPct', 'ballsPerBoundary', 'fiftyConversion']) {
      expect(isMatchOnlyColumn(k), k).toBe(true)
    }
  })
  it('gives every match column a rule in plain English', () => {
    for (const c of LAB_COLUMNS.filter((x) => x.matchOnly)) expect(c.help && c.help.length > 20, c.key).toBe(true)
  })
  it('caps the picker at twelve columns and sorts by a column with digits in its key', () => {
    expect(parse(`cols=${LAB_COLUMN_KEYS.join(',')}`).cols).toHaveLength(MAX_COLUMNS)
    expect(parse('cols=runs,partnerships50&sort=partnerships50.asc').sort).toEqual({ key: 'partnerships50', dir: 'asc' })
    expect(parse('cols=ballsPerBoundary').sort).toEqual({ key: 'ballsPerBoundary', dir: 'asc' })
  })
})

describe('mode rule (spec 5.1)', () => {
  it('stays in season mode for classic columns with no opponent or format', () => {
    expect(statLabMode(parse('cols=runs,avg'))).toEqual({ mode: 'season', forcedByColumn: false })
    expect(statLabMode(parse(''))).toEqual({ mode: 'season', forcedByColumn: false })
  })
  it('a match-only column forces match mode and says so', () => {
    expect(statLabMode(parse('cols=runs,fifties'))).toEqual({ mode: 'match', forcedByColumn: true })
  })
  it('an opponent or a format puts the whole table in match mode, not forced by a column', () => {
    expect(statLabMode(parse('cols=runs&opp=org-rivals'))).toEqual({ mode: 'match', forcedByColumn: false })
    expect(statLabMode(parse('cols=runs&fmt=oneDay'))).toEqual({ mode: 'match', forcedByColumn: false })
  })
  it('a minimum on a match-only column also needs match rows', () => {
    expect(statLabMode(parse('cols=runs&min.fifties=1')).mode).toBe('match')
  })
})

const spec = (o: BundleSpec): BundleSpec => o
const set = (...specs: BundleSpec[]) => assembleFacts(specs.map((s, i) => deriveFacts(mkBundle({ id: i + 1, gameId: `g${i + 1}`, ...s }), everyone)!))
const players = new Map(Array.from({ length: 6 }, (_, i) => [101 + i, { name: `Player ${i + 1}`, slug: `p${i + 1}` }]))
const innings = (runs: number) => ({
  seq: 1, clubBatting: true, runs: 200, wickets: 4, hasFow: false,
  bat: [{ who: 'c1', pos: 1, runs, status: 'out' as const, dismissal: 'bowled' as const }, { who: 'c2', pos: 2, runs: 10, status: 'not_out' as const }],
})
const games: BundleSpec[] = [
  spec({ orgId: 'org-rivals', orgName: 'Rivals', date: '2025-10-11', type: 'oneDay', result: 'won', innings: [innings(55)] }),
  spec({ orgId: 'org-rivals', orgName: 'Rivals', date: '2025-10-18', type: 'twoDay', result: 'lost', innings: [innings(30)] }),
  spec({ orgId: 'org-others', orgName: 'Others', date: '2025-10-25', type: 'oneDay', result: 'won', innings: [innings(105)] }),
]
const params = (qs: string): StatLabParams => parse(qs)
const lab = (qs: string, filter: Parameters<typeof matchKeeper>[0] = {}) => {
  const p = params(qs)
  return buildMatchStatLab(p, filterFacts(set(...games), matchKeeper(filter)), { players, minimums: DEFAULT_MATCH_MINIMUMS }, false)
}

describe('match-mode table', () => {
  it('computes classic and match columns from the same rows', () => {
    const r = lab('cols=runs,fifties,hundreds,wins&sort=runs.desc')
    const c1 = r.rows.find((x) => x.playerId === playerId('c1'))!
    expect(c1.counts.batRuns).toBe(190)
    expect(c1.match?.counts).toMatchObject({ fifties: 1, hundreds: 1, wins: 2 })
    expect(r.mode).toBe('match')
    expect(r.rows[0].playerId).toBe(playerId('c1'))
  })

  it('the opponent filter equals a manual sum over that opposition', () => {
    const r = lab('cols=runs,fifties,games', { oppKey: 'org-rivals' })
    const c1 = r.rows.find((x) => x.playerId === playerId('c1'))!
    expect(c1.counts.batRuns).toBe(55 + 30)
    expect(c1.counts.games).toBe(2)
    expect(c1.match?.counts.fifties).toBe(1)
  })

  it('the format filter keeps one format only', () => {
    const r = lab('cols=runs,games', { format: 'twoDay' })
    expect(r.rows.find((x) => x.playerId === playerId('c1'))!.counts.batRuns).toBe(30)
  })

  it('shows a rate below its minimum as a dash and never sorts it above a real value', () => {
    const r = lab('cols=winPct,wins&sort=winPct.desc')
    const row = r.rows[0]
    expect(getLabColumn('winPct')!.format({ counts: row.counts, match: row.match ?? null }, DEFAULT_MATCH_MINIMUMS)).toBe('–')
    expect(getMatchMetric('winPct')!.qualifier).toBe('winGames')
    const loose = buildMatchStatLab(params('cols=winPct&sort=winPct.desc'), set(...games), { players, minimums: { ...DEFAULT_MATCH_MINIMUMS, winGames: 2 } }, false)
    expect(loose.rows[0].match?.counts.wins).toBeGreaterThan(0)
    expect(getLabColumn('winPct')!.format({ counts: loose.rows[0].counts, match: loose.rows[0].match ?? null }, { ...DEFAULT_MATCH_MINIMUMS, winGames: 2 })).toMatch(/^\d/)
  })

  it('applies a minimum on a match column and the season scope', () => {
    expect(lab('cols=runs,fifties&min.fifties=1').rows.map((x) => x.playerId)).toEqual([playerId('c1')])
    const bySeason = lab('cols=runs&scope=season')
    expect(bySeason.rows.every((x) => x.season === 'Summer 2025/26')).toBe(true)
  })

  it('partnership columns are n/a without a derivable stand, never zero', () => {
    const r = lab('cols=bestPartnership,partnerships50')
    const row = r.rows[0]
    expect(getLabColumn('bestPartnership')!.format({ counts: row.counts, match: row.match ?? null }, DEFAULT_MATCH_MINIMUMS)).toBe('–')
    expect(getLabColumn('partnerships50')!.format({ counts: row.counts, match: row.match ?? null }, DEFAULT_MATCH_MINIMUMS)).toBe('–')
  })

  it('the CSV has a Source column in match mode, a header plus data rows only, and neutral cells', () => {
    const p = params('cols=runs,fifties')
    const result = lab('cols=runs,fifties')
    const { csv } = statLabCsv(p, result)
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Player,Seasons,Grades,Runs,Fifties,Source')
    expect(lines.every((l) => !l.startsWith('#'))).toBe(true)
    expect(lines[1].endsWith(',Match data')).toBe(true)
  })

  it('a season-mode CSV has no Source column', () => {
    const p = params('cols=runs')
    expect(statLabCsv(p, { columns: [getLabColumn('runs')!], rows: [], total: 0, mode: 'season', forcedByColumn: false }).csv.split('\r\n')[0]).toBe('Player,Seasons,Grades,Runs')
  })
})

describe('limits', () => {
  it('keeps the season cap at a bounded constant and the default columns classic', () => {
    expect(STATLAB_MAX_SEASONS).toBeGreaterThan(0)
    expect(STATLAB_MAX_SEASONS).toBeLessThanOrEqual(12)
    expect(DEFAULT_COLS.some(isMatchOnlyColumn)).toBe(false)
  })
})

describe('isCanonicalRequest', () => {
  const canon = '/statlab/export?cols=runs,fifties&fmt=oneDay'
  it('accepts the canonical form with raw or percent-encoded commas, so the redirect cannot loop', () => {
    expect(isCanonicalRequest(new URL(`http://x${canon}`), canon)).toBe(true)
    expect(isCanonicalRequest(new URL('http://x/statlab/export?cols=runs%2Cfifties&fmt=oneDay'), canon)).toBe(true)
  })
  it('still redirects a reordered query, extra params or another path', () => {
    expect(isCanonicalRequest(new URL('http://x/statlab/export?fmt=oneDay&cols=runs,fifties'), canon)).toBe(false)
    expect(isCanonicalRequest(new URL('http://x/statlab/export?cols=runs,fifties&fmt=oneDay&utm=1'), canon)).toBe(false)
    expect(isCanonicalRequest(new URL('http://x/statlab/other?cols=runs,fifties&fmt=oneDay'), canon)).toBe(false)
  })
})
