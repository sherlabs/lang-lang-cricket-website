import { describe, expect, it } from 'vitest'
import { METRIC_KEYS, getMetric } from '@/lib/stats/metrics'
import { DEFAULT_COLS, MAX_COLUMNS, MAX_MIN, buildStatLab, metricCell, parseStatLabParams, rawFromSearchParams, statLabCsv, statLabHref, type StatLabParams } from '@/lib/stats/statlab'
import { row } from './stats-helpers'

const known = { seasons: ['Summer 2024/25', 'Summer 2025/26'], grades: ['A Grade', 'B Grade'] }
const parse = (qs: string) => parseStatLabParams(rawFromSearchParams(new URLSearchParams(qs)), known)

describe('parseStatLabParams', () => {
  it('defaults on empty input', () => {
    const p = parse('')
    expect(p).toMatchObject({ scope: 'career', season: 'all', grade: 'all', cats: null, juniors: false, q: '', maxSeasons: null, active: false, mins: {} })
    expect(p.cols).toEqual([...DEFAULT_COLS])
    expect(p.sort).toEqual({ key: 'games', dir: 'desc' })
  })

  it('falls back safely on garbage, unknown keys and unknown values', () => {
    const p = parse('scope=nope&season=Summer%201999/00&grade=Z&cols=zzz,,;;&sort=evil.sideways&min.zzz=5&min.runs=abc&maxseasons=-3&x=1&cat=wat')
    expect(p.scope).toBe('career')
    expect(p.season).toBe('all')
    expect(p.grade).toBe('all')
    expect(p.cols).toEqual([...DEFAULT_COLS])
    expect(p.sort.key).toBe(DEFAULT_COLS[0])
    expect(p.mins).toEqual({})
    expect(p.maxSeasons).toBeNull()
    expect(p.cats).toBeNull()
  })

  it('caps columns at 12, drops duplicates and unknown keys, accepts repeated keys', () => {
    const all = METRIC_KEYS.join(',')
    expect(parse(`cols=${all}`).cols).toHaveLength(MAX_COLUMNS)
    expect(parse('cols=runs,runs,avg,nope').cols).toEqual(['runs', 'avg'])
    expect(parse('cols=runs&cols=wickets').cols).toEqual(['runs', 'wickets'])
  })

  it('clamps minimums and ignores zero or negative', () => {
    expect(parse('min.runs=99999999999').mins).toEqual({ runs: MAX_MIN })
    expect(parse('min.runs=0&min.games=-4').mins).toEqual({})
    expect(parse('min.runs=150&min.wickets=10').mins).toEqual({ runs: 150, wickets: 10 })
  })

  it('only sorts by a displayed column or name', () => {
    expect(parse('cols=runs,wickets&sort=wickets.asc').sort).toEqual({ key: 'wickets', dir: 'asc' })
    expect(parse('cols=runs,wickets&sort=name.asc').sort).toEqual({ key: 'name', dir: 'asc' })
    expect(parse('cols=runs,wickets&sort=catches.desc').sort).toEqual({ key: 'runs', dir: 'desc' })
    expect(parse('cols=econ').sort).toEqual({ key: 'econ', dir: 'asc' })
  })

  it('treats player-season as the team-season scope', () => {
    expect(parse('scope=player-season').scope).toBe('team-season')
    expect(parse('scope=season').scope).toBe('season')
  })

  it('round-trips through a canonical, key-sorted href', () => {
    const p = parse('sort=avg.desc&cols=innings,runs,avg&min.runs=300&min.innings=8&scope=season&season=Summer%202025/26&grade=A%20Grade&q=smith&maxseasons=3&active=1&juniors=1&cat=senior,womens')
    const href = statLabHref('/statlab', p)
    expect(href).toBe('/statlab?active=1&cat=senior%2Cwomens&cols=innings,runs,avg&grade=A+Grade&juniors=1&maxseasons=3&min.innings=8&min.runs=300&q=smith&scope=season&season=Summer+2025%2F26&sort=avg.desc'.replace('senior%2Cwomens', 'senior,womens'))
    const again = parseStatLabParams(rawFromSearchParams(new URL(href, 'http://x').searchParams), known)
    expect(again).toEqual(p)
    expect(statLabHref('/statlab', again)).toBe(href)
  })

  it('omits defaults from the href', () => {
    expect(statLabHref('/statlab', parse(''))).toBe('/statlab')
  })
})

const players = new Map([
  [1, { name: 'Ann Able', slug: 'ann-able' }],
  [2, { name: '=Evil Name', slug: 'evil-name' }],
  [3, { name: 'Cy Cee', slug: 'cy-cee' }],
])
const rows = [
  row({ playerId: 1, seasonName: 'Summer 2024/25', seasonOrder: 1, teamId: 'a', counts: { games: 10, batInnings: 10, batRuns: 300, batBalls: 400, batNotOuts: 2, batHighScore: 80 } }),
  row({ playerId: 1, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 'b', teamName: 'Lang Lang A Grade', counts: { games: 12, batInnings: 11, batRuns: 450, batBalls: 500, batNotOuts: 1, batHighScore: 120, bowlBalls: 60, bowlRuns: 40, bowlWickets: 3 } }),
  row({ playerId: 1, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 'c', teamName: 'Lang Lang B Grade', gradeName: 'B Grade', counts: { games: 2, batInnings: 2, batRuns: 20, batBalls: 30 } }),
  row({ playerId: 2, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 'd', counts: { games: 5, batInnings: 5, batRuns: 100, batBalls: 90 } }),
  row({ playerId: 3, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 'e', counts: { games: 0 } }),
]
const ctx = { rows, players, cats: ['senior' as const], rules: [] }
const p = (qs: string): StatLabParams => parse(qs)

describe('buildStatLab', () => {
  it('career scope merges seasons and teams, sorted by the first column desc', () => {
    const r = buildStatLab(p('cols=runs,games'), ctx)
    expect(r.rows.map((x) => [x.name, x.counts.batRuns, x.seasons])).toEqual([['Ann Able', 770, 2], ['=Evil Name', 100, 1]])
    expect(r.total).toBe(2)
  })

  it('drops players who did not play, even with no thresholds', () => {
    expect(buildStatLab(p(''), ctx).rows.map((x) => x.playerId)).not.toContain(3)
  })

  it('season scope merges teams within a season; team-season keeps each row', () => {
    expect(buildStatLab(p('scope=season&cols=runs'), ctx).rows.filter((x) => x.playerId === 1).map((x) => [x.season, x.counts.batRuns])).toEqual([['Summer 2025/26', 470], ['Summer 2024/25', 300]])
    expect(buildStatLab(p('scope=team-season&cols=runs'), ctx).rows.filter((x) => x.playerId === 1)).toHaveLength(3)
  })

  it('applies minimums, name search, season and grade filters, and the seasons cap', () => {
    expect(buildStatLab(p('cols=runs&min.runs=200'), ctx).rows.map((x) => x.playerId)).toEqual([1])
    expect(buildStatLab(p('cols=runs&q=evil'), ctx).rows.map((x) => x.playerId)).toEqual([2])
    expect(buildStatLab(p('cols=runs&season=Summer%202024/25'), ctx).rows[0].counts.batRuns).toBe(300)
    expect(buildStatLab(p('cols=runs&grade=B%20Grade'), ctx).rows[0].counts.batRuns).toBe(20)
    expect(buildStatLab(p('cols=runs&maxseasons=1'), ctx).rows.map((x) => x.playerId)).toEqual([2])
  })

  it('active=1 keeps only the given ids', () => {
    expect(buildStatLab(p('cols=runs&active=1'), { ...ctx, activeIds: new Set([2]) }).rows.map((x) => x.playerId)).toEqual([2])
  })

  it('puts a null metric last whichever way it sorts', () => {
    const r = buildStatLab(p('cols=wickets,bowlAvg&sort=bowlAvg.asc'), ctx)
    expect(r.rows[0].playerId).toBe(1)
    expect(buildStatLab(p('cols=bowlAvg&sort=bowlAvg.desc'), ctx).rows[0].playerId).toBe(1)
  })

  it('excludes rows whose player is not in the visible list', () => {
    const r = buildStatLab(p('cols=runs'), { ...ctx, players: new Map([[1, players.get(1)!]]) })
    expect(r.rows.map((x) => x.playerId)).toEqual([1])
  })
})

describe('statLabCsv', () => {
  it('writes the header, numeric cells and a neutralised formula name', () => {
    const params = p('cols=runs,hs,avg&sort=name.asc')
    const { csv, truncated } = statLabCsv(params, buildStatLab(params, ctx))
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Player,Seasons,Grades,Runs,High score,Batting average')
    expect(lines[1]).toBe("'=Evil Name,1,A Grade,100,0,20")
    expect(lines[2]).toMatch(/^Ann Able,2,A Grade \/ B Grade,770,120,/)
    expect(truncated).toBe(false)
  })

  it('reports truncation by flag only: the body is a header plus data rows, never a # line', () => {
    const params = p('cols=runs')
    const { csv, truncated } = statLabCsv(params, buildStatLab(params, ctx), 1)
    expect(truncated).toBe(true)
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Player,Seasons,Grades,Runs')
    expect(lines.some((l) => l.startsWith('#'))).toBe(false)
    expect(lines).toHaveLength(2)
  })
})

describe('metricCell text safety', () => {
  it('keeps overs and best figures as text so a spreadsheet does not reinterpret them', () => {
    const c = { ...row().counts, bowlBalls: 75, bowlBestWickets: 5, bowlBestRuns: 21 }
    expect(metricCell(getMetric('overs')!, c)).toBe("'12.3")
    expect(metricCell(getMetric('best')!, c)).toBe("'5/21")
    expect(metricCell(getMetric('runs')!, c)).toBe(0)
  })
})
