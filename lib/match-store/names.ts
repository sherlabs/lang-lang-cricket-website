import type { BattingStatus, DismissalType } from '@/lib/playhq/match-rows'
import { titleCase } from '@/lib/playhq/names'

/**
 * Pure name rules for stored matches (WP-M, spec M2/M5). Club-side people are never stored as
 * text: a row's name comes from its `player` link at read time, so a hidden player is kept out of
 * every match view, including inside a dismissal ("c X b Y"). Every W2 page must use these.
 */
export const HIDDEN_CLUB_NAME = 'a club player'
export const UNKNOWN_NAME = 'Unknown'

export type PlayerNames = ReadonlyMap<number, { name: string; hidden: boolean }>
export type NameRow = { player: number | null; displayName: string | null }

/**
 * A club-side row has a `player` link (hidden players and unresolved rows give "a club player");
 * an opposition row has a stored `displayName`.
 */
export function resolveRowName(row: NameRow, players: PlayerNames): string {
  if (row.player != null) {
    const p = players.get(row.player)
    return !p || p.hidden || !p.name.trim() ? HIDDEN_CLUB_NAME : p.name
  }
  return row.displayName?.trim() ? row.displayName : row.displayName === null ? HIDDEN_CLUB_NAME : UNKNOWN_NAME
}

/** The scorecard text for a dismissal, built from the already-resolved bowler and fielder names (same wording as `dismissalText`). */
export function formatDismissal(status: BattingStatus, type: DismissalType | null, bowler: string | null, fielder: string | null): string {
  if (status === 'not_out') return 'not out'
  if (status === 'did_not_bat') return 'did not bat'
  const b = bowler ?? '?'
  const f = fielder ?? '?'
  switch (type) {
    case null: return status === 'out' ? 'out' : ''
    case 'caught': return `c ${f} b ${b}`
    case 'caught_and_bowled': return `c & b ${b}`
    case 'bowled': return `b ${b}`
    case 'lbw': return `lbw b ${b}`
    case 'stumped': return `st ${f} b ${b}`
    case 'run_out': return fielder ? `run out (${fielder})` : 'run out'
    case 'hit_wicket': return `hit wicket b ${b}`
    case 'retired_hurt': return 'retired hurt'
    case 'retired': return 'retired'
    case 'retired_out': return 'retired out'
    default: return 'out'
  }
}

/** "Jon Smith" from a `first|last` name key (senior display policy: full names). */
export function displayNameFromKey(nameKey: string): string {
  const [first = '', last = ''] = nameKey.split('|')
  return [titleCase(first), titleCase(last)].filter(Boolean).join(' ')
}
