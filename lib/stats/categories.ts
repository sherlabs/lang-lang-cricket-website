import { JUNIOR_GRADE_RE } from '@/lib/playhq/junior-rules'

/** Grade categories (spec 3.1). `senior` is the default when nothing else matches. */
export const GRADE_CATEGORIES = ['senior', 'junior', 'womens', 'masters', 'mixed'] as const
export type GradeCategory = (typeof GRADE_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<GradeCategory, string> = {
  senior: 'Senior',
  junior: 'Junior',
  womens: "Women's",
  masters: 'Masters',
  mixed: 'Mixed',
}

export type GradeRule = { category: GradeCategory; pattern: string; flags?: string | null }

/** Built-in rules in precedence order: junior, womens, masters, mixed. Word-bounded, so "Thunder" is never junior. */
const BUILT_IN: { category: Exclude<GradeCategory, 'senior'>; re: RegExp }[] = [
  { category: 'junior', re: JUNIOR_GRADE_RE },
  { category: 'womens', re: /\b(?:women'?s?|ladies|womens)\b/i },
  { category: 'masters', re: /\b(?:masters?|over\s?-?\d{2}s?|o\s?-?\d{2}s?|vets?|veterans?)\b/i },
  { category: 'mixed', re: /\bmixed\b/i },
]

export const MAX_RULE_PATTERN_LENGTH = 100

const isCategory = (c: unknown): c is GradeCategory => GRADE_CATEGORIES.includes(c as GradeCategory)

/** A pattern the admin may save: short and compilable. Returns an error message, or null when fine. */
export function validateRulePattern(pattern: unknown, flags?: unknown): string | null {
  if (typeof pattern !== 'string' || pattern.trim() === '') return 'Enter a pattern.'
  if (pattern.length > MAX_RULE_PATTERN_LENGTH) return `Keep the pattern to ${MAX_RULE_PATTERN_LENGTH} characters or fewer.`
  const f = typeof flags === 'string' ? flags : 'i'
  if (!/^[imsu]*$/.test(f)) return 'Flags may only contain i, m, s or u.'
  try {
    new RegExp(pattern, f)
  } catch {
    return 'That is not a valid regular expression.'
  }
  return null
}

/** Compile admin rules, silently dropping any that are invalid so a bad saved value can never break a page. */
export function compileRules(rules: readonly GradeRule[] | null | undefined): { category: GradeCategory; re: RegExp }[] {
  const out: { category: GradeCategory; re: RegExp }[] = []
  for (const r of rules ?? []) {
    if (!r || !isCategory(r.category) || validateRulePattern(r.pattern, r.flags ?? 'i') !== null) continue
    out.push({ category: r.category, re: new RegExp(r.pattern, r.flags ?? 'i') })
  }
  return out
}

function matchOne(text: string, custom: { category: GradeCategory; re: RegExp }[]): GradeCategory | null {
  for (const r of custom) if (r.re.test(text)) return r.category
  for (const r of BUILT_IN) if (r.re.test(text)) return r.category
  return null
}

/**
 * Category of a player-season row. The grade name decides first; the team name is only
 * consulted when the grade is empty or classifies as plain senior. Admin rules are tried
 * before the built-ins on each string.
 */
export function classifyGrade(
  gradeName: string | null | undefined,
  teamName: string | null | undefined,
  rules: readonly GradeRule[] | null | undefined = [],
): GradeCategory {
  const custom = compileRules(rules)
  const g = (gradeName ?? '').trim()
  const fromGrade = g ? matchOne(g, custom) : null
  if (fromGrade) return fromGrade
  const t = (teamName ?? '').trim()
  return (t ? matchOne(t, custom) : null) ?? 'senior'
}

/** Parse `?cat=senior,womens` against the whitelist; unknown values are dropped. */
export function parseCategories(value: string | null | undefined): GradeCategory[] {
  if (!value) return []
  const wanted = new Set(value.split(',').map((v) => v.trim().toLowerCase()))
  return GRADE_CATEGORIES.filter((c) => wanted.has(c))
}
