/**
 * The rotation: who bats in which net, in which round (wave B spec 4.3). Pure and deterministic. Fairness is a policy (balanced
 * groups in a fixed order), not a promise of equal batting time.
 */
export type PlanPlayer = { key: string; name: string }
export type PlanGroup = { number: number; round: number; net: number; players: PlanPlayer[] }
export type RotationPlan = { nets: number; groupSize: number; groups: PlanGroup[] }

const roundOf = (groupIndex: number, nets: number) => Math.floor(groupIndex / nets)
const netOf = (groupIndex: number, nets: number) => (groupIndex % nets) + 1

/**
 * Splits the players, in the order given, into balanced groups (ten players with a size of four become 4, 3 and 3). Group `j` is up
 * in round `floor(j / nets)` on net `(j mod nets) + 1`.
 */
export function buildRotation(input: { players: readonly PlanPlayer[]; nets: number; groupSize: number }): RotationPlan {
  const nets = Math.max(1, Math.floor(input.nets))
  const groupSize = Math.max(1, Math.floor(input.groupSize))
  const n = input.players.length
  const count = n === 0 ? 0 : Math.ceil(n / groupSize)
  const groups: PlanGroup[] = []
  let at = 0
  for (let j = 0; j < count; j++) {
    const size = Math.floor(n / count) + (j < n % count ? 1 : 0)
    groups.push({ number: j + 1, round: roundOf(j, nets), net: netOf(j, nets), players: input.players.slice(at, at + size) })
    at += size
  }
  return { nets, groupSize, groups }
}

export const roundCount = (plan: RotationPlan): number => (plan.groups.length ? Math.max(...plan.groups.map((g) => g.round)) + 1 : 0)
export const planKeys = (plan: RotationPlan): Set<string> => new Set(plan.groups.flatMap((g) => g.players.map((p) => p.key)))

const clone = (plan: RotationPlan): RotationPlan => ({ ...plan, groups: plan.groups.map((g) => ({ ...g, players: [...g.players] })) })

/**
 * Adds a latecomer to the smallest group of a round AFTER `currentRound` (earliest on a tie). When every later group is full a new
 * group is made: in the last round if it has a free net, else in a new round. A started or past round is never changed. Use
 * `currentRound = -1` before the first start. A player already in the plan is left where they are.
 */
export function addLatecomer(plan: RotationPlan, player: PlanPlayer, currentRound: number): RotationPlan {
  if (planKeys(plan).has(player.key)) return plan
  const next = clone(plan)
  const later = next.groups.filter((g) => g.round > currentRound)
  const smallest = [...later].sort((a, b) => a.players.length - b.players.length || a.round - b.round || a.net - b.net)[0]
  if (smallest && smallest.players.length < next.groupSize) {
    smallest.players.push(player)
    return next
  }
  const last = next.groups.length ? Math.max(...next.groups.map((g) => g.round)) : -1
  const inLast = next.groups.filter((g) => g.round === last)
  const round = last > currentRound && inLast.length < next.nets ? last : Math.max(last, currentRound) + 1
  const usedNets = new Set(next.groups.filter((g) => g.round === round).map((g) => g.net))
  let net = 1
  while (usedNets.has(net)) net++
  next.groups.push({ number: Math.max(0, ...next.groups.map((g) => g.number)) + 1, round, net, players: [player] })
  return next
}

/** Takes a player out of the groups of rounds after `currentRound` (a round already started keeps its people). Empty groups go. */
export function removeFromPlan(plan: RotationPlan, key: string, currentRound: number): RotationPlan {
  const next = clone(plan)
  for (const g of next.groups) if (g.round > currentRound) g.players = g.players.filter((p) => p.key !== key)
  next.groups = next.groups.filter((g) => g.players.length > 0 || g.round <= currentRound)
  return next
}

export type RoundView = {
  upNow: { net: number; group: number; players: PlanPlayer[] }[]
  upNext: { net: number; group: number; players: PlanPlayer[] }[]
  /** Not up this round or the next. */
  waiting: PlanPlayer[]
  /** Already had a turn. */
  done: PlanPlayer[]
}

export function roundView(plan: RotationPlan, round: number): RoundView {
  const byNet = (a: PlanGroup, b: PlanGroup) => a.net - b.net
  const pick = (r: number) => plan.groups.filter((g) => g.round === r).sort(byNet).map((g) => ({ net: g.net, group: g.number, players: g.players }))
  return {
    upNow: round < 0 ? [] : pick(round),
    upNext: pick(round + 1),
    waiting: plan.groups.filter((g) => g.round > round + 1).sort((a, b) => a.round - b.round || a.net - b.net).flatMap((g) => g.players),
    done: plan.groups.filter((g) => g.round < round).sort((a, b) => a.round - b.round || a.net - b.net).flatMap((g) => g.players),
  }
}

/** The stored plan is JSON that only code writes, but it is parsed defensively: anything malformed reads as "no rotation yet". */
export function parsePlan(raw: unknown): RotationPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { nets?: unknown; groupSize?: unknown; groups?: unknown }
  if (typeof r.nets !== 'number' || typeof r.groupSize !== 'number' || !Array.isArray(r.groups)) return null
  const groups: PlanGroup[] = []
  for (const g of r.groups) {
    const x = g as { number?: unknown; round?: unknown; net?: unknown; players?: unknown }
    if (typeof x.number !== 'number' || typeof x.round !== 'number' || typeof x.net !== 'number' || !Array.isArray(x.players)) return null
    const players = x.players.flatMap((p: { key?: unknown; name?: unknown }) => (typeof p?.key === 'string' && typeof p?.name === 'string' ? [{ key: p.key, name: p.name }] : []))
    groups.push({ number: x.number, round: x.round, net: x.net, players })
  }
  return { nets: r.nets, groupSize: r.groupSize, groups }
}
