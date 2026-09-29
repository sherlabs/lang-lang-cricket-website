import { revalidatePath } from 'next/cache'
import { count, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { playerAliases, playerSeasons, playerSyncRuns, players, type PlayerSyncRun } from '@/db/schema'
import { getClubTeams, getGameSummary, getSeasonGroups, getTeamGames, isJuniorGrade } from '@/lib/playhq/queries'
import { mapLimit } from '@/lib/playhq/client'
import { aggregatePlayers } from '@/lib/playhq/players'
import { buildSyncPlan, type TeamAggregate } from './plan'

export const LOCK_MS = 10 * 60 * 1000
export type SyncResult = { status: 'ok' | 'error' | 'locked'; playersCreated: number; seasonRows: number; error?: string }

export function isLocked(latest: { status: string; startedAt: Date } | undefined, now: Date): boolean {
  return !!latest && latest.status === 'running' && now.getTime() - latest.startedAt.getTime() < LOCK_MS
}

export async function latestSyncRun(): Promise<PlayerSyncRun | null> {
  const rows = await db.select().from(playerSyncRuns).orderBy(desc(playerSyncRuns.startedAt)).limit(1)
  return rows[0] ?? null
}

export function revalidatePlayerPages() {
  revalidatePath('/history')
  revalidatePath('/players')
  revalidatePath('/players/[slug]', 'page')
  revalidatePath('/admin/players')
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

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/**
 * Step 2 inserts players and their aliases as separate statements. If a run died between
 * them, the PlayHQ player has no alias and the next run would create a `-2` duplicate.
 * Re-derive the alias from the stored name (sync stores title-cased raw names, so
 * lower-casing yields the original key) before planning.
 */
async function healOrphanPlayers() {
  const [all, aliases] = await Promise.all([
    db.select({ id: players.id, firstName: players.firstName, lastName: players.lastName }).from(players).where(eq(players.source, 'playhq')),
    db.select({ playerId: playerAliases.playerId }).from(playerAliases),
  ])
  const aliased = new Set(aliases.map((a) => a.playerId))
  const orphans = all.filter((p) => !aliased.has(p.id))
  if (!orphans.length) return
  await db.insert(playerAliases)
    .values(orphans.map((p) => ({ nameKey: `${p.firstName.trim()}|${p.lastName.trim()}`.toLowerCase(), playerId: p.id })))
    .onConflictDoNothing()
}

export async function syncPlayers(now = new Date()): Promise<SyncResult> {
  if (isLocked((await latestSyncRun()) ?? undefined, now)) return { status: 'locked', playersCreated: 0, seasonRows: 0 }
  const [run] = await db.insert(playerSyncRuns).values({ status: 'running', startedAt: now }).returning({ id: playerSyncRuns.id })

  try {
    // 1. Collect everything first — a PlayHQ failure aborts before any player write.
    const aggregates = await collectSeniorAggregates()
    await healOrphanPlayers()
    const aliasRows = await db.select().from(playerAliases)
    const slugRows = await db.select({ slug: players.slug }).from(players)
    const plan = buildSyncPlan(aggregates, new Map(aliasRows.map((a) => [a.nameKey, a.playerId])), new Set(slugRows.map((s) => s.slug)))

    // 2. New players + aliases (safe to keep if a later step fails: next run resolves them by alias,
    //    or healOrphanPlayers re-links them if the alias insert itself failed).
    const idByKey = new Map<string, number>()
    for (const part of chunk(plan.newPlayers, 200)) {
      const inserted = await db.insert(players)
        .values(part.map((p) => ({ slug: p.slug, firstName: p.firstName, lastName: p.lastName, source: 'playhq' })))
        .returning({ id: players.id, slug: players.slug })
      const bySlug = new Map(inserted.map((r) => [r.slug, r.id]))
      for (const p of part) idByKey.set(p.nameKey, bySlug.get(p.slug)!)
      await db.insert(playerAliases).values(part.map((p) => ({ nameKey: p.nameKey, playerId: idByKey.get(p.nameKey)! })))
    }

    // Every scorecard fetch failing is swallowed per game, which would yield zero rows and wipe
    // all seasons below. Refuse instead: history never legitimately shrinks to nothing.
    const existing = Number((await db.select({ n: count() }).from(playerSeasons))[0]?.n ?? 0)
    if (plan.seasonRows.length === 0 && existing > 0) throw new Error('PlayHQ returned no player data; refusing to wipe seasons')

    const rows = plan.seasonRows.map(({ playerId, newNameKey, ...rest }) => ({ ...rest, playerId: playerId ?? idByKey.get(newNameKey!)! }))
    const activeIds = [...plan.activePlayerIds, ...plan.activeNewNameKeys.map((k) => idByKey.get(k)!)]

    // 3. Replace season rows + derived flags atomically (neon-http batch = one transaction).
    await db.batch([
      db.delete(playerSeasons),
      ...chunk(rows, 500).map((part) => db.insert(playerSeasons).values(part)),
      // All players, not just source=playhq: a PlayHQ identity merged into a manual player carries seasons too.
      db.update(players).set({ isActiveDerived: false }).where(sql`true`),
      ...(activeIds.length ? [db.update(players).set({ isActiveDerived: true }).where(inArray(players.id, activeIds))] : []),
    ] as never)

    await db.update(playerSyncRuns)
      .set({ status: 'ok', finishedAt: new Date(), playersCreated: plan.newPlayers.length, seasonRows: rows.length })
      .where(eq(playerSyncRuns.id, run.id))
    revalidatePlayerPages()
    return { status: 'ok', playersCreated: plan.newPlayers.length, seasonRows: rows.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[players] sync failed', message)
    await db.update(playerSyncRuns).set({ status: 'error', finishedAt: new Date(), error: message }).where(eq(playerSyncRuns.id, run.id))
    return { status: 'error', playersCreated: 0, seasonRows: 0, error: message }
  }
}
