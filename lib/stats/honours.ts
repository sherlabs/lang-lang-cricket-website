/**
 * Honour board (spec A7). `players.honours` is free text `{years, title}`: there is no honour
 * type and no numeric year, so grouping and categorising are keyword/regex based and best
 * effort. Anything unrecognised is shown verbatim, under "Other" or "Year not recorded".
 */
export type HonourCategoryRule = { label: string; keywords: readonly string[] }
export const OTHER_CATEGORY = 'Other'
export const NO_YEAR_LABEL = 'Year not recorded'

export type RawHonour = { years: string; title: string }
export type HonourPlayer = { id: number; name: string; slug: string; honours: readonly RawHonour[] }

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Case- and whitespace-insensitive grouping key. */
export const honourKey = (title: string): string => collapse(title).toLowerCase()

/**
 * First year in a free-text span: "2024", "2023/24", "2023-24", "2010–2012", "2023/24 - 2024/25".
 * Null when no four-digit year (19xx or 20xx) is present; the text is still displayed verbatim.
 */
export function startYear(years: string): number | null {
  const m = /(?<!\d)(?:19|20)\d{2}(?!\d)/.exec(years)
  return m ? Number(m[0]) : null
}

export function categoriseHonour(title: string, rules: readonly HonourCategoryRule[]): string {
  const t = ` ${collapse(title).toLowerCase()} `
  for (const r of rules) if (r.keywords.some((k) => k.trim() && t.includes(k.toLowerCase()))) return r.label
  return OTHER_CATEGORY
}

export type Recipient = { playerId: number; name: string; slug: string; years: string; sortYear: number | null }
export type HonourGroup = { key: string; title: string; category: string; recipients: Recipient[] }
export type YearEntry = { title: string; category: string; playerId: number; name: string; slug: string; years: string }
export type YearGroup = { year: number | null; label: string; entries: YearEntry[] }
export type HonourBoard = { byHonour: HonourGroup[]; byYear: YearGroup[]; categories: string[]; total: number }

const byYearDesc = (a: { sortYear: number | null; name: string }, b: { sortYear: number | null; name: string }) =>
  (a.sortYear === null ? 1 : 0) - (b.sortYear === null ? 1 : 0) || (b.sortYear ?? 0) - (a.sortYear ?? 0) || a.name.localeCompare(b.name)

/**
 * Callers pass visible players only (hidden players are filtered by the query, not here).
 * Groups: category order from `rules`, then recipient count, then title.
 */
export function buildHonourBoard(players: readonly HonourPlayer[], rules: readonly HonourCategoryRule[]): HonourBoard {
  const groups = new Map<string, HonourGroup>()
  const years = new Map<string, YearGroup>()
  let total = 0
  for (const p of players) {
    for (const h of p.honours) {
      const title = collapse(h.title ?? '')
      if (!title) continue
      total++
      const key = honourKey(title)
      const category = categoriseHonour(title, rules)
      const sortYear = startYear(h.years ?? '')
      const g = groups.get(key) ?? { key, title, category, recipients: [] }
      g.recipients.push({ playerId: p.id, name: p.name, slug: p.slug, years: collapse(h.years ?? ''), sortYear })
      groups.set(key, g)
      const yk = sortYear === null ? 'none' : String(sortYear)
      const yg = years.get(yk) ?? { year: sortYear, label: sortYear === null ? NO_YEAR_LABEL : String(sortYear), entries: [] }
      yg.entries.push({ title, category, playerId: p.id, name: p.name, slug: p.slug, years: collapse(h.years ?? '') })
      years.set(yk, yg)
    }
  }
  const order = [...rules.map((r) => r.label), OTHER_CATEGORY]
  const rank = (c: string) => { const i = order.indexOf(c); return i < 0 ? order.length : i }
  const byHonour = [...groups.values()]
    .map((g) => ({ ...g, recipients: [...g.recipients].sort(byYearDesc) }))
    .sort((a, b) => rank(a.category) - rank(b.category) || b.recipients.length - a.recipients.length || a.title.localeCompare(b.title))
  const byYear = [...years.values()]
    .map((y) => ({ ...y, entries: [...y.entries].sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.year === null ? 1 : 0) - (b.year === null ? 1 : 0) || (b.year ?? 0) - (a.year ?? 0))
  const present = new Set(byHonour.map((g) => g.category))
  return { byHonour, byYear, categories: order.filter((c) => present.has(c)), total }
}
