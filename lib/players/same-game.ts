/**
 * Two players who appear in the same game cannot be one person (W2 spec 6.2). Merging them would put one player on both
 * sides of a partnership and count the game twice, so a merge is refused (and a suggestion vetoed) when they share a match.
 * Pure: the caller supplies the appearance rows.
 */
export type AppearanceLink = { match: number; player: number }

export const pairId = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Match ids that both players appear in, sorted. */
export function sharedMatches(appearances: readonly AppearanceLink[], a: number, b: number): number[] {
  const ofA = new Set<number>(), ofB = new Set<number>()
  for (const r of appearances) {
    if (r.player === a) ofA.add(r.match)
    else if (r.player === b) ofB.add(r.match)
  }
  return [...ofA].filter((m) => ofB.has(m)).sort((x, y) => x - y)
}

/** Every pair among `pairs` that shares at least one match, as `pairId` keys. */
export function pairsSharingMatches(appearances: readonly AppearanceLink[], pairs: readonly [number, number][]): Set<string> {
  const byPlayer = new Map<number, Set<number>>()
  for (const r of appearances) byPlayer.set(r.player, (byPlayer.get(r.player) ?? new Set()).add(r.match))
  const out = new Set<string>()
  for (const [a, b] of pairs) {
    const ma = byPlayer.get(a), mb = byPlayer.get(b)
    if (ma && mb && [...ma].some((m) => mb.has(m))) out.add(pairId(a, b))
  }
  return out
}

/** The plain-English refusal that names the shared games. */
export function sameGameMessage(sourceName: string, targetName: string, games: readonly { date: string | null; opponent: string | null }[]): string {
  const named = games.slice(0, 3).map((g) => [g.date, g.opponent ? `against ${g.opponent}` : null].filter(Boolean).join(' ') || 'a game')
  const more = games.length > 3 ? ` and ${games.length - 3} more` : ''
  return `${sourceName} and ${targetName} both played in ${named.join('; ')}${more}, so they cannot be the same person. If one person really is listed twice in a game, confirm twice to merge anyway.`
}
