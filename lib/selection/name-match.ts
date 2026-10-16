import { normaliseName } from '@/lib/identity'

/**
 * Matching a typed name to players (announce-teams spec 4.5). The name is "as on PlayHQ": compared with the same key
 * `player-aliases` uses (`normaliseName`), against the full name, the display name and the preferred name with the surname.
 */
export type NameablePlayer = { id: number; firstName?: string | null; lastName?: string | null; preferredName?: string | null; displayName?: string | null }

export function nameKeysOf(p: NameablePlayer): string[] {
  const keys = new Set<string>()
  const add = (v: string) => {
    const k = normaliseName(v)
    if (k) keys.add(k)
  }
  add(`${p.firstName ?? ''} ${p.lastName ?? ''}`)
  if (p.displayName) add(p.displayName)
  if (p.preferredName) add(`${p.preferredName} ${p.lastName ?? ''}`)
  return [...keys]
}

/** Players whose name equals the typed name. Empty for a blank or absurdly long input. */
export function matchPlayers<T extends NameablePlayer>(typed: string, players: readonly T[]): T[] {
  if (typeof typed !== 'string' || typed.length > 120) return []
  const key = normaliseName(typed)
  if (!key) return []
  return players.filter((p) => nameKeysOf(p).includes(key))
}
