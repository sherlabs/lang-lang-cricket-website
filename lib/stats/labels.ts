/**
 * Grade, team and opponent label canonicalisation (W2 spec 6.3). One function decides what a label is
 * called everywhere, so "2. Senior Men District" and "Senior Men District", or "B Grade" and "B grade",
 * read as one grade. Stored rows are never rewritten (the sync replaces them nightly): the mapping is
 * applied when reading. An admin rename wins; otherwise the most frequent original spelling is shown.
 */
export type LabelKind = 'grade' | 'team' | 'opponent'
export type LabelRename = { kind: LabelKind; from: string; to: string }

/** Trim, collapse whitespace, strip a leading numbering such as `2. ` or `2) `, and case-fold. */
export function normaliseLabel(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+\s*[.)\]:-]\s*/, '')
    .toLowerCase()
}

export type LabelMap = { renames: ReadonlyMap<string, string>; spellings: ReadonlyMap<string, string> }
export const EMPTY_LABEL_MAP: LabelMap = { renames: new Map(), spellings: new Map() }

const k = (kind: LabelKind, label: string) => `${kind}\u0000${normaliseLabel(label)}`

/** Build the map from the labels present in the data and the admin renames. */
export function buildLabelMap(samples: Iterable<{ kind: LabelKind; label: string | null | undefined; count?: number }>, renames: readonly LabelRename[] = []): LabelMap {
  const counts = new Map<string, Map<string, number>>()
  for (const s of samples) {
    const label = s.label?.replace(/\s+/g, ' ').trim()
    if (!label) continue
    const key = k(s.kind, label)
    const m = counts.get(key) ?? new Map<string, number>()
    m.set(label, (m.get(label) ?? 0) + (s.count ?? 1))
    counts.set(key, m)
  }
  const spellings = new Map<string, string>()
  for (const [key, m] of counts) {
    // Most frequent original spelling; a tie goes to the alphabetically first so the result is deterministic.
    const best = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    spellings.set(key, best)
  }
  return { renames: new Map(renames.filter((r) => r.from.trim() && r.to.trim()).map((r) => [k(r.kind, r.from), r.to.trim()])), spellings }
}

/** The admin rename for a label, or undefined. For `opponent` the result is an `oppositionKey`. */
export const renameFor = (kind: LabelKind, raw: string | null | undefined, map: LabelMap): string | undefined => (raw ? map.renames.get(k(kind, raw)) : undefined)

function canonical(kind: LabelKind, raw: string | null | undefined, map: LabelMap): string {
  const label = raw?.replace(/\s+/g, ' ').trim() ?? ''
  if (!label) return ''
  const key = k(kind, label)
  return map.renames.get(key) ?? map.spellings.get(key) ?? label
}

export const canonicalGrade = (raw: string | null | undefined, map: LabelMap): string => canonical('grade', raw, map)
export const canonicalTeam = (raw: string | null | undefined, map: LabelMap): string => canonical('team', raw, map)
export const canonicalOpponent = (raw: string | null | undefined, map: LabelMap): string => canonical('opponent', raw, map)

/** Rows with their grade and team labels canonicalised; other fields pass through. */
export function applyLabels<T extends { gradeName?: string | null; teamName?: string | null }>(rows: T[], map: LabelMap): T[] {
  return rows.map((r) => ({
    ...r,
    ...(r.gradeName !== undefined ? { gradeName: r.gradeName ? canonicalGrade(r.gradeName, map) : r.gradeName } : {}),
    ...(r.teamName !== undefined ? { teamName: r.teamName ? canonicalTeam(r.teamName, map) : r.teamName } : {}),
  }))
}

/** True when two grade labels are the same grade after canonicalisation (used by shared-link filters). */
export const sameLabel = (a: string | null | undefined, b: string | null | undefined): boolean => normaliseLabel(a) === normaliseLabel(b)

/**
 * A `?grade=` value from a shared link, resolved against the grades that exist now: an exact match first; then the label
 * as the admin renames and the default tidy-up would show it; then any grade that normalises to the same label (so a link
 * that used the old spelling of a merged grade keeps working). Null when nothing matches.
 */
export function resolveGradeParam(input: string | null | undefined, known: readonly string[], canonical?: (raw: string) => string): string | null {
  const t = (input ?? '').trim()
  if (!t) return null
  if (known.includes(t)) return t
  const mapped = canonical?.(t)
  if (mapped && known.includes(mapped)) return mapped
  return known.find((g) => sameLabel(g, t)) ?? null
}
