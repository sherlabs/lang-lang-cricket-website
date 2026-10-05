import type { Answer } from '../availability'
import { balanceCounts, type RoleOrUnknown } from './roles'
import type { XiSize } from './team-sheet'

/**
 * Warnings on a team sheet (announce-teams spec 5.2). The builder shows them on every render and the publish action runs the same
 * function, so they never disagree. Plain text; only the ones marked `blocking` stop a publish (the rest are shown on the confirm
 * dialog with a "Publish anyway" tick).
 */
export type WarningCode =
  | 'empty' | 'over-size' | 'bad-guest' | 'player-hidden' | 'player-missing'
  | 'player-out' | 'double-booked' | 'no-keeper' | 'no-captain' | 'few-bowlers' | 'few-batters' | 'unknown-roles' | 'short-of-size' | 'fixture-removed' | 'fixture-moved'

export type Warning = { code: WarningCode; text: string; blocking: boolean; strong: boolean }

export type WarnSlot = {
  name: string
  kind: 'player' | 'guest'
  role: RoleOrUnknown
  isCaptain: boolean
  isKeeper: boolean
  hidden?: boolean
  missing?: boolean
  badGuest?: boolean
  answer?: Answer
  /** Grade name of another side this player is picked in on the same day, if any. */
  alsoPickedIn?: string | null
}

export type WarnInput = { slots: readonly WarnSlot[]; size: XiSize; fixtureStatus: 'upcoming' | 'final' | 'removed'; fixtureMovedSinceSave: boolean }

export const MIN_BOWLERS = 5
export const MIN_BATTERS = 5
export const MAX_UNKNOWN_ROLES = 3

const w = (code: WarningCode, text: string, o: { blocking?: boolean; strong?: boolean } = {}): Warning => ({ code, text, blocking: Boolean(o.blocking), strong: Boolean(o.strong) })

export function teamWarnings(input: WarnInput): Warning[] {
  const { slots, size } = input
  const out: Warning[] = []
  if (slots.length === 0) out.push(w('empty', 'Nobody is picked yet.', { blocking: true }))
  if (size > 0 && slots.length > size) out.push(w('over-size', `${slots.length} places for a team of ${size}.`, { blocking: true }))
  for (const s of slots) {
    if (s.badGuest) out.push(w('bad-guest', `“${s.name}” is not a valid guest name.`, { blocking: true }))
    if (s.missing) out.push(w('player-missing', `${s.name} is no longer on the player list.`, { blocking: true }))
    else if (s.hidden) out.push(w('player-hidden', `${s.name} is hidden on the public site. Take them out or un-hide them before publishing.`, { blocking: true }))
    if (s.answer === 'out') out.push(w('player-out', `${s.name} said they are out for this game.`, { strong: true }))
    if (s.alsoPickedIn) out.push(w('double-booked', `${s.name} is also picked in ${s.alsoPickedIn} the same day.`, { strong: true }))
  }
  if (slots.length > 0) {
    const counts = balanceCounts(slots)
    if (counts.keepers === 0) out.push(w('no-keeper', 'No wicketkeeper (tag one with WK).'))
    if (!slots.some((s) => s.isCaptain)) out.push(w('no-captain', 'No captain (tag one with C).'))
    if (counts.bowlers < MIN_BOWLERS) out.push(w('few-bowlers', `Only ${counts.bowlers} bowling options (aim for ${MIN_BOWLERS} or more).`))
    if (counts.batters < MIN_BATTERS) out.push(w('few-batters', `Only ${counts.batters} batters (aim for ${MIN_BATTERS} or more).`))
    if (counts.unknown > MAX_UNKNOWN_ROLES) out.push(w('unknown-roles', `${counts.unknown} players have no role set, so the balance is a guess.`))
    if (size > 0 && slots.length < size) out.push(w('short-of-size', `${slots.length} picked, ${size} needed.`))
  }
  if (input.fixtureStatus === 'removed') out.push(w('fixture-removed', 'This game has been removed or moved on PlayHQ.', { strong: true }))
  else if (input.fixtureMovedSinceSave) out.push(w('fixture-moved', 'The game changed time or day on PlayHQ since this team was saved.'))
  return out
}

export const blockingWarnings = (list: readonly Warning[]): Warning[] => list.filter((x) => x.blocking)
