/**
 * Pure grouping for `RsvpSummaryField` (spec §9), ported from the old admin event page:
 * one group per occurrence (in date order), going / not going lists, the yes/no tally,
 * dinner counts by meal (first-appearance order) and a "no dinner" count among the going.
 */
export type SummaryRsvp = {
  id: number
  occurrenceDate: string
  name: string
  email?: string | null
  note?: string | null
  response?: 'yes' | 'no' | null
  meal?: string | null
}

export type OccurrenceGroup = {
  /** ISO string of the occurrence (wall-clock-as-UTC). */
  iso: string
  going: SummaryRsvp[]
  notGoing: SummaryRsvp[]
  tally: { yes: number; no: number }
  /** Meal → count, in order of first appearance. */
  meals: [string, number][]
  noDinner: number
}

export function groupByOccurrence(rsvps: SummaryRsvp[]): OccurrenceGroup[] {
  const groups = new Map<string, OccurrenceGroup & { mealMap: Map<string, number> }>()
  const sorted = [...rsvps].sort((a, b) => Date.parse(a.occurrenceDate) - Date.parse(b.occurrenceDate) || a.id - b.id)
  for (const r of sorted) {
    const iso = new Date(r.occurrenceDate).toISOString()
    let g = groups.get(iso)
    if (!g) {
      g = { iso, going: [], notGoing: [], tally: { yes: 0, no: 0 }, meals: [], noDinner: 0, mealMap: new Map() }
      groups.set(iso, g)
    }
    if (r.response === 'no') {
      g.notGoing.push(r)
      g.tally.no++
    } else {
      g.going.push(r)
      g.tally.yes++
      const meal = r.meal ?? ''
      if (meal) g.mealMap.set(meal, (g.mealMap.get(meal) ?? 0) + 1)
      else g.noDinner++
    }
  }
  return [...groups.values()].map(({ mealMap, ...g }) => ({ ...g, meals: [...mealMap.entries()] }))
}
