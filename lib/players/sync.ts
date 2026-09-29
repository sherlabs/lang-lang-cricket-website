import { revalidatePath } from 'next/cache'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { playerAliases, playerSeasons, playerSyncRuns, players, type PlayerSyncRun } from '@/db/schema'
import { getClubTeams, getGameSummary, getSeasonGroups, getTeamGames } from '@/lib/playhq/queries'
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
  revalidatePath('/history/players')
  revalidatePath('/history/players/[slug]', 'page')
  revalidatePath('/admin/players')
}

/** Every senior club team's aggregated stats, newest senior season group = order 0. Throws on any PlayHQ failure. */
export async function collectSeniorAggregates(): Promise<TeamAggregate[]> {
  const groups = (await getSeasonGroups()).filter((g) => g.seasons.some((s) => !s.isJunior))
  const out: TeamAggregate[] = []
  for (const [order, group] of groups.entries()) {
    const teams = await getClubTeams(group)
    const clubIds = new Set(teams.map((t) => t.id))
    for (const team of teams.filter((t) => !t.isJunior)) {
      const finals = (await getTeamGames(team, clubIds)).filter((g) => g.status === 'FINAL')
      const cards = await mapLimit(finals, 5, (g) => getGameSummary(g.id, false, 'FINAL'))
      const stats = aggregatePlayers(cards, team.id, false)
      if (stats.length) out.push({ seasonName: group.name, seasonOrder: order, teamId: team.id, teamName: team.name, gradeName: team.gradeName, stats })
    }
  }
  return out
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export async function syncPlayers(now = new Date()): Promise<SyncResult> {
  if (isLocked((await latestSyncRun()) ?? undefined, now)) return { status: 'locked', playersCreated: 0, seasonRows: 0 }
  const [run] = await db.insert(playerSyncRuns).values({ status: 'running', startedAt: now }).returning({ id: playerSyncRuns.id })

  try {
    // 1. Collect everything first — a PlayHQ failure aborts before any player write.
    const aggregates = await collectSeniorAggregates()
    const aliasRows = await db.select().from(playerAliases)
    const slugRows = await db.select({ slug: players.slug }).from(players)
    const plan = buildSyncPlan(aggregates, new Map(aliasRows.map((a) => [a.nameKey, a.playerId])), new Set(slugRows.map((s) => s.slug)))

    // 2. New players + aliases (safe to keep if a later step fails: next run resolves them by alias).
    const idByKey = new Map<string, number>()
    for (const part of chunk(plan.newPlayers, 200)) {
      const inserted = await db.insert(players)
        .values(part.map((p) => ({ slug: p.slug, firstName: p.firstName, lastName: p.lastName, source: 'playhq' })))
        .returning({ id: players.id, slug: players.slug })
      const bySlug = new Map(inserted.map((r) => [r.slug, r.id]))
      for (const p of part) idByKey.set(p.nameKey, bySlug.get(p.slug)!)
      await db.insert(playerAliases).values(part.map((p) => ({ nameKey: p.nameKey, playerId: idByKey.get(p.nameKey)! })))
    }

    const rows = plan.seasonRows.map(({ playerId, newNameKey, ...rest }) => ({ ...rest, playerId: playerId ?? idByKey.get(newNameKey!)! }))
    const activeIds = [...plan.activePlayerIds, ...plan.activeNewNameKeys.map((k) => idByKey.get(k)!)]

    // 3. Replace season rows + derived flags atomically (neon-http batch = one transaction).
    await db.batch([
      db.delete(playerSeasons),
      ...chunk(rows, 500).map((part) => db.insert(playerSeasons).values(part)),
      db.update(players).set({ isActiveDerived: false }).where(eq(players.source, 'playhq')),
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
