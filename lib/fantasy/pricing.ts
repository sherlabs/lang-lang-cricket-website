/**
 * Deterministic prices (wave F spec 4.3). A price is a PERCENTILE RANK of shrunk points per game, not a rating of how good a
 * player is. The shrinkage pulls thin data toward the average, so a debutant sits near the middle by design. Money-like values are
 * integer tenths of a credit, so there is no floating point arithmetic on prices. Pure: ties break on player id, so the same inputs
 * always give the same output. Players with identical shrunk values (every newcomer with no data) share the AVERAGE rank of their
 * tie block, so they all get the same price instead of one spread over the whole block by id.
 */
export type PriceInput = { id: number; games: number; points: number }
export type PriceParams = { minPriceTenths: number; maxPriceTenths: number; priorGames: number; minGamesForPrice: number }
export type PriceBasis = { games: number; points: number; shrunk: number; rank: number; thin: boolean }
export type PriceResult = { id: number; priceTenths: number; basis: PriceBasis }

/** Round to the nearest 5 tenths. */
const roundTo5 = (tenths: number): number => Math.round(tenths / 5) * 5

export function computePrices(players: readonly PriceInput[], params: PriceParams): PriceResult[] {
  if (!players.length) return []
  const withGames = players.filter((p) => p.games > 0)
  const mu = withGames.length ? withGames.reduce((s, p) => s + p.points / p.games, 0) / withGames.length : 0
  const shrunk = players.map((p) => ({ p, s: p.games === 0 && p.points === 0 ? mu : (p.points + params.priorGames * mu) / (p.games + params.priorGames || 1) }))
  const ordered = [...shrunk].sort((a, b) => a.s - b.s || a.p.id - b.p.id)
  const n = ordered.length
  const rank = new Map<number, number>()
  // Percentile rank in [0, 1]: the lowest is 0, the highest is 1; a single player sits in the middle. Tied values share the mean
  // position of their block.
  for (let i = 0; i < n; ) {
    let j = i
    while (j + 1 < n && ordered[j + 1].s === ordered[i].s) j++
    for (let k = i; k <= j; k++) rank.set(ordered[k].p.id, n === 1 ? 0.5 : (i + j) / 2 / (n - 1))
    i = j + 1
  }
  const { minPriceTenths: lo, maxPriceTenths: hi } = params
  return shrunk.map(({ p, s }) => {
    const r = rank.get(p.id) ?? 0.5
    const price = Math.min(hi, Math.max(lo, roundTo5(lo + (hi - lo) * r)))
    return { id: p.id, priceTenths: price, basis: { games: p.games, points: p.points, shrunk: Math.round(s * 100) / 100, rank: Math.round(r * 1000) / 1000, thin: p.games < params.minGamesForPrice } }
  })
}

/** The price of someone with no data at all, the middle of the range (used when a row is added after the season opens). */
export const middlePrice = (p: Pick<PriceParams, 'minPriceTenths' | 'maxPriceTenths'>): number => Math.min(p.maxPriceTenths, Math.max(p.minPriceTenths, roundTo5((p.minPriceTenths + p.maxPriceTenths) / 2)))

/**
 * "Add missing players": rows for eligible players who have none, priced by the same formula, never touching an existing price.
 * `existing` holds the ids that already have a row; returns results only for the others.
 */
export function addMissing(all: readonly PriceInput[], existing: ReadonlySet<number>, params: PriceParams): PriceResult[] {
  const rank = computePrices(all, params)
  return rank.filter((r) => !existing.has(r.id))
}
