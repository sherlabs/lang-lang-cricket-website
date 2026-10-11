import { VOTES } from '@/config/site'

/**
 * Best-player vote settings (wave B spec 3.2). Pure: the `selection-settings` global stores the raw fields, `settingsFrom` turns
 * whatever is stored into a safe, defaulted object so a corrupt row can never crash a page, and `parseBallotValues` is the single
 * rule the admin form, the settings action and the tally all share.
 */
export type PublicScope = 'club' | 'grade' | 'both'
export type VoteSettings = {
  enabled: boolean
  allowSelfVote: boolean
  ballotValues: number[]
  tieBreakFewestGames: boolean
  voteWindowDays: number
  editWindowHours: number
  minBallotsToCount: number
  publicLeaderboard: boolean
  publicScope: PublicScope
  publicShowBreakdown: boolean
}

export const DEFAULT_BALLOT_VALUES = [3, 2, 1]
export const DEFAULT_VOTE_SETTINGS: VoteSettings = {
  enabled: false,
  allowSelfVote: false,
  ballotValues: DEFAULT_BALLOT_VALUES,
  tieBreakFewestGames: false,
  voteWindowDays: 7,
  editWindowHours: 24,
  minBallotsToCount: 5,
  publicLeaderboard: false,
  publicScope: 'club',
  publicShowBreakdown: true,
}

/** `"3,2,1"` to `[3,2,1]`: one to five positive whole numbers in strictly descending order, else null. */
export function parseBallotValues(input: unknown): number[] | null {
  if (Array.isArray(input)) return validValues(input.map((v) => (typeof v === 'number' ? v : Number.NaN)))
  if (typeof input !== 'string') return null
  const text = input.trim()
  // "3,2,1", "3 2 1" and the displayed "3-2-1" all read the same; a minus sign anywhere else is not a number.
  const parts = (/^\d+(?:-\d+)+$/.test(text) ? text.split('-') : text.split(/[,\s]+/)).map((s) => s.trim()).filter(Boolean)
  if (!parts.length || parts.some((p) => !/^\d{1,3}$/.test(p))) return null
  return validValues(parts.map(Number))
}
function validValues(values: number[]): number[] | null {
  if (values.length < 1 || values.length > VOTES.maxPlaces) return null
  if (values.some((v) => !Number.isInteger(v) || v < 1)) return null
  for (let i = 1; i < values.length; i++) if (values[i] >= values[i - 1]) return null
  return values
}
/** For the admin field `validate`. */
export const validateBallotValues = (v: unknown): true | string =>
  v == null || v === '' || parseBallotValues(v) ? true : `Use whole numbers from highest to lowest, at most ${VOTES.maxPlaces}, for example 3,2,1.`

const int = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** The parsed settings from the raw `votes` group of the global (or the global itself). Never throws. */
export function settingsFrom(raw: unknown): VoteSettings {
  const g = (raw && typeof raw === 'object' && 'votes' in raw ? (raw as { votes?: unknown }).votes : raw) as Record<string, unknown> | null | undefined
  const d = DEFAULT_VOTE_SETTINGS
  if (!g || typeof g !== 'object') return { ...d, ballotValues: [...d.ballotValues] }
  const scope = g.publicScope
  return {
    enabled: g.enabled === true,
    allowSelfVote: g.allowSelfVote === true,
    ballotValues: parseBallotValues(g.ballotValues) ?? [...d.ballotValues],
    tieBreakFewestGames: g.tieBreakFewestGames === true,
    voteWindowDays: int(g.voteWindowDays, d.voteWindowDays, 1, 60),
    editWindowHours: int(g.editWindowHours, d.editWindowHours, 0, 24 * 14),
    minBallotsToCount: int(g.minBallotsToCount, d.minBallotsToCount, VOTES.minBallotsFloor, 100),
    publicLeaderboard: g.publicLeaderboard === true,
    publicScope: scope === 'grade' || scope === 'both' ? scope : 'club',
    publicShowBreakdown: g.publicShowBreakdown !== false,
  }
}

/** The values as shown to people: "3-2-1". */
export const ballotValuesLabel = (values: readonly number[]): string => values.join('-')

/** Which public scopes a setting allows. */
export const scopeAllows = (s: Pick<VoteSettings, 'publicScope'>, scope: 'club' | 'grade'): boolean => s.publicScope === 'both' || s.publicScope === scope

/** The settings-screen warning when votes are on and some voters still use a default last-4 PIN. */
export function pinWarning(defaultPinPlayers: number): string | null {
  if (defaultPinPlayers < 1) return null
  const who = defaultPinPlayers === 1 ? '1 player still uses' : `${defaultPinPlayers} players still use`
  return `${who} a PIN made from the last 4 digits of their phone number, so a family member could vote as them. Set a manual 6-digit PIN for them, or accept the risk.`
}

/** Suggested minimum from the typical number of voters per recent game (about 40%, never under the floor). */
export const suggestedMinimum = (avgVoters: number): number => Math.max(VOTES.minBallotsFloor, Math.round(avgVoters * 0.4))
