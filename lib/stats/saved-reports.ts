import { MAX_COLUMNS, parseStatLabParams, rawFromSearchParams, statLabHref } from './statlab'
import { LAB_COLUMN_KEYS } from './statlab-columns'

/**
 * Saved StatLab reports (W2 spec 5.3) are only a canonical query string: no JSON, no expressions, no
 * code. This pure function is the one gate the collection hook uses; the page re-parses the string
 * with the normal whitelist parser when it loads, so a stale key can never do anything.
 */
export const MAX_QUERY_LENGTH = 2000
export const MAX_SAVED_REPORTS = 200

// Letters, digits and the punctuation a URL query uses; no whitespace, quotes, angle brackets or braces.
const QUERY_CHARS = /^[\p{L}\p{N}_.,:%+=&~*()!/'-]*$/u

export type CanonicalResult = { ok: true; query: string } | { ok: false; reason: string }

/** Accepts `a=1&b=2`, `?a=1`, or `/statlab?a=1`. Returns the canonical query (no leading `?`) or why not. */
export function canonicaliseReport(input: string): CanonicalResult {
  let q = input.trim()
  if (q.length > MAX_QUERY_LENGTH) return { ok: false, reason: `Too long: at most ${MAX_QUERY_LENGTH} characters.` }
  const at = q.indexOf('?')
  if (at >= 0) q = q.slice(at + 1)
  q = q.replace(/#.*$/, '')
  if (!q || !QUERY_CHARS.test(q) || !q.includes('=')) return { ok: false, reason: 'Not a StatLab query string. Use the address of a StatLab report, for example "cols=runs,avg&sort=runs.desc".' }

  const sp = new URLSearchParams(q)
  const rawCols = (sp.getAll('cols') ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
  if (rawCols.length > 0 && !rawCols.some((c) => LAB_COLUMN_KEYS.includes(c))) return { ok: false, reason: 'None of the chosen columns exist. Pick at least one column.' }

  // The string carries its own season, grade and opposition; they are whitelisted again at load.
  const known = { seasons: sp.getAll('season'), grades: sp.getAll('grade'), opps: sp.getAll('opp') }
  const params = parseStatLabParams(rawFromSearchParams(sp), known)
  if (params.cols.length === 0) return { ok: false, reason: 'A report needs at least one column.' }
  const href = statLabHref('/statlab', params)
  const canonical = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
  if (!canonical) return { ok: false, reason: 'Nothing to save: change a column, filter or sort first.' }
  return { ok: true, query: canonical }
}

/**
 * Season, grade and opposition values in a canonical query that are not in the real lists. A saved report
 * with one of these would load as "all", a different table than the one saved, so the route refuses it.
 */
export function unknownFilters(query: string, known: { seasons: readonly string[]; grades: readonly string[]; opps: readonly string[] }): string[] {
  const sp = new URLSearchParams(query)
  const bad: string[] = []
  const check = (key: string, label: string, list: readonly string[]) => {
    const v = sp.get(key)
    if (v && !list.includes(v)) bad.push(`${label} "${v}"`)
  }
  check('season', 'season', known.seasons)
  check('grade', 'grade', known.grades)
  check('opp', 'opposition', known.opps)
  return bad
}

/** Column keys in a stored query that no longer exist (they are dropped when the report loads). */
export function droppedColumns(query: string): string[] {
  const raw = new URLSearchParams(query).getAll('cols').flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
  return [...new Set(raw.filter((c) => !LAB_COLUMN_KEYS.includes(c)))].slice(0, MAX_COLUMNS)
}

/** Link to a saved report: the canonical StatLab URL (this is also the share link). */
export const savedReportHref = (query: string): string => `/statlab?${query}`
