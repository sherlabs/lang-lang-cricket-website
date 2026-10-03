import { and, eq, inArray, sql } from '@payloadcms/db-postgres/drizzle'
import type { Endpoint, PayloadRequest } from 'payload'
import { playerTables } from '../../lib/players/db'
import { planMerge } from '../../lib/players/merge'
import { revalidatePlayerPages } from '../../lib/players/revalidate'
import { pickCounts } from '../../lib/players/season-math'
import { revalidatePaths } from '../hooks/revalidate'

const toId = (v: unknown): number | null => {
  const id = Number(v)
  return Number.isInteger(id) && id > 0 ? id : null
}

const fail = (status: number, message: string) => Response.json({ errors: [{ message }] }, { status })

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * `POST /api/players/:id/merge`, body `{ targetId }` (spec §8.3). Folds player `:id` into the
 * target: seasons (combined per team), aliases and honours move; photo and bio fill gaps;
 * derived activity is OR-ed; the source player is deleted. One drizzle transaction, so a
 * failure leaves both players untouched. Bypasses the PlayHQ delete guard on purpose — a merge
 * keeps the identity (its aliases) alive on the target.
 */
export const mergePlayersEndpoint: Endpoint = {
  path: '/:id/merge',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return fail(401, 'You must be logged in to merge players.')
    const sId = toId(req.routeParams?.id)
    const tId = toId((await readBody(req)).targetId)
    if (!sId || !tId) return fail(400, 'Player not found.')
    // Compare after coercion: ('5', 5) would otherwise fold a player into itself and delete it.
    if (sId === tId) return fail(400, 'Pick a different player to merge into.')

    const { payload } = req
    const load = (id: number) =>
      payload.find({ collection: 'players', where: { id: { equals: id } }, depth: 0, joins: false, limit: 1, pagination: false, overrideAccess: true }).then((r) => r.docs[0])
    const seasonsOf = (id: number) =>
      payload.find({ collection: 'player-seasons', where: { player: { equals: id } }, depth: 0, pagination: false, overrideAccess: true }).then((r) => r.docs)
    const [source, target] = await Promise.all([load(sId), load(tId)])
    if (!source || !target) return fail(404, 'Player not found.')
    const [sourceSeasons, targetSeasons] = await Promise.all([seasonsOf(sId), seasonsOf(tId)])

    const asP = (p: typeof source) => ({
      photo: typeof p.photo === 'number' ? p.photo : (p.photo?.id ?? null),
      bio: p.bio ?? '',
      isActiveDerived: Boolean(p.isActiveDerived),
    })
    const asRow = (r: (typeof sourceSeasons)[number]) => ({ id: r.id, teamId: r.teamId, ...pickCounts(r as never) })
    const plan = planMerge(asP(source), asP(target), sourceSeasons.map(asRow), targetSeasons.map(asRow))

    const t = playerTables(payload)
    const stamp = new Date().toISOString()
    await payload.db.drizzle.transaction(async (tx) => {
      // 1. Target patch (photo/bio fill-if-empty, OR of derived activity).
      await tx.update(t.players).set({ ...plan.targetPatch, updatedAt: stamp }).where(eq(t.players.id, tId))
      // 2. Aliases follow the identity.
      await tx.update(t.player_aliases).set({ player: tId, updatedAt: stamp }).where(eq(t.player_aliases.player, sId))
      // 3. Honours go after the target's own (`_order` is 1-based; continue from its MAX).
      const [{ max }] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${t.players_honours._order}), 0)` })
        .from(t.players_honours)
        .where(eq(t.players_honours._parentID, tId))
      await tx
        .update(t.players_honours)
        .set({ _parentID: tId, _order: sql`${t.players_honours._order} + ${Number(max)}` })
        .where(eq(t.players_honours._parentID, sId))
      // 4. Same team on both sides: combined counts into the target row…
      for (const c of plan.combine) {
        await tx.update(t.player_seasons).set({ ...c.counts, updatedAt: stamp }).where(eq(t.player_seasons.id, c.targetRowId))
      }
      // 5. …and the source row goes.
      if (plan.combine.length) {
        await tx.delete(t.player_seasons).where(inArray(t.player_seasons.id, plan.combine.map((c) => c.sourceRowId)))
      }
      // 6. The rest of the source's seasons move.
      if (plan.moveSeasonIds.length) {
        await tx
          .update(t.player_seasons)
          .set({ player: tId, updatedAt: stamp })
          .where(and(eq(t.player_seasons.player, sId), inArray(t.player_seasons.id, plan.moveSeasonIds)))
      }
      // 6b. A committee entry and player sponsorships follow the identity.
      await tx.update(t.people).set({ player: tId, updatedAt: stamp }).where(eq(t.people.player, sId))
      await tx.update(t.player_sponsors).set({ player: tId, updatedAt: stamp }).where(eq(t.player_sponsors.player, sId))
      // 7. The source player and anything still pointing at it.
      await tx.delete(t.player_aliases).where(eq(t.player_aliases.player, sId))
      await tx.delete(t.player_seasons).where(eq(t.player_seasons.player, sId))
      await tx.delete(t.players).where(eq(t.players.id, sId))
    })

    await revalidatePlayerPages()
    await revalidatePaths([`/players/${source.slug}`, `/players/${target.slug}`, '/honours'])
    return Response.json({ ok: true, targetId: tId })
  },
}
