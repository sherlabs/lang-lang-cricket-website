import { searchTextOf } from './game-rows'
import type { SourceChoice } from './types'

/** The picker's pure logic (wave G spec WP-2a): search, grouping, the four-item limit and keyboard movement. No React here. */
export const MULTI_LIMIT = 4

/** Choices whose words contain every word typed (so "hill won" finds a game against Hilltop that the club won). Empty query keeps all. */
export function filterChoices(choices: readonly SourceChoice[], query: string, locale: string): SourceChoice[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...choices]
  return choices.filter((c) => {
    const hay = c.row ? searchTextOf(c.row, c.label, locale) : c.label.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export type ChoiceGroup = { heading: string; choices: SourceChoice[] }

/** Rows grouped under their own heading (a game's round or month), in the order the groups first appear; rows with no heading come first. */
export function groupChoices(choices: readonly SourceChoice[]): ChoiceGroup[] {
  const groups: ChoiceGroup[] = []
  for (const c of choices) {
    const heading = c.row?.kind === 'game' ? c.row.group : ''
    let g = groups.find((x) => x.heading === heading)
    if (!g) { g = { heading, choices: [] }; groups.push(g) }
    g.choices.push(c)
  }
  return groups.sort((a, b) => Number(b.heading === '') - Number(a.heading === ''))
}

/** Add or remove `id`. Adding beyond `limit` is refused (the list is unchanged and `full` is true) so the person is told, not surprised. */
export function toggleMulti(selected: readonly string[], id: string, limit = MULTI_LIMIT): { ids: string[]; full: boolean } {
  if (selected.includes(id)) return { ids: selected.filter((x) => x !== id), full: false }
  if (selected.length >= limit) return { ids: [...selected], full: true }
  return { ids: [...selected, id], full: false }
}

export type PickerKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'
/** The next highlighted row for a key, clamped to the list (no wrap, so End and Home are predictable). -1 means nothing highlighted yet. */
export function moveActive(current: number, key: PickerKey, count: number): number {
  if (count === 0) return -1
  switch (key) {
    case 'ArrowDown': return Math.min(count - 1, current + 1)
    case 'ArrowUp': return current <= 0 ? 0 : current - 1
    case 'Home': return 0
    case 'End': return count - 1
  }
}
