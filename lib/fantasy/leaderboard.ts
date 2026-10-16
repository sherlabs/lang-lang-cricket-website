/**
 * Leaderboard arithmetic (wave F spec 4.6). Pure. A manager's squad for a round is the latest squad they saved for that round or
 * earlier, so doing nothing keeps the team; a manager with no squad yet scores nothing. The captain's points are multiplied (a duck
 * doubles too). Tie-break: higher best single round, then earlier join.
 */
export type LbEntry = { id: number; teamName: string; joinedAt: string }
export type LbSquad = { entry: number; round: string; picks: readonly number[]; captain: number | null }
export type LbRound = { key: string; /** Points of each player this round (absent means 0). */ points: ReadonlyMap<number, number>; provisional: boolean }
export type LbRoundResult = { round: string; points: number; provisional: boolean }
export type LbRow = { rank: number; entry: number; teamName: string; joinedAt: string; total: number; best: number; rounds: LbRoundResult[] }

/** The squad in force for `round`: the latest saved one with `round <=` it (weekend keys sort as dates). */
export function squadFor(squads: readonly LbSquad[], round: string): LbSquad | null {
  let best: LbSquad | null = null
  for (const s of squads) if (s.round <= round && (!best || s.round > best.round)) best = s
  return best
}

export function squadRoundPoints(squad: LbSquad | null, round: LbRound, multiplier: number): number {
  if (!squad) return 0
  let total = 0
  for (const p of squad.picks) {
    const pts = round.points.get(p) ?? 0
    total += p === squad.captain ? pts * multiplier : pts
  }
  return total
}

export function buildLeaderboard(o: { entries: readonly LbEntry[]; squads: readonly LbSquad[]; rounds: readonly LbRound[]; captainMultiplier: number }): LbRow[] {
  const byEntry = new Map<number, LbSquad[]>()
  for (const s of o.squads) byEntry.set(s.entry, [...(byEntry.get(s.entry) ?? []), s])
  const rows = o.entries.map((e) => {
    const mine = byEntry.get(e.id) ?? []
    const rounds = o.rounds.map((r) => ({ round: r.key, points: squadRoundPoints(squadFor(mine, r.key), r, o.captainMultiplier), provisional: r.provisional }))
    const total = rounds.reduce((s, r) => s + r.points, 0)
    const best = rounds.length ? Math.max(...rounds.map((r) => r.points)) : 0
    return { rank: 0, entry: e.id, teamName: e.teamName, joinedAt: e.joinedAt, total, best, rounds }
  })
  rows.sort((a, b) => b.total - a.total || b.best - a.best || (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0) || a.entry - b.entry)
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}
