import { FANTASY } from '@/config/site'

/**
 * Team names (wave F spec 4.4). A name is shown on the leaderboard, so it is short, plain text and rendered escaped. `nameKey` is
 * the normalised form that is unique per season, so a name cannot be impersonated by case, accents, spacing or punctuation.
 */
const ALLOWED = /^[\p{L}\p{N} '’.,&!_-]+$/u

/** Trim and collapse whitespace. */
export const cleanTeamName = (raw: string): string => raw.normalize('NFC').replace(/\s+/g, ' ').trim()

/** Case, accents, spacing and punctuation folded away: "The  Ducks!" and "the ducks" are the same name. */
export function nameKeyOf(name: string): string {
  return cleanTeamName(name)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export type NameCheck = { ok: true; name: string; key: string } | { ok: false; message: string }

export const NAME_UNAVAILABLE = 'That name is not available. Try another.'

/**
 * Shape only: length, characters. A taken name and a blocked name must read identically, so those two are decided by the caller and
 * both answer `NAME_UNAVAILABLE` through the same path.
 */
export function checkNameShape(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, message: 'Type a team name.' }
  const name = cleanTeamName(raw)
  if (name.length < FANTASY.teamNameMin || name.length > FANTASY.teamNameMax) return { ok: false, message: `A team name is ${FANTASY.teamNameMin} to ${FANTASY.teamNameMax} characters.` }
  if (!ALLOWED.test(name)) return { ok: false, message: 'Use letters, numbers, spaces and basic punctuation only.' }
  const key = nameKeyOf(name)
  if (key.length < 2) return { ok: false, message: 'Use letters or numbers in the team name.' }
  return { ok: true, name, key }
}

/** Does the name contain one of the blocked words (compared in the folded form, so spacing tricks do not help)? */
export function isBlockedName(key: string, blockedWords: readonly string[]): boolean {
  return blockedWords.some((w) => {
    const k = nameKeyOf(w)
    return k.length > 0 && key.includes(k)
  })
}
