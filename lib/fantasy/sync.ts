import type { Payload } from 'payload'
import { groupByWeekend } from '../selection/weekend'
import { revalidatePaths } from '../../payload/hooks/revalidate'
import { currentLock } from './lock-server'
import { FANTASY_TAG, getOpenSeason, loadRoundInputs } from './store'

/**
 * The nightly step after the fixtures refresh (wave F spec 4.6): lowers each round's stored lock when a game moved earlier, creates
 * the round-state rows lazily, and expires the fantasy caches so provisional points follow the match store. It never raises a lock and
 * never touches a squad. Does nothing while no season is open.
 */
export async function syncFantasyRounds(payload: Payload): Promise<{ rounds: number }> {
  const season = await getOpenSeason(payload)
  if (!season) return { rounds: 0 }
  const inputs = await loadRoundInputs(payload, season.id)
  const keys = groupByWeekend(inputs.fixtures.filter((f) => f.status !== 'removed' && /^\d{4}-\d{2}-\d{2}$/.test(f.localDate))).map((g) => g.key)
  for (const key of keys) await currentLock(payload, season.id, key)
  await revalidatePaths([], undefined, [FANTASY_TAG])
  return { rounds: keys.length }
}
