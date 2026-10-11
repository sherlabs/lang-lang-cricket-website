import { VOTES } from '@/config/site'

export { editWindowOpen } from './status'

/**
 * Who may vote and who may be nominated, and what a valid ballot is (wave B spec 3.4). Pure.
 */
export type BallotPick = { place: number; playerId: number }

/**
 * The club's players in a game: the published team sheet's players when there is one, else the stored match's club-side
 * appearances. Guests and hidden players are never nominees. Sorted by id so the result is stable.
 */
export function nomineesFor(i: { sheetPlayerIds: readonly number[] | null | undefined; appearancePlayerIds: readonly number[] | null | undefined; hiddenIds?: ReadonlySet<number> }): number[] {
  const source = i.sheetPlayerIds && i.sheetPlayerIds.length ? i.sheetPlayerIds : (i.appearancePlayerIds ?? [])
  return [...new Set(source)].filter((id) => Number.isInteger(id) && !i.hiddenIds?.has(id)).sort((a, b) => a - b)
}

/** A player can vote in a game they were a nominee in. */
export const canVote = (voterPlayerId: number, nomineeIds: readonly number[]): boolean => nomineeIds.includes(voterPlayerId)

/** Players this voter may pick: the nominees, minus themselves unless self-votes are allowed. */
export function pickableFor(nomineeIds: readonly number[], voterPlayerId: number | null, allowSelfVote: boolean): number[] {
  return nomineeIds.filter((id) => allowSelfVote || voterPlayerId == null || id !== voterPlayerId)
}

/** How many places this ballot must fill: one per ballot value, or fewer when there are fewer people to pick. */
export const placesRequired = (valuesCount: number, pickable: number): number => Math.min(valuesCount, pickable)

export type BallotError = 'no_nominees' | 'missing' | 'duplicate' | 'not_nominee' | 'self' | 'bad_input'
export type BallotResult = { ok: true; picks: BallotPick[] } | { ok: false; code: BallotError; message: string }
export const BALLOT_MESSAGES: Record<BallotError, string> = {
  no_nominees: 'There is nobody to vote for in this game.',
  missing: 'Please choose a player for every vote.',
  duplicate: 'Please choose a different player for each vote.',
  not_nominee: 'One of those players was not in this game.',
  self: 'You cannot vote for yourself.',
  bad_input: 'Something went wrong. Please try again.',
}
const fail = (code: BallotError): BallotResult => ({ ok: false, code, message: BALLOT_MESSAGES[code] })

/** Checks a ballot against the nominees and the places, and returns the picks sorted by place. */
export function validateBallot(picks: readonly BallotPick[], nomineeIds: readonly number[], valuesCount: number, voterPlayerId: number | null, allowSelfVote: boolean): BallotResult {
  if (!Array.isArray(picks) || valuesCount < 1 || valuesCount > VOTES.maxPlaces) return fail('bad_input')
  const pickable = pickableFor(nomineeIds, voterPlayerId, allowSelfVote)
  const k = placesRequired(valuesCount, pickable.length)
  if (k < 1) return fail('no_nominees')
  const seenPlace = new Set<number>()
  const seenPlayer = new Set<number>()
  for (const p of picks) {
    if (!p || !Number.isInteger(p.place) || !Number.isInteger(p.playerId) || p.place < 1 || p.place > k || seenPlace.has(p.place)) return fail('bad_input')
    seenPlace.add(p.place)
    if (seenPlayer.has(p.playerId)) return fail('duplicate')
    seenPlayer.add(p.playerId)
    if (!allowSelfVote && voterPlayerId != null && p.playerId === voterPlayerId) return fail('self')
    if (!nomineeIds.includes(p.playerId)) return fail('not_nominee')
  }
  if (picks.length !== k) return fail('missing')
  return { ok: true, picks: [...picks].sort((a, b) => a.place - b.place) }
}

/** Reads `place_1`, `place_2`... from a form (a `get` function so it works on FormData and in tests). Blank selections are left out. */
export function picksFromForm(get: (name: string) => unknown, valuesCount: number): BallotPick[] | null {
  const out: BallotPick[] = []
  for (let place = 1; place <= Math.min(valuesCount, VOTES.maxPlaces); place++) {
    const raw = get(`place_${place}`)
    if (raw == null || raw === '') continue
    if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) return null
    out.push({ place, playerId: Number(raw) })
  }
  return out
}

/** The word on a vote select: "3 votes", "1 vote". */
export const voteWord = (value: number): string => `${value} ${value === 1 ? 'vote' : 'votes'}`
