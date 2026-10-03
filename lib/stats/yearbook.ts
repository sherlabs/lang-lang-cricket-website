import type { SeasonCounts } from '@/lib/players/season-math'
import type { Game } from '@/lib/playhq/types'
import { isFinished } from '@/lib/playhq/games'
import type { HonourPlayer } from './honours'
import { rankValues } from './rank'

/**
 * Pure rules behind the auto-filled yearbook sections (spec A9). Nothing here is stored: the
 * page computes it per request from the same cached rows as `/stats`.
 */

/** "Top all-rounders" is a stat ranking (runs + 20 x wickets, 100 runs and 8 wickets minimum), never an honour. */
export const ALLROUNDER_WICKET_WEIGHT = 20
export const ALLROUNDER_MIN_RUNS = 100
export const ALLROUNDER_MIN_WICKETS = 8
export const ALLROUNDER_FORMULA = `runs + ${ALLROUNDER_WICKET_WEIGHT} x wickets (at least ${ALLROUNDER_MIN_RUNS} runs and ${ALLROUNDER_MIN_WICKETS} wickets)`

export const allRounderScore = (c: SeasonCounts): number => c.batRuns + ALLROUNDER_WICKET_WEIGHT * c.bowlWickets

export function topAllRounders<T extends { counts: SeasonCounts }>(items: readonly T[], limit = 5) {
  const eligible = items.filter((i) => i.counts.batRuns >= ALLROUNDER_MIN_RUNS && i.counts.bowlWickets >= ALLROUNDER_MIN_WICKETS)
  return rankValues(eligible, (i) => allRounderScore(i.counts), true).filter((r) => r.rank <= limit).slice(0, limit * 2)
}

/** "Summer 2025/26" -> `{ short: '2025/26', start: 2025 }`; null when the name has no year. */
export function seasonParts(seasonName: string): { short: string; start: number } | null {
  const m = /((?:19|20)\d{2})(?:\/(\d{2}))?/.exec(seasonName)
  return m ? { short: m[2] ? `${m[1]}/${m[2]}` : m[1], start: Number(m[1]) } : null
}

/**
 * Does a free-text honour year ("2025/26", "2025-26", "2025", "2023/24 - 2024/25") refer to this
 * season? A range of seasons matches when it names the season in either form; a bare year matches
 * the season that starts in that year. Free text, so best effort.
 */
export function honourMentionsSeason(years: string, seasonName: string): boolean {
  const s = seasonParts(seasonName)
  if (!s) return false
  const text = years.replace(/[‐-―−]/g, '-')
  const [a, b] = s.short.includes('/') ? s.short.split('/') : [s.short, '']
  if (b && (text.includes(s.short) || new RegExp(`(?<!\\d)${a}\\s*-\\s*(?:${a.slice(0, 2)})?${b}(?!\\d)`).test(text))) return true
  // A bare year (no season slash after it) matches the starting year only.
  return new RegExp(`(?<![\\d/-])${s.start}(?![\\d/]|\\s*-\\s*\\d)`).test(text)
}

export type SeasonHonour = { playerId: number; name: string; slug: string; title: string; years: string }

export function honoursForSeason(players: readonly HonourPlayer[], seasonName: string): SeasonHonour[] {
  const out: SeasonHonour[] = []
  for (const p of players) {
    for (const h of p.honours) {
      const title = h.title.trim().replace(/\s+/g, ' ')
      if (title && honourMentionsSeason(h.years ?? '', seasonName)) out.push({ playerId: p.id, name: p.name, slug: p.slug, title, years: h.years })
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name))
}

export type ResultSummary = { played: number; won: number; lost: number; other: number; winRate: number | null }

/** Club-wide results for a season: finished games only. `other` is a draw, tie, no result or abandonment. */
export function summariseResults(games: readonly Game[]): ResultSummary {
  const fin = games.filter(isFinished)
  let won = 0, lost = 0
  for (const g of fin) {
    const o = g.club.outcome ?? ''
    if (g.status === 'ABANDONED') continue
    if (o.startsWith('WON')) won++
    else if (o.startsWith('LOST')) lost++
  }
  const other = fin.length - won - lost
  return { played: fin.length, won, lost, other, winRate: fin.length ? Math.round((won / fin.length) * 100) : null }
}

/** Finished games grouped by grade, grades sorted, games newest first. */
export function resultsByGrade(games: readonly Game[]): { grade: string; games: Game[] }[] {
  const by = new Map<string, Game[]>()
  for (const g of games.filter(isFinished)) {
    const k = g.gradeName ?? 'Other'
    by.set(k, [...(by.get(k) ?? []), g])
  }
  return [...by]
    .map(([grade, gs]) => ({ grade, games: gs.sort((a, b) => b.sortKey.localeCompare(a.sortKey)) }))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }))
}

/** Paragraphs of a plain-text message: blank line between paragraphs, single newlines kept inside. */
export const messageParagraphs = (text: string): string[] =>
  text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

