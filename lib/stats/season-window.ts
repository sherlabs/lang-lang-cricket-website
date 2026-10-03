import { seasonYears } from '@/lib/players/view'

export type SeasonInfo = { seasonName: string; seasonOrder: number }

/** Distinct seasons in the data, newest first (lowest `seasonOrder` first). */
export function seasonIndex(rows: readonly { seasonName: string; seasonOrder: number }[]): SeasonInfo[] {
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.seasonName, Math.min(by.get(r.seasonName) ?? Infinity, r.seasonOrder))
  return [...by].map(([seasonName, seasonOrder]) => ({ seasonName, seasonOrder })).sort((a, b) => a.seasonOrder - b.seasonOrder || a.seasonName.localeCompare(b.seasonName))
}

/**
 * "Current" season (spec fact 9): the lowest `seasonOrder` that actually holds rows. Never a
 * literal 0, because the newest PlayHQ season group may be upcoming with no stats yet.
 */
export function currentSeasonOrder(rows: readonly { seasonOrder: number }[]): number | null {
  let min: number | null = null
  for (const r of rows) if (min === null || r.seasonOrder < min) min = r.seasonOrder
  return min
}

export function currentSeasonName(rows: readonly { seasonName: string; seasonOrder: number }[]): string | null {
  const order = currentSeasonOrder(rows)
  return order === null ? null : (rows.find((r) => r.seasonOrder === order)?.seasonName ?? null)
}

/** The stored window, computed from the data: earliest and latest season with rows. */
export function coverage(rows: readonly { seasonName: string; seasonOrder: number }[]): { from: string; to: string } | null {
  const idx = seasonIndex(rows)
  if (!idx.length) return null
  return { from: idx[idx.length - 1].seasonName, to: idx[0].seasonName }
}

/** "2023/24" from "Summer 2023/24". */
export const shortSeason = seasonYears

/** "since 2023/24", or "in the stored data" when nothing is stored. */
export function sinceLabel(rows: readonly { seasonName: string; seasonOrder: number }[]): string {
  const c = coverage(rows)
  return c ? `since ${shortSeason(c.from)}` : 'in the stored data'
}

export function coverageLine(rows: readonly { seasonName: string; seasonOrder: number }[]): string {
  const c = coverage(rows)
  return c
    ? `Records cover seasons from ${shortSeason(c.from)}; earlier history is not in the database.`
    : 'No season data has been recorded yet.'
}
