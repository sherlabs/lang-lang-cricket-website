import type { Endpoint, PayloadRequest } from 'payload'
import { dismissPair, mergePlayerInto, undoMerge } from '../../lib/players/merge-core'
import { fail, readJson, refuseNonAdmin } from './adminOnly'

const toId = (v: unknown): number | null => {
  const id = Number(v)
  return Number.isInteger(id) && id > 0 ? id : null
}
const userId = (req: PayloadRequest): number | null => toId((req.user as { id?: unknown } | null)?.id)

/**
 * `POST /api/players/:id/merge`, body `{ targetId, confirmSameGame? }` (spec §8.3, W2 6.2). Folds player `:id` into the
 * target: seasons (combined per team), aliases and honours move; photo and bio fill gaps; derived activity is OR-ed; the
 * source player is deleted; a `merge-log` row with an identity snapshot is written in the same transaction so the merge can
 * be undone. Refused (409) when the two share a game unless `confirmSameGame` is sent. Bypasses the PlayHQ delete guard on
 * purpose: a merge keeps the identity (its aliases) alive on the target.
 */
export const mergePlayersEndpoint: Endpoint = {
  path: '/:id/merge',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return fail(401, 'You must be logged in to merge players.')
    const sId = toId(req.routeParams?.id)
    const body = await readJson(req)
    const tId = toId(body.targetId)
    if (!sId || !tId) return fail(400, 'Player not found.')
    // Compare after coercion: ('5', 5) would otherwise fold a player into itself and delete it.
    const res = await mergePlayerInto(req.payload, { sourceId: sId, targetId: tId, userId: userId(req), confirmSameGame: body.confirmSameGame === true })
    if (!res.ok) return Response.json({ errors: [{ message: res.message }], code: res.code, sharedGames: res.sharedGames }, { status: res.status })
    return Response.json({ ok: true, targetId: res.targetId, logId: res.logId })
  },
}

/** `POST /api/players/merge-log/:id/undo` (admin): puts the merged player back (identity only; the next sync rebuilds season rows). */
export const undoMergeEndpoint: Endpoint = {
  path: '/merge-log/:id/undo',
  method: 'post',
  handler: async (req) => {
    const refused = refuseNonAdmin(req)
    if (refused) return refused
    const id = toId(req.routeParams?.id)
    if (!id) return fail(404, 'That merge was not found.')
    const res = await undoMerge(req.payload, id, userId(req))
    if (!res.ok) return fail(res.status, res.message)
    return Response.json({ ok: true, playerId: res.playerId, note: 'The player is back with their name and honours. Their season totals are rebuilt by the next PlayHQ update (or press "Update now").' })
  },
}

/** `POST /api/players/duplicates/dismiss` (admin), body `{ a, b }`: these two are different people. */
export const dismissDuplicateEndpoint: Endpoint = {
  path: '/duplicates/dismiss',
  method: 'post',
  handler: async (req) => {
    const refused = refuseNonAdmin(req)
    if (refused) return refused
    const body = await readJson(req)
    const a = toId(body.a), b = toId(body.b)
    if (!a || !b || a === b) return fail(400, 'Pick two different players.')
    await dismissPair(req.payload, a, b, userId(req))
    return Response.json({ ok: true })
  },
}
