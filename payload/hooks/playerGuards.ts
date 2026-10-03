import { APIError, type CollectionBeforeDeleteHook, type FieldHook } from 'payload'

/**
 * Sync-owned field `beforeChange` (spec §2, §3.12): field access (`create/update: nobody`)
 * already strips REST input; this also resets the value to the stored one on update (or to
 * `onCreate` on create), so nothing but sync (drizzle) and the ETL (`context.etl`) sets it.
 */
export const keepStored =
  (onCreate: unknown): FieldHook =>
  ({ value, operation, originalDoc, field, req }) => {
    if (req.context?.etl || req.context?.sync) return value
    if (operation === 'create') return onCreate
    const name = 'name' in field && field.name ? field.name : ''
    return (originalDoc as Record<string, unknown> | undefined)?.[name] ?? onCreate
  }

/**
 * `players.source` guard: `manual` on create, the stored source on update. A REST
 * `PATCH source=manual` therefore cannot unlock the delete guard below.
 */
export const playerSource: FieldHook = keepStored('manual')

/**
 * `beforeDelete`, before the cascade: PlayHQ players come back on the next sync (their alias
 * re-creates them), so only manually added players can be deleted. Merge removes PlayHQ
 * identities through its own transaction instead.
 */
export const refusePlayhqDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const player = await req.payload.findByID({ collection: 'players', id, depth: 0, overrideAccess: true, req, select: { source: true } })
  if (player?.source === 'playhq') {
    // 403 like Payload's `Forbidden`, with a message the admin can show.
    throw new APIError('Only manually added players can be deleted. PlayHQ players come back on the next sync — hide them instead, or merge them into another player.', 403, undefined, true)
  }
}
