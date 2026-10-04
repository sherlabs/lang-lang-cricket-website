/**
 * Pure sponsor-carousel helpers (spec §14): no database, React or Next imports, so the
 * `site-settings` global config, the query module and unit tests can all use them.
 */
import { TIER_ORDER } from './sponsors'
import type { LabelRename } from './stats/labels'
import { GRADE_CATEGORIES, MAX_RULE_PATTERN_LENGTH, classifyGradeStrict, compileRules, type GradeCategory, type GradeRule } from './stats/categories'
import { DEFAULT_MATCH_MINIMUMS, resolveMatchMinimums, type MatchMinimums } from './stats/match/minimums'
import { DEFAULT_QUALIFICATION, type QualConfig, type QualScope } from './stats/qualify'

export const DEFAULT_SPONSOR_CAROUSEL_TIERS: readonly string[] = ['Platinum', 'Gold']

/**
 * Coerce a stored value into a list of valid sponsor tiers, in TIER_ORDER
 * order with duplicates and unknown tiers dropped. Returns `null` when the
 * value isn't a list at all (caller should fall back to the default);
 * an empty list is a legitimate "show nothing" choice and is returned as `[]`.
 */
export function normaliseTiers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const wanted = new Set(value.filter((v): v is string => typeof v === 'string'))
  return TIER_ORDER.filter((tier) => wanted.has(tier))
}

type CarouselSponsor = { tier: string; name: string; logoUrl: string }

/** Keep each business's first occurrence (its highest tier, given tier-ordered input). */
export function dedupeByHighestTier<T extends { name: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((s) => {
    const key = s.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Sponsors that belong in the home page carousel: only the selected tiers,
 * only those with a logo, one entry per business (at its highest selected
 * tier), ordered by tier then name.
 */
export function selectCarouselSponsors<T extends CarouselSponsor>(rows: readonly T[], tiers: readonly string[]): T[] {
  const eligible = rows.filter((s) => tiers.includes(s.tier) && s.logoUrl)
  const ordered = TIER_ORDER.flatMap((tier) =>
    eligible.filter((s) => s.tier === tier).sort((a, b) => a.name.localeCompare(b.name)),
  )
  return dedupeByHighestTier(ordered)
}

// ---- Stats settings (BetterStats features, spec 3.2, 3.3, 3.6) ---------------------------------------

export type MilestoneKey = 'games' | 'runs' | 'wickets' | 'catches'
export type HonourCategoryRule = { label: string; keywords: string[] }

export type StatsSettings = {
  /** Categories shown by default; juniors are off unless `?juniors=1`. */
  defaultIncludedCategories: GradeCategory[]
  /** Admin grade rules, tried before the built-ins. */
  gradeRules: GradeRule[]
  qualification: QualConfig
  /** Minimum sample sizes for match-derived rates. */
  matchMinimums: MatchMinimums
  milestoneThresholds: Record<MilestoneKey, number[]>
  approachWindow: Record<MilestoneKey, number>
  honourCategories: HonourCategoryRule[]
  /** Club-wide grade, team and opponent label renames (W2 6.3); applied when reading, never written back to the data. */
  labelRenames: LabelRename[]
}

export const DEFAULT_MILESTONE_THRESHOLDS: Record<MilestoneKey, number[]> = {
  games: [50, 100, 150, 200, 250],
  runs: [500, 1000, 2000, 3000, 5000],
  wickets: [25, 50, 100, 150, 200],
  catches: [25, 50, 100],
}
export const DEFAULT_APPROACH_WINDOW: Record<MilestoneKey, number> = { games: 5, runs: 100, wickets: 10, catches: 5 }
export const DEFAULT_INCLUDED_CATEGORIES: GradeCategory[] = ['senior', 'womens', 'masters', 'mixed']
export const DEFAULT_HONOUR_CATEGORIES: HonourCategoryRule[] = [
  { label: 'Life Member', keywords: ['life member'] },
  { label: 'Hall of Fame', keywords: ['hall of fame'] },
  { label: 'Premiership', keywords: ['premier', 'flag'] },
  { label: 'Best and Fairest / Club Champion', keywords: ['best and fairest', 'best & fairest', 'club champion', 'player of the year'] },
  { label: 'Captain', keywords: ['captain'] },
  { label: 'Leadership / Role', keywords: ['president', 'secretary', 'treasurer', 'coach', 'committee', 'vice'] },
  { label: 'Association honours', keywords: ['association', 'ccca', 'representative', 'rep '] },
]

export const DEFAULT_STATS_SETTINGS: StatsSettings = {
  defaultIncludedCategories: DEFAULT_INCLUDED_CATEGORIES,
  gradeRules: [],
  qualification: DEFAULT_QUALIFICATION,
  matchMinimums: DEFAULT_MATCH_MINIMUMS,
  milestoneThresholds: DEFAULT_MILESTONE_THRESHOLDS,
  approachWindow: DEFAULT_APPROACH_WINDOW,
  honourCategories: DEFAULT_HONOUR_CATEGORIES,
  labelRenames: [],
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonNeg = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback

function scope(raw: unknown, def: QualScope): QualScope {
  const o = isObj(raw) ? raw : {}
  return {
    batAvgRuns: nonNeg(o.batAvgRuns, def.batAvgRuns),
    batAvgInnings: nonNeg(o.batAvgInnings, def.batAvgInnings),
    srBalls: nonNeg(o.srBalls, def.srBalls),
    bowlAvgWickets: nonNeg(o.bowlAvgWickets, def.bowlAvgWickets),
    econBalls: nonNeg(o.econBalls, def.econBalls),
  }
}

function thresholds(raw: unknown, def: number[]): number[] {
  if (!Array.isArray(raw)) return def
  const xs = [...new Set(raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).map(Math.floor))].sort((a, b) => a - b)
  return xs.length ? xs : def
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A renamed grade is classified by the label shown first, then by the raw one (W2 spec). The pages only see the
 * shown label, so for each grade rename whose new label matches no rule but whose old one does, add an exact-match
 * rule for the new label. Appended after the admin's own rules; never saved back.
 */
export function withRenamedGradeRules(settings: StatsSettings): StatsSettings {
  const extra: GradeRule[] = []
  for (const r of settings.labelRenames) {
    if (r.kind !== 'grade') continue
    const pattern = `^${escapeRe(r.to)}$`
    if (pattern.length > MAX_RULE_PATTERN_LENGTH) continue
    const shown = classifyGradeStrict(r.to, settings.gradeRules)
    if (shown) continue
    const raw = classifyGradeStrict(r.from, settings.gradeRules)
    if (raw) extra.push({ category: raw, pattern, flags: 'i' })
  }
  return extra.length ? { ...settings, gradeRules: [...settings.gradeRules, ...extra] } : settings
}

/**
 * Coerce the saved `site-settings.stats` group into a complete, valid object. Every field
 * falls back to its default, so a partial, empty or corrupt value never breaks a stats page.
 */
export function resolveStatsSettings(raw: unknown): StatsSettings {
  const o = isObj(raw) ? raw : {}
  const cats = Array.isArray(o.defaultIncludedCategories)
    ? GRADE_CATEGORIES.filter((c) => (o.defaultIncludedCategories as unknown[]).includes(c))
    : null
  const rules = Array.isArray(o.gradeRules)
    ? o.gradeRules
        .filter(isObj)
        .map((r) => ({ category: r.category as GradeCategory, pattern: String(r.pattern ?? ''), flags: typeof r.flags === 'string' ? r.flags : 'i' }))
    : []
  const qual = isObj(o.qualification) ? o.qualification : {}
  const mt = isObj(o.milestoneThresholds) ? o.milestoneThresholds : {}
  const aw = isObj(o.approachWindow) ? o.approachWindow : {}
  const keys: MilestoneKey[] = ['games', 'runs', 'wickets', 'catches']
  const honours = Array.isArray(o.honourCategories)
    ? o.honourCategories
        .filter(isObj)
        .map((h) => ({
          label: String(h.label ?? '').trim(),
          keywords: (Array.isArray(h.keywords) ? h.keywords : []).filter((k): k is string => typeof k === 'string' && k.trim() !== '').map((k) => k.toLowerCase()),
        }))
        .filter((h) => h.label)
    : []
  const renames: LabelRename[] = Array.isArray(o.labelRenames)
    ? o.labelRenames
        .filter(isObj)
        .map((r) => ({ kind: r.kind as LabelRename['kind'], from: String(r.from ?? '').trim(), to: String(r.to ?? '').trim() }))
        .filter((r) => (r.kind === 'grade' || r.kind === 'team' || r.kind === 'opponent') && r.from && r.to)
        .slice(0, 200)
    : []
  return {
    // An explicitly saved empty list is kept as the fallback default: hiding everything is never useful.
    defaultIncludedCategories: cats && cats.length ? cats : DEFAULT_INCLUDED_CATEGORIES,
    gradeRules: rules.filter((r) => compileRules([r]).length === 1),
    qualification: { career: scope(qual.career, DEFAULT_QUALIFICATION.career), season: scope(qual.season, DEFAULT_QUALIFICATION.season) },
    matchMinimums: resolveMatchMinimums(o.matchMinimums),
    milestoneThresholds: Object.fromEntries(keys.map((k) => [k, thresholds(mt[k], DEFAULT_MILESTONE_THRESHOLDS[k])])) as Record<MilestoneKey, number[]>,
    approachWindow: Object.fromEntries(keys.map((k) => [k, nonNeg(aw[k], DEFAULT_APPROACH_WINDOW[k])])) as Record<MilestoneKey, number>,
    honourCategories: honours.length ? honours : DEFAULT_HONOUR_CATEGORIES,
    labelRenames: renames,
  }
}
