import type { Payload } from 'payload'
import { buildRounds, currentRound, type RoundView } from './rounds'
import { currentLock, liveFixturesOfWeekend } from './lock-server'
import { checkSquad, outOfGame, type PoolPlayer as SquadPool } from './squad'
import { squadFor } from './leaderboard'
import { FANTASY_TAG, getEntry, loadPool, loadRoundInputs, squadsOfEntry, type FantasySeason, type PoolPlayer, type SquadRowLite } from './store'
import { revalidatePaths } from '../../payload/hooks/revalidate'

/**
 * Saving a squad (wave F spec 4.5). Every rule runs again here on the server whatever the browser sent. The round is always the next
 * round whose lock is still in the future, worked out here and never taken from the form (the form's round is only compared with it).
 * The lock used is `min(stored lock, earliest start now)`, so a game moved earlier since the nightly sync still locks the round.
 */
export type SaveResult = { ok: true; round: string; spentTenths: number; transfersUsed: number } | { ok: false; message: string }

const asSquadPool = (pool: Map<number, PoolPlayer>): Map<number, SquadPool> => new Map([...pool].map(([id, p]) => [id, { priceTenths: p.priceTenths, inGame: p.inGame }]))

/** The round managers are picking for now, with the lock re-read from the current fixtures. */
export async function openRound(payload: Payload, season: FantasySeason, now: Date = new Date()): Promise<RoundView | null> {
  const inputs = await loadRoundInputs(payload, season.id)
  const rounds = buildRounds(inputs.fixtures, inputs.states, new Set(inputs.storedGameIds), now)
  return currentRound(rounds, now)
}

/** The squad in force for the round being picked, and the one before it (the base for the transfer count). */
export function squadsAround(all: readonly SquadRowLite[], round: string): { saved: SquadRowLite | null; previous: SquadRowLite | null; inForce: SquadRowLite | null } {
  const lb = all.map((s) => ({ entry: s.entry, round: s.round, picks: s.picks, captain: s.captain }))
  const saved = all.find((s) => s.round === round) ?? null
  const before = squadFor(lb.filter((s) => s.round < round), round)
  const previous = before ? (all.find((s) => s.round === before.round) ?? null) : null
  const inForce = saved ?? previous
  return { saved, previous, inForce }
}

export async function saveSquad(
  payload: Payload,
  season: FantasySeason,
  entryId: number,
  input: { round?: unknown; picks: unknown; captain: unknown },
  now: Date = new Date(),
): Promise<SaveResult> {
  const entry = await getEntry(payload, season.id, entryId)
  if (!entry || entry.disabled) return { ok: false, message: 'Please use your club link to sign in again.' }
  if (entry.mustChangePin) return { ok: false, message: 'Choose a new PIN before you pick a squad.' }
  const open = await openRound(payload, season, now)
  if (!open) return { ok: false, message: 'There is no round open for changes right now.' }
  if (typeof input.round === 'string' && input.round !== open.key) return { ok: false, message: 'The round has moved on. Reload the page to see the current round.' }
  const picks = Array.isArray(input.picks) ? input.picks.map((p) => (typeof p === 'number' ? p : Number(p))) : []
  if (picks.length > 20) return { ok: false, message: 'That is too many players.' }
  const captain = typeof input.captain === 'number' ? input.captain : input.captain === null || input.captain === undefined || input.captain === '' ? null : Number(input.captain)

  // The fresh lock: this also lowers the stored one when a game moved earlier, and is the lock the hook uses.
  const lock = await currentLock(payload, season.id, open.key)
  const pool = await loadPool(payload, season.id)
  const mine = await squadsOfEntry(payload, entryId)
  const { previous } = squadsAround(mine, open.key)
  const check = checkSquad({ picks, captain: Number.isFinite(captain as number) ? (captain as number) : null, pool: asSquadPool(pool), rules: season.rules, previous: previous ? previous.picks : null, now, lock })
  if (!check.ok) return { ok: false, message: check.message }

  const data = {
    entry: entryId, round: open.key, captain: captain as number, spentTenths: check.spentTenths, transfersUsed: check.transfersUsed,
    picks: picks.map((player) => ({ player })), savedAt: now.toISOString(),
  }
  const ctx = { disableRevalidate: true }
  const write = async (): Promise<boolean> => {
    const existing = await payload.find({ collection: 'fantasy-squads', where: { and: [{ entry: { equals: entryId } }, { round: { equals: open.key } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (existing.docs[0]) {
      await payload.update({ collection: 'fantasy-squads', id: existing.docs[0].id, data, overrideAccess: true, context: ctx })
      return true
    }
    try {
      await payload.create({ collection: 'fantasy-squads', data, overrideAccess: true, context: ctx })
      return true
    } catch {
      return false
    }
  }
  // A parallel save of the same round can win the create: the unique (entry, round) index refuses the second, which then updates.
  if (!(await write()) && !(await write())) return { ok: false, message: 'Could not save. Please try again.' }
  await revalidatePaths([], undefined, [FANTASY_TAG])
  return { ok: true, round: open.key, spentTenths: check.spentTenths, transfersUsed: check.transfersUsed }
}

export { outOfGame, liveFixturesOfWeekend }
