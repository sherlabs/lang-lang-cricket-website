/**
 * Local stats fixture (spec section 7): about 70 deterministic players with season aggregates,
 * so leaderboards, records and milestones have something to show.
 *
 *   pnpm fixture:stats --target 127.0.0.1/langlang_dev --confirm
 *
 * Refuses unless DATABASE_URI is 127.0.0.1 and the database is langlang_dev or langlang_test.
 * Players are `source: 'manual'` with a bio starting `[seed]`; re-running first deletes the
 * previously seeded players (their seasons cascade). Also seeds two yearbooks (one published with
 * messages, sponsors and photos, one draft).
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { checkGuard, guard } from '../_guard'
import { seedStats, seedYearbooks } from './stats-seed-db'

const ALLOWED_DBS = new Set(['langlang_dev', 'langlang_test'])

async function main() {
  const g = checkGuard({ write: true })
  if (!g.local || g.host !== '127.0.0.1' || !ALLOWED_DBS.has(g.db)) {
    throw new Error(`[fixture:stats] refusing ${g.target}: only 127.0.0.1 with langlang_dev or langlang_test`)
  }
  await guard({ write: true })
  const payload = await getPayload({ config })
  try {
    const out = await seedStats(payload)
    console.log(`[fixture:stats] seeded ${out.players} players, ${out.rows} season rows into ${g.target}`)
    const yb = await seedYearbooks(payload, { photos: true })
    console.log(`[fixture:stats] seeded ${yb.yearbooks} yearbooks with ${yb.photos} photos`)
  } finally {
    await payload.destroy()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
