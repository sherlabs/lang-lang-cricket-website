import { normaliseClubName } from '@/lib/stats/match/opposition-key'

/**
 * Links an upcoming game to a stored opposition (finding 4 of the wave E spec): selection fixtures carry only a name, no organisation id,
 * so the match is by normalised name against every name stored for the opposition (organisation and team). Nothing matches by guessing:
 * two different clubs whose names normalise alike both come back (`many`), and no match is `none`.
 */
export type OpponentOption = { key: string; label: string; /** Normalised organisation and team names stored for this opposition. */ names: readonly string[] }
export type Resolved = { kind: 'none' } | { kind: 'one'; key: string; label: string } | { kind: 'many'; candidates: { key: string; label: string }[] }

export function resolveOpponent(name: string | null | undefined, options: readonly OpponentOption[]): Resolved {
  const wanted = normaliseClubName(name)
  if (!wanted) return { kind: 'none' }
  const hits = options.filter((o) => o.names.includes(wanted))
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length === 1) return { kind: 'one', key: hits[0].key, label: hits[0].label }
  return { kind: 'many', candidates: hits.map((h) => ({ key: h.key, label: h.label })).sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)) }
}
