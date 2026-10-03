import type { Payload } from 'payload'
import { generateStatsSeed, SEED_MARKER } from './stats-seed-data'

/** Writes the deterministic stats seed through the Local API (shared by the script and the int tests). */
const CTX = { disableRevalidate: true } as const
export async function seedStats(payload: Payload): Promise<{ players: number; rows: number }> {
  await payload.delete({ collection: 'players', where: { bio: { like: SEED_MARKER } }, context: CTX })
  let rows = 0
  const seed = generateStatsSeed()
  for (const p of seed) {
    const created = await payload.create({
      collection: 'players',
      data: {
        firstName: p.firstName, lastName: p.lastName, hidden: p.hidden, source: 'manual', manualYears: p.manualYears,
        bio: `${SEED_MARKER} Fixture player for local stats checks.`, honours: p.honours,
      },
      context: CTX,
    })
    for (const r of p.rows) {
      await payload.create({ collection: 'player-seasons', data: { player: created.id, ...r }, context: CTX })
      rows++
    }
  }
  return { players: seed.length, rows }
}

