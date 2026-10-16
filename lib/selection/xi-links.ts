import { selectorPaths } from '../../config/site'

/**
 * The suggestion page keeps its overrides in the query string (nothing is stored): `pin` (must play), `leave` (leave out) and `keeper`.
 * These build the toggle links; the server validates every id against the squad pool, so a hand-edited address cannot add anyone.
 */
export type XiState = { pins: readonly number[]; leaves: readonly number[]; keeperId: number | null }

const without = (xs: readonly number[], id: number) => xs.filter((x) => x !== id)
const toggle = (xs: readonly number[], id: number) => (xs.includes(id) ? without(xs, id) : [...xs, id])

export function suggestHref(gameId: string, s: XiState): string {
  const q = new URLSearchParams()
  if (s.pins.length) q.set('pin', [...s.pins].sort((a, b) => a - b).join(','))
  if (s.leaves.length) q.set('leave', [...s.leaves].sort((a, b) => a - b).join(','))
  if (s.keeperId != null) q.set('keeper', String(s.keeperId))
  const qs = q.toString()
  return `${selectorPaths.suggestFor(gameId)}${qs ? `?${qs}` : ''}`
}

/** Pin on/off. Pinning also takes the player out of the leave list. */
export const pinned = (s: XiState, id: number): XiState => ({ pins: toggle(s.pins, id), leaves: without(s.leaves, id), keeperId: s.keeperId })
/** Leave out on/off. Leaving a player out also un-pins them and clears them as keeper. */
export const left = (s: XiState, id: number): XiState => ({ pins: without(s.pins, id), leaves: toggle(s.leaves, id), keeperId: s.keeperId === id ? null : s.keeperId })
/** Make a player the keeper (one tap); tapping the keeper again clears the choice. */
export const keeper = (s: XiState, id: number): XiState => ({ pins: without(s.pins, id), leaves: without(s.leaves, id), keeperId: s.keeperId === id ? null : id })
