import type { SeasonCounts } from '@/lib/players/season-math'
import { careerOf, mergeBySeason, type StatRow } from './aggregate'
import { parseCategories, type GradeCategory } from './categories'
import { csvCell, toCsv, type CsvCell } from './csv'
import { filterRows } from './leaderboard'
import { getMetric, METRIC_KEYS, type Metric } from './metrics'
import { ALL, catParam, first, MAX_PARAM_LENGTH } from './query-string'

/**
 * StatLab-lite (spec A11): column picker, filters, sort and thresholds over the same metric
 * registry as the leaderboards. Everything is in the URL (saved report = copy the link). The
 * page and the CSV export both call `buildStatLab`, so the two can never disagree.
 */
export const SCOPES = ['career', 'season', 'team-season'] as const
export type StatLabScope = (typeof SCOPES)[number]
export const SCOPE_LABELS: Record<StatLabScope, string> = {
  career: 'One row per player (all seasons)',
  season: 'One row per player and season',
  'team-season': 'One row per player, team and season',
}

export const MAX_COLUMNS = 12
export const PAGE_ROWS = 500
export const EXPORT_ROWS = 5000
export const MAX_MIN = 1_000_000
export const DEFAULT_COLS: readonly string[] = ['games', 'runs', 'avg', 'sr', 'wickets', 'econ', 'catches']

type Raw = Record<string, string | string[] | undefined>

export type SortSpec = { key: string; dir: 'asc' | 'desc' }

export type StatLabParams = {
  scope: StatLabScope
  season: string
  grade: string
  cats: GradeCategory[] | null
  juniors: boolean
  cols: string[]
  sort: SortSpec
  /** Metric key -> minimum value; only keys above zero are kept. */
  mins: Record<string, number>
  q: string
  /** Career scope only: players with at most this many seasons. */
  maxSeasons: number | null
  /** Only players flagged active. */
  active: boolean
}

export type StatLabKnown = { seasons: readonly string[]; grades: readonly string[] }

const clean = (v: string | undefined): string => {
  const t = v?.trim() ?? ''
  return t.length <= MAX_PARAM_LENGTH ? t : ''
}

/** Natural sort direction for a metric: best first. */
export const defaultDir = (key: string): 'asc' | 'desc' => (getMetric(key)?.higherIsBetter === false ? 'asc' : 'desc')

function parseCols(v: string | string[] | undefined): string[] {
  const parts = (Array.isArray(v) ? v : [v ?? '']).flatMap((s) => s.split(',')).map((s) => s.trim())
  const out: string[] = []
  for (const k of parts) if (METRIC_KEYS.includes(k) && !out.includes(k)) out.push(k)
  return out.slice(0, MAX_COLUMNS)
}

function parseSort(v: string | undefined, cols: readonly string[]): SortSpec {
  const fallback: SortSpec = { key: cols[0], dir: defaultDir(cols[0]) }
  const m = /^([A-Za-z]+)\.(asc|desc)$/.exec(clean(v))
  if (!m) return fallback
  return m[1] === 'name' || cols.includes(m[1]) ? { key: m[1], dir: m[2] as 'asc' | 'desc' } : fallback
}

/** Parse StatLab params. Anything unknown or malformed falls back to the default; never throws. */
export function parseStatLabParams(raw: Raw, known: StatLabKnown): StatLabParams {
  const scopeIn = clean(first(raw.scope))
  const scope: StatLabScope = scopeIn === 'player-season' ? 'team-season' : (SCOPES as readonly string[]).includes(scopeIn) ? (scopeIn as StatLabScope) : 'career'
  const seasonIn = clean(first(raw.season))
  const gradeIn = clean(first(raw.grade))
  const parsedCols = parseCols(raw.cols)
  const cols = parsedCols.length ? parsedCols : [...DEFAULT_COLS]
  const mins: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('min.')) continue
    const key = k.slice(4)
    if (!METRIC_KEYS.includes(key)) continue
    const n = Number(clean(first(v)))
    if (Number.isFinite(n) && n > 0) mins[key] = Math.round(Math.min(n, MAX_MIN) * 10) / 10 // quantised: bounds the distinct cacheable URLs
  }
  const ms = Number(clean(first(raw.maxseasons)))
  const cats = parseCategories(clean(catParam(raw.cat)))
  return {
    scope,
    season: seasonIn && known.seasons.includes(seasonIn) ? seasonIn : ALL,
    grade: gradeIn && known.grades.includes(gradeIn) ? gradeIn : ALL,
    cats: cats.length ? cats : null,
    juniors: first(raw.juniors) === '1',
    cols,
    sort: parseSort(first(raw.sort), cols),
    mins,
    q: clean(first(raw.q)),
    maxSeasons: Number.isInteger(ms) && ms >= 1 && ms <= 50 ? ms : null,
    active: first(raw.active) === '1',
  }
}

/** Canonical href: keys in sorted order, defaults omitted, so equal reports share one URL. */
export function statLabHref(base: string, p: Partial<StatLabParams>): string {
  const q = new URLSearchParams()
  if (p.active) q.set('active', '1')
  if (p.cats?.length) q.set('cat', p.cats.join(','))
  if (p.cols?.length && p.cols.join(',') !== DEFAULT_COLS.join(',')) q.set('cols', p.cols.join(','))
  if (p.grade && p.grade !== ALL) q.set('grade', p.grade)
  if (p.juniors) q.set('juniors', '1')
  if (p.maxSeasons) q.set('maxseasons', String(p.maxSeasons))
  for (const [k, v] of Object.entries(p.mins ?? {})) if (v > 0) q.set(`min.${k}`, String(v))
  if (p.q) q.set('q', p.q)
  if (p.scope && p.scope !== 'career') q.set('scope', p.scope)
  if (p.season && p.season !== ALL) q.set('season', p.season)
  const cols = p.cols?.length ? p.cols : DEFAULT_COLS
  if (p.sort && !(p.sort.key === cols[0] && p.sort.dir === defaultDir(cols[0]))) q.set('sort', `${p.sort.key}.${p.sort.dir}`)
  const sorted = new URLSearchParams([...q].sort(([a], [b]) => a.localeCompare(b)))
  const qs = sorted.toString().replace(/%2C/g, ',')
  return qs ? `${base}?${qs}` : base
}

/** Rebuild a raw param object from a URL (the export route's input). */
export function rawFromSearchParams(sp: URLSearchParams): Raw {
  const out: Raw = {}
  for (const k of new Set(sp.keys())) {
    const all = sp.getAll(k)
    out[k] = all.length > 1 ? all : all[0]
  }
  return out
}

export type StatLabRow = {
  playerId: number
  name: string
  slug: string
  season: string
  team: string
  grade: string
  seasons: number
  counts: SeasonCounts
}

export type StatLabResult = { columns: Metric[]; rows: StatLabRow[]; total: number }

export type StatLabContext = {
  rows: readonly StatRow[]
  players: ReadonlyMap<number, { name: string; slug: string }>
  /** Resolved categories (`effectiveCategories`). */
  cats: readonly GradeCategory[]
  rules: Parameters<typeof filterRows>[1]['rules']
  /** Ids of active players, for `active=1`. */
  activeIds?: ReadonlySet<number>
}

const didPlay = (c: SeasonCounts) => c.games > 0 || c.batInnings > 0 || c.bowlBalls > 0 || c.catches > 0

/** The filtered, sorted table (all rows; callers cut to `PAGE_ROWS` or `EXPORT_ROWS`). */
export function buildStatLab(p: StatLabParams, ctx: StatLabContext): StatLabResult {
  const filtered = filterRows(ctx.rows, { cats: ctx.cats, rules: ctx.rules, season: p.season, grade: p.grade })
  let items: StatLabRow[]
  const base = (playerId: number) => {
    const pl = ctx.players.get(playerId)
    return pl ? { playerId, name: pl.name, slug: pl.slug } : null
  }
  if (p.scope === 'career') {
    items = careerOf(filtered).flatMap((c) => {
      const b = base(c.playerId)
      return b ? [{ ...b, season: '', team: '', grade: c.gradeNames.join(' / '), seasons: c.seasons, counts: c.counts }] : []
    })
  } else if (p.scope === 'season') {
    items = mergeBySeason(filtered).flatMap((s) => {
      const b = base(s.playerId)
      return b ? [{ ...b, season: s.seasonName, team: s.teamNames.join(' / '), grade: s.gradeNames.join(' / '), seasons: 1, counts: s.counts }] : []
    })
  } else {
    items = filtered.flatMap((r) => {
      const b = base(r.playerId)
      return b ? [{ ...b, season: r.seasonName, team: r.teamName, grade: r.gradeName ?? '', seasons: 1, counts: r.counts }] : []
    })
  }

  const q = p.q.toLowerCase()
  const metricsMin = Object.entries(p.mins).flatMap(([k, v]) => { const m = getMetric(k); return m ? [{ m, v }] : [] })
  items = items.filter(
    (it) =>
      didPlay(it.counts) &&
      (!q || it.name.toLowerCase().includes(q)) &&
      (!p.active || ctx.activeIds?.has(it.playerId)) &&
      (p.maxSeasons === null || p.scope !== 'career' || it.seasons <= p.maxSeasons) &&
      metricsMin.every(({ m, v }) => { const x = m.value(it.counts); return x !== null && x >= v }),
  )

  const sortMetric = p.sort.key === 'name' ? null : getMetric(p.sort.key)
  const sign = p.sort.dir === 'asc' ? 1 : -1
  items.sort((a, b) => {
    if (sortMetric) {
      const x = sortMetric.value(a.counts), y = sortMetric.value(b.counts)
      if (x === null && y !== null) return 1
      if (y === null && x !== null) return -1
      if (x !== null && y !== null && x !== y) return (x - y) * sign
    } else {
      const c = a.name.localeCompare(b.name) * sign
      if (c) return c
    }
    return a.name.localeCompare(b.name) || a.season.localeCompare(b.season) || a.team.localeCompare(b.team)
  })

  return { columns: p.cols.map((k) => getMetric(k)!), rows: items, total: items.length }
}

/** Identity columns shown before the metrics, by scope. */
export function identityColumns(scope: StatLabScope): { key: 'season' | 'team' | 'grade' | 'seasons'; label: string }[] {
  if (scope === 'career') return [{ key: 'seasons', label: 'Seasons' }, { key: 'grade', label: 'Grades' }]
  if (scope === 'season') return [{ key: 'season', label: 'Season' }, { key: 'grade', label: 'Grades' }]
  return [{ key: 'season', label: 'Season' }, { key: 'team', label: 'Team' }, { key: 'grade', label: 'Grade' }]
}

/** CSV cell for a metric: numeric when the display is a plain number, else the display text (e.g. `103*`, `5/21`). */
export function metricCell(m: Metric, c: SeasonCounts): CsvCell {
  const f = m.format(c)
  if (f === '–') return null
  // Overs ("12.3" = 12 overs 3 balls) and best figures ("5/21") must stay text; a spreadsheet would
  // read them as a decimal or a date. The apostrophe is the usual text marker and toCsv keeps it.
  if (m.key === 'overs' || /\//.test(f)) return `'${f}`
  const n = Number(f)
  return Number.isFinite(n) ? n : f
}

/** The export body: a truncation marker line first when the result exceeds `cap`. */
export function statLabCsv(p: StatLabParams, result: StatLabResult, cap = EXPORT_ROWS): { csv: string; truncated: boolean } {
  const id = identityColumns(p.scope)
  const header = ['Player', ...id.map((c) => c.label), ...result.columns.map((m) => m.label)]
  const shown = result.rows.slice(0, cap)
  const body = shown.map((r) => [r.name, ...id.map((c) => (c.key === 'seasons' ? r.seasons : r[c.key])), ...result.columns.map((m) => metricCell(m, r.counts))])
  const truncated = result.total > cap
  const marker = truncated ? `${csvCell(`# truncated to ${cap} of ${result.total} rows`)}\r\n` : ''
  return { csv: marker + toCsv(header, body), truncated }
}
