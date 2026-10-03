import { and, count, desc, eq, inArray, notInArray, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { revalidatePaths } from '@/payload/hooks/revalidate'
import { getClubTeams, getGameSummary, getSeasonGroups, getTeamGames, isJuniorGrade } from '@/lib/playhq/queries'
import { mapLimit } from '@/lib/playhq/client'
import { aggregatePlayers } from '@/lib/playhq/players'
import { chunk, playerTables } from './db'
import { buildSyncPlan, type TeamAggregate } from './plan'

/**
 * PlayHQ → players sync (spec §8.2) on `payload.db.drizzle`. Same steps and order as the legacy
 * sync: lock, collect (network only), heal, plan (pure), new players + aliases, wipe guard, one
 * transaction for seasons and active flags, mark the run, revalidate. Raw writes bypass the
 * collection hooks on purpose, so revalidation is explicit.
 */

export const LOCK_MS = 10 * 60 * 1000
export type SyncResult = { status: 'ok' | 'error' | 'locked'; playersCreated: number; seasonRows: number; error?: string }

export type SyncRunRow = {
  id: number
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'ok' | 'error' | null
  playersCreated: number | null
  seasonRows: number | null
  error: string | null
}

export function isLocked(latest: { status: string | null; startedAt: Date } | undefined, now: Date): boolean {
  return !!latest && latest.status === 'running' && now.getTime() - latest.startedAt.getTime() < LOCK_MS
}

export async function latestSyncRun(payload: Payload): Promise<SyncRunRow | null> {
  const t = playerTables(payload)
  const rows = await payload.db.drizzle.select().from(t.player_sync_runs).orderBy(desc(t.player_sync_runs.startedAt)).limit(1)
  return (rows[0] as SyncRunRow | undefined) ?? null
}

/** `/players` and every `/players/[slug]` page. The legacy `/history` call is dropped (nothing there reads players). */
export async function revalidatePlayerPages(): Promise<void> {
  await revalidatePaths(['/players'])
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/players/[slug]', 'page')
  } catch {
    // outside a Next request (tests, `payload run`): nothing to revalidate
  }
}

/** Every senior club team's aggregated stats, newest senior season group = order 0. Throws on any PlayHQ failure. */
export async function collectSeniorAggregates(): Promise<TeamAggregate[]> {
  const groups = (await getSeasonGroups()).filter((g) => g.seasons.some((s) => !s.isJunior))
  const out: TeamAggregate[] = []
  for (const [order, group] of groups.entries()) {
    const teams = await getClubTeams(group)
    const clubIds = new Set(teams.map((t) => t.id))
    // Season-level flag OR grade-name heuristic, same as getGameSummaryAuto: a U-age grade
    // inside a senior-classified season must never put junior names into players tables.
    for (const team of teams.filter((t) => !t.isJunior && !isJuniorGrade(t.gradeName ?? ''))) {
      const finals = (await getTeamGames(team, clubIds)).filter((g) => g.status === 'FINAL')
      // One broken scorecard shouldn't block every future sync: skip it (logged) and
      // let the next run retry. Season/team/fixture failures above still abort.
      const cards = await mapLimit(finals, 5, (g) =>
        getGameSummary(g.id, false, 'FINAL').catch((err) => {
          console.error('[players] skipping game summary', g.id, err instanceof Error ? err.message : err)
          return null
        })
      )
      const stats = aggregatePlayers(cards.filter((c): c is NonNullable<typeof c> => c !== null), team.id, false)
      if (stats.length) out.push({ seasonName: group.name, seasonOrder: order, teamId: team.id, teamName: team.name, gradeName: team.gradeName, stats })
    }
  }
  return out
}


/**
 * Step 1 — lock. One short transaction: a transaction-scoped advisory lock (safe under the
 * Neon pooler), the "latest run is running and < 10 min old" check, and the `running` row.
 * Two concurrent starts serialise on the lock; the second sees the first's row.
 */
async function acquireRun(payload: Payload, now: Date): Promise<number | null> {
  const t = playerTables(payload)
  return payload.db.drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('player-sync'))`)
    const [latest] = await tx.select().from(t.player_sync_runs).orderBy(desc(t.player_sync_runs.startedAt)).limit(1)
    if (latest && isLocked({ status: latest.status, startedAt: new Date(latest.startedAt) }, now)) return null
    const stamp = now.toISOString()
    const [run] = await tx
      .insert(t.player_sync_runs)
      .values({ status: 'running', startedAt: stamp, playersCreated: 0, seasonRows: 0, createdAt: stamp, updatedAt: stamp })
      .returning({ id: t.player_sync_runs.id })
    return run.id as number
  })
}

/**
 * Step 3 — heal. Players and their aliases are inserted as separate statements; if a run died
 * between them, the PlayHQ player has no alias and the next run would create a `-2` duplicate.
 * Re-derive the alias from the stored name (sync stores the raw names, so lower-casing yields
 * the original key) before planning.
 */
async function healOrphanPlayers(payload: Payload) {
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const [all, aliases] = await Promise.all([
    db.select({ id: t.players.id, firstName: t.players.firstName, lastName: t.players.lastName }).from(t.players).where(eq(t.players.source, 'playhq')),
    db.select({ player: t.player_aliases.player }).from(t.player_aliases),
  ])
  const aliased = new Set(aliases.map((a: { player: number }) => a.player))
  const orphans = all.filter((p: { id: number }) => !aliased.has(p.id))
  if (!orphans.length) return
  const stamp = new Date().toISOString()
  await db
    .insert(t.player_aliases)
    .values(
      orphans.map((p: { id: number; firstName: string; lastName: string }) => ({
        nameKey: `${p.firstName.trim()}|${p.lastName.trim()}`.toLowerCase(),
        player: p.id,
        createdAt: stamp,
        updatedAt: stamp,
      })),
    )
    .onConflictDoNothing({ target: t.player_aliases.nameKey })
}

export async function syncPlayers(payload: Payload, now = new Date()): Promise<SyncResult> {
  const runId = await acquireRun(payload, now)
  if (runId === null) return { status: 'locked', playersCreated: 0, seasonRows: 0 }
  const t = playerTables(payload)
  const db = payload.db.drizzle

  try {
    // 2. Collect everything first — a PlayHQ failure aborts before any player write.
    const aggregates = await collectSeniorAggregates()
    await healOrphanPlayers(payload)
    const aliasRows: { nameKey: string; player: number }[] = await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases)
    const slugRows: { slug: string | null }[] = await db.select({ slug: t.players.slug }).from(t.players)
    // 4. Plan (pure).
    const plan = buildSyncPlan(
      aggregates,
      new Map(aliasRows.map((a) => [a.nameKey, a.player])),
      new Set(slugRows.map((s) => s.slug).filter((s): s is string => Boolean(s))),
    )

    // 5. New players + aliases, outside the big transaction (safe to keep if a later step fails:
    //    the next run resolves them by alias, or healOrphanPlayers re-links a missing alias).
    const idByKey = new Map<string, number>()
    for (const part of chunk(plan.newPlayers, 200)) {
      const stamp = new Date().toISOString()
      const inserted: { id: number; slug: string }[] = await db
        .insert(t.players)
        .values(
          part.map((p) => ({
            slug: p.slug,
            firstName: p.firstName,
            lastName: p.lastName,
            displayName: `${p.firstName} ${p.lastName}`.trim(),
            source: 'playhq',
            bio: '',
            manualYears: '',
            isActiveDerived: false,
            hidden: false,
            createdAt: stamp,
            updatedAt: stamp,
          })),
        )
        .returning({ id: t.players.id, slug: t.players.slug })
      const bySlug = new Map(inserted.map((r) => [r.slug, r.id]))
      for (const p of part) idByKey.set(p.nameKey, bySlug.get(p.slug)!)
      await db
        .insert(t.player_aliases)
        .values(part.map((p) => ({ nameKey: p.nameKey, player: idByKey.get(p.nameKey)!, createdAt: stamp, updatedAt: stamp })))
        .onConflictDoNothing({ target: t.player_aliases.nameKey })
    }

    // 6. Wipe guard. Every scorecard fetch failing is swallowed per game, which would yield zero
    //    rows and wipe all seasons below. Refuse instead: history never legitimately shrinks to nothing.
    const [{ n: existing }] = await db.select({ n: count() }).from(t.player_seasons)
    if (plan.seasonRows.length === 0 && Number(existing) > 0) throw new Error('PlayHQ returned no player data; refusing to wipe seasons')

    const stamp = new Date().toISOString()
    const rows = plan.seasonRows.map(({ playerId, newNameKey, ...rest }) => ({
      ...rest,
      player: playerId ?? idByKey.get(newNameKey!)!,
      createdAt: stamp,
      updatedAt: stamp,
    }))
    const activeIds = [...new Set([...plan.activePlayerIds, ...plan.activeNewNameKeys.map((k) => idByKey.get(k)!)])]

    // 7. Replace season rows + derived flags atomically. All players, not just source=playhq:
    //    a PlayHQ identity merged into a manual player carries seasons too. Only players whose
    //    flag changes are written, and their updated_at is bumped (the sitemap reads it).
    await db.transaction(async (tx) => {
      await tx.delete(t.player_seasons)
      for (const part of chunk(rows, 500)) await tx.insert(t.player_seasons).values(part)
      await tx
        .update(t.players)
        .set({ isActiveDerived: false, updatedAt: stamp })
        .where(activeIds.length ? and(eq(t.players.isActiveDerived, true), notInArray(t.players.id, activeIds)) : eq(t.players.isActiveDerived, true))
      if (activeIds.length) {
        await tx
          .update(t.players)
          .set({ isActiveDerived: true, updatedAt: stamp })
          .where(and(eq(t.players.isActiveDerived, false), inArray(t.players.id, activeIds)))
      }
    })

    // 8. Mark the run.
    await db
      .update(t.player_sync_runs)
      .set({ status: 'ok', finishedAt: new Date().toISOString(), playersCreated: plan.newPlayers.length, seasonRows: rows.length })
      .where(eq(t.player_sync_runs.id, runId))
    // 9. Revalidate.
    await revalidatePlayerPages()
    return { status: 'ok', playersCreated: plan.newPlayers.length, seasonRows: rows.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[players] sync failed', message)
    await db
      .update(t.player_sync_runs)
      .set({ status: 'error', finishedAt: new Date().toISOString(), error: message })
      .where(eq(t.player_sync_runs.id, runId))
    return { status: 'error', playersCreated: 0, seasonRows: 0, error: message }
  }
}
