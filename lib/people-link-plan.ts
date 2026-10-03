import { normaliseName } from './identity'

export type PlanPerson = { id: number; name: string; playerId: number | null }
export type PlanPlayer = { id: number; name: string; hidden?: boolean }

export type LinkPlan = {
  /** Safe to write: one person, one player, exact normalised-name match, neither already linked. */
  matches: { personId: number; personName: string; playerId: number; playerName: string; playerHidden: boolean }[]
  /** Needs a human: several players share the name, or several people claim one player. */
  ambiguous: { personId: number; personName: string; reason: string; playerIds: number[] }[]
  /** No player has this exact name. */
  unmatched: { personId: number; personName: string }[]
  /** Person already has a player (or the player already has a person): left alone. */
  alreadyLinked: { personId: number; personName: string; playerId: number }[]
}

/**
 * Proposes people -> players links by EXACT normalised name (case, accents, punctuation and
 * spacing folded; no fuzzy matching, no initials). Never guesses: anything that is not a clean
 * one-to-one match is reported, not proposed.
 */
export function planLinks(people: readonly PlanPerson[], players: readonly PlanPlayer[]): LinkPlan {
  const plan: LinkPlan = { matches: [], ambiguous: [], unmatched: [], alreadyLinked: [] }
  const byName = new Map<string, PlanPlayer[]>()
  for (const p of players) {
    const key = normaliseName(p.name)
    if (key) byName.set(key, [...(byName.get(key) ?? []), p])
  }
  const takenPlayers = new Set(people.filter((p) => p.playerId).map((p) => p.playerId as number))

  const candidates: { person: PlanPerson; player: PlanPlayer }[] = []
  for (const person of people) {
    if (person.playerId) {
      plan.alreadyLinked.push({ personId: person.id, personName: person.name, playerId: person.playerId })
      continue
    }
    const found = byName.get(normaliseName(person.name)) ?? []
    if (found.length === 0) plan.unmatched.push({ personId: person.id, personName: person.name })
    else if (found.length > 1) plan.ambiguous.push({ personId: person.id, personName: person.name, reason: 'several players have this name', playerIds: found.map((f) => f.id) })
    else if (takenPlayers.has(found[0].id)) plan.ambiguous.push({ personId: person.id, personName: person.name, reason: 'that player is already linked to someone else', playerIds: [found[0].id] })
    else candidates.push({ person, player: found[0] })
  }
  // Two people claiming one player: propose neither.
  const claims = new Map<number, number>()
  for (const c of candidates) claims.set(c.player.id, (claims.get(c.player.id) ?? 0) + 1)
  for (const { person, player } of candidates) {
    if ((claims.get(player.id) ?? 0) > 1) {
      plan.ambiguous.push({ personId: person.id, personName: person.name, reason: 'several people have this name', playerIds: [player.id] })
    } else {
      plan.matches.push({ personId: person.id, personName: person.name, playerId: player.id, playerName: player.name, playerHidden: Boolean(player.hidden) })
    }
  }
  return plan
}
