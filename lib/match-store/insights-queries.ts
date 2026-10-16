import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { cached } from '@/lib/stats/queries'
import type { InningsExtras } from '@/lib/insights/team-profile'

/**
 * Two small team-level lookups the facts blob does not carry (wave E, WP-3): the toss, and extras per innings. Club-side
 * aggregates only: no person, no opposition individual. Cached under the public stats tags like the facts, so a sync or a
 * hide/unhide expires them with every other stats page. Imported games have no extras (the history import has no extras
 * statistic), so they are left out rather than read as zero.
 *
 * Blob layout (positional; bump the version segment of the key if it changes): `toss` rows `[matchId, 1 | 0 | -1]`
 * (won, lost, not recorded), `extras` rows `[matchId, seq, extras, wides, noBalls]`.
 */
export type InsightsExtras = { toss: Map<number, boolean | null>; extras: Map<string, InningsExtras> }
type Blob = { toss: number[][]; extras: number[][] }

async function load(): Promise<Blob> {
  const payload = await getPayloadClient()
  const matches = await payload.find({
    collection: 'matches', where: { status: { equals: 'FINAL' } }, pagination: false, depth: 0, sort: 'id', select: { clubWonToss: true, source: true },
  })
  const playhq = new Set(matches.docs.filter((m) => m.source !== 'import').map((m) => m.id))
  const innings = await payload.find({
    collection: 'match-innings', where: { played: { equals: true } }, pagination: false, depth: 0, sort: 'id',
    select: { match: true, sequenceNo: true, extrasTotal: true, wides: true, noBalls: true },
  })
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    toss: matches.docs.map((m) => [m.id, m.clubWonToss === true ? 1 : m.clubWonToss === false ? 0 : -1]),
    extras: innings.docs.flatMap((i) => {
      const m = typeof i.match === 'number' ? i.match : i.match?.id
      return m !== undefined && playhq.has(m) ? [[m, num(i.sequenceNo), num(i.extrasTotal), num(i.wides), num(i.noBalls)]] : []
    }),
  }
}

export async function getInsightsExtras(): Promise<InsightsExtras> {
  const blob = await cached(['match-insights-extras', 'v1'], load)
  return {
    toss: new Map(blob.toss.map((r) => [r[0], r[1] === 1 ? true : r[1] === 0 ? false : null])),
    extras: new Map(blob.extras.map((r) => [`${r[0]}:${r[1]}`, { extras: r[2], wides: r[3], noBalls: r[4] }])),
  }
}
