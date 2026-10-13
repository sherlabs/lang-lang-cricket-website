import { unitOf, type MilestoneKey } from '@/lib/stats/milestones'

/**
 * Rows of the Home page's Milestones card (wave G WP-3). Pure: a few people close to a round number, closest first, with a short
 * "2 runs from 1,000" line. Players who have just reached one are listed first (at most two), then the nearest approaching ones.
 */
export type HomeMilestoneInput = {
  achieved: ReadonlyArray<{ playerId: number; name: string; hidden: boolean; key: MilestoneKey; threshold: number }>
  approaching: ReadonlyArray<{ playerId: number; name: string; hidden: boolean; key: MilestoneKey; threshold: number; remaining: number }>
}
export type HomeMilestoneRow = { key: string; playerId: number; name: string; hidden: boolean; initials: string; text: string; reached: boolean }

export const HOME_MILESTONE_ROWS = 4
const MAX_REACHED = 2

export const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function homeMilestoneRows(i: HomeMilestoneInput, locale: string): HomeMilestoneRow[] {
  const n = (v: number) => v.toLocaleString(locale)
  const reached = i.achieved.slice(0, MAX_REACHED).map<HomeMilestoneRow>((a) => ({
    key: `r-${a.playerId}-${a.key}-${a.threshold}`, playerId: a.playerId, name: a.name, hidden: a.hidden, initials: initialsOf(a.name),
    text: `Reached ${n(a.threshold)} ${unitOf(a.key, a.threshold)}`, reached: true,
  }))
  const near = i.approaching.map<HomeMilestoneRow>((a) => ({
    key: `a-${a.playerId}-${a.key}-${a.threshold}`, playerId: a.playerId, name: a.name, hidden: a.hidden, initials: initialsOf(a.name),
    text: `${n(a.remaining)} ${unitOf(a.key, a.remaining)} from ${n(a.threshold)}`, reached: false,
  }))
  return [...reached, ...near].slice(0, HOME_MILESTONE_ROWS)
}
