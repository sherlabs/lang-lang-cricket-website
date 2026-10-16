import { credits, type FantasyRules } from './rules'

/**
 * Squad rules (wave F spec 4.5). Pure. The server runs every check again on each save, whatever the browser sent. The clock and the
 * lock are injected. A price is the CURRENT price, so a price changed after a save never invalidates that save; it applies the next
 * time the manager saves.
 */
export type PoolPlayer = { priceTenths: number; /** Priced, visible, senior and not removed from the pool. */ inGame: boolean }

export type SquadCheckInput = {
  picks: readonly number[]
  captain: number | null
  pool: ReadonlyMap<number, PoolPlayer>
  rules: Pick<FantasyRules, 'squadSize' | 'salaryCapTenths' | 'transfersPerRound'>
  /** The manager's squad for the previous round (the squad being changed), or null for a first squad. */
  previous: readonly number[] | null
  now: Date
  lock: Date
}

export type SquadError =
  | 'locked' | 'size' | 'duplicate' | 'unknown' | 'ineligible' | 'cap' | 'captain' | 'captainOut' | 'transfers'
export type SquadCheck = { ok: true; spentTenths: number; transfersUsed: number } | { ok: false; code: SquadError; message: string }

const fail = (code: SquadError, message: string): SquadCheck => ({ ok: false, code, message })

/** New players beyond the free replacements of people who are no longer in the game. */
export function countTransfers(previous: readonly number[] | null, picks: readonly number[], pool: ReadonlyMap<number, PoolPlayer>): number {
  if (!previous) return 0
  const prev = new Set(previous)
  const next = new Set(picks)
  const added = picks.filter((p) => !prev.has(p)).length
  // A previous pick who is gone from the game and is not kept frees one swap.
  const freeSwaps = previous.filter((p) => !next.has(p) && !pool.get(p)?.inGame).length
  return Math.max(0, added - freeSwaps)
}

export function checkSquad(i: SquadCheckInput): SquadCheck {
  if (i.now.getTime() >= i.lock.getTime()) return fail('locked', 'This round has locked. Squads cannot change after the first game starts.')
  if (i.picks.length !== i.rules.squadSize) return fail('size', `Pick exactly ${i.rules.squadSize} players.`)
  if (new Set(i.picks).size !== i.picks.length) return fail('duplicate', 'Each player can be in your squad once.')
  let spent = 0
  for (const id of i.picks) {
    if (!Number.isInteger(id)) return fail('unknown', 'One of those players is not in the game.')
    const p = i.pool.get(id)
    if (!p) return fail('unknown', 'One of those players is not in the game.')
    if (!p.inGame) return fail('ineligible', 'One of those players is no longer in the game. Replace them before saving.')
    spent += p.priceTenths
  }
  if (spent > i.rules.salaryCapTenths) {
    const over = spent - i.rules.salaryCapTenths
    return fail('cap', `Your squad is over the cap by ${credits(over)}.`)
  }
  if (i.captain === null || !i.picks.includes(i.captain)) return fail('captain', 'Choose a captain from your squad.')
  if (!i.pool.get(i.captain)?.inGame) return fail('captainOut', 'Your captain is no longer in the game. Choose another.')
  const used = countTransfers(i.previous, i.picks, i.pool)
  if (i.previous && i.rules.transfersPerRound > 0 && used > i.rules.transfersPerRound) {
    return fail('transfers', `You can change ${i.rules.transfersPerRound} ${i.rules.transfersPerRound === 1 ? 'player' : 'players'} a round. This squad changes ${used}.`)
  }
  return { ok: true, spentTenths: spent, transfersUsed: used }
}

/** Picks that are no longer in the game, so the page can say "Replace <name> before the lock". */
export const outOfGame = (picks: readonly number[], pool: ReadonlyMap<number, PoolPlayer>): number[] => picks.filter((p) => !pool.get(p)?.inGame)
