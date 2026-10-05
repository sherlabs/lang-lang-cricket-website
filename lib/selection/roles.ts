/**
 * Roles for selection (announce-teams spec 5.2). A stored role (the selectors' own view of a player) wins; otherwise one is
 * suggested from the stats. A suggestion is a prompt, never a verdict: with too little data the answer is "unknown".
 */
export type Role = 'batter' | 'bowler' | 'all-rounder' | 'keeper'
export type RoleOrUnknown = Role | 'unknown'
export const ROLE_LABEL: Record<RoleOrUnknown, string> = { batter: 'Batter', bowler: 'Bowler', 'all-rounder': 'All-rounder', keeper: 'Keeper', unknown: 'Role not set' }

export const BOWLER_MIN_BALLS = 120
export const BATTER_MAX_BALLS = 30
/** A bowler who averages at least this with the bat is an all-rounder. */
export const LOW_BAT_AVERAGE = 15

export type RoleEvidence = {
  canKeep: boolean
  /** Keeper catches plus stumpings in stored games. */
  keeperActions: number
  /** Balls bowled over the last two seasons. */
  bowlBalls: number
  batInnings: number
  batRuns: number
  batNotOuts: number
}

export function suggestRole(e: RoleEvidence): RoleOrUnknown {
  if (e.canKeep || e.keeperActions > 0) return 'keeper'
  if (e.bowlBalls >= BOWLER_MIN_BALLS) {
    const dismissals = e.batInnings - e.batNotOuts
    const average = dismissals > 0 ? e.batRuns / dismissals : e.batInnings > 0 ? e.batRuns : 0
    return average >= LOW_BAT_AVERAGE ? 'all-rounder' : 'bowler'
  }
  if (e.bowlBalls < BATTER_MAX_BALLS && e.batInnings > 0) return 'batter'
  return 'unknown'
}

export const effectiveRole = (stored: Role | null | undefined, suggested: RoleOrUnknown): RoleOrUnknown => stored ?? suggested

export type BalanceCounts = { batters: number; bowlers: number; keepers: number; unknown: number }

/** Batters count batters and all-rounders; bowlers count bowlers and all-rounders; a tagged keeper counts as a keeper. */
export function balanceCounts(players: readonly { role: RoleOrUnknown; isKeeper?: boolean }[]): BalanceCounts {
  const out: BalanceCounts = { batters: 0, bowlers: 0, keepers: 0, unknown: 0 }
  for (const p of players) {
    if (p.role === 'batter' || p.role === 'all-rounder') out.batters += 1
    if (p.role === 'bowler' || p.role === 'all-rounder') out.bowlers += 1
    if (p.role === 'keeper' || p.isKeeper) out.keepers += 1
    if (p.role === 'unknown') out.unknown += 1
  }
  return out
}
