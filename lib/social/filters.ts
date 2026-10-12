import type { StoredInnings } from '@/lib/match-store/queries'
import type { LineupPlayer } from './specs/lineup'
import type { ResultPlayerLine } from './specs/result'

/**
 * The pure rules that keep names off pictures (wave C spec section 1). Each takes a yes/no for "may this player appear" so the
 * server loaders and the unit tests use the same code.
 */
type Slot = { order: number; name: string; slug: string | null; isCaptain: boolean; isKeeper: boolean; withheld: boolean; guest: boolean }

export const GUEST_NAME = 'Guest player'

/**
 * Lineup rows for a picture. A name already withheld on the site stays withheld. Everyone else must be a visible player we know and
 * who is eligible; a guest has no record to check, so the name is not drawn. Ineligible players are dropped.
 */
export function lineupRows(slots: readonly Slot[], eligibleBySlug: ReadonlyMap<string, boolean>, withheldName: string): LineupPlayer[] {
  const out: LineupPlayer[] = []
  for (const s of slots) {
    const base = { order: s.order, captain: s.isCaptain, keeper: s.isKeeper }
    if (s.withheld || s.name === withheldName) out.push({ ...base, name: withheldName })
    else if (s.guest || !s.slug) out.push({ ...base, name: GUEST_NAME })
    else if (eligibleBySlug.get(s.slug) === true) out.push({ ...base, name: s.name })
  }
  return out
}

/** Top club batters of a game (best first), only players `ok` lets through. Opposition rows and rows with no club player are never used. */
export function topBatters(innings: readonly StoredInnings[], ok: (playerId: number | null) => boolean, limit = 5): ResultPlayerLine[] {
  return innings
    .flatMap((i) => i.batting)
    .filter((b) => b.isClubSide && ok(b.playerId))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, limit)
    .map((b) => ({ name: b.name, figures: `${b.runs}${b.status === 'not_out' ? '*' : ''}${b.balls != null ? ` (${b.balls})` : ''}` }))
}

export function topBowlers(innings: readonly StoredInnings[], ok: (playerId: number | null) => boolean, limit = 5): ResultPlayerLine[] {
  return innings
    .flatMap((i) => i.bowling)
    .filter((b) => b.isClubSide && ok(b.playerId) && b.balls > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
    .slice(0, limit)
    .map((b) => ({ name: b.name, figures: `${b.wickets}/${b.runs}` }))
}
