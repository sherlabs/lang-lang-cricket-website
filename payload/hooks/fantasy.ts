import type { CollectionBeforeChangeHook } from 'payload'
import { currentLock } from '../../lib/fantasy/lock-server'

const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : null)

/**
 * Wave F spec 4.5: a squad row is never written for a round that has locked, whatever path got here (the save action checks the
 * lock as well; this is the second lock). History writes (the demo seed and repairs) set `context.fantasyRescore`.
 */
export const fantasySquadLock: CollectionBeforeChangeHook = async ({ data, originalDoc, req, context }) => {
  if (context?.fantasyRescore) return data
  const round = String((data as { round?: unknown }).round ?? (originalDoc as { round?: unknown } | undefined)?.round ?? '')
  const entryId = idOf((data as { entry?: unknown }).entry ?? (originalDoc as { entry?: unknown } | undefined)?.entry)
  if (!round || entryId === null) throw new Error('A squad needs a round and a manager.')
  const entry = await req.payload.findByID({ collection: 'fantasy-entries', id: entryId, depth: 0, overrideAccess: true, req })
  const seasonId = idOf((entry as { season?: unknown }).season)
  if (seasonId === null) throw new Error('A squad needs a season.')
  const lock = await currentLock(req.payload, seasonId, round)
  if (Date.now() >= lock.getTime()) throw new Error('This round has locked. Squads cannot change after the first game starts.')
  return data
}
