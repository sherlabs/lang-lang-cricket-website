import { and, count, desc, eq, inArray, notInArray, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { revalidatePlayerPages } from './revalidate'
import { getClubTeams, getRawGameSummary, getSeasonGroups, getTeamGames, isJuniorGrade } from '@/lib/playhq/queries'
import { PLAYHQ_ORG_ID, mapLimit } from '@/lib/playhq/client'
import { isSkip, mapMatchBundle, seasonStartYearOf, type MatchBundle, type SkipReason } from '@/lib/playhq/match-rows'
import { aggregatePlayers } from '@/lib/playhq/players'
import { mapScorecard } from '@/lib/playhq/scorecard'
import type { RawGameSummary } from '@/lib/playhq/types'
import { reconcileMatchStore, pairKey } from '@/lib/match-store/reconcile'
import { pruneStaleMatches, relinkMatchPlayers, storedFixtureStamps, upsertMatchBundle } from '@/lib/match-store/write'
import { revalidatePaths } from '../../payload/hooks/revalidate'
import { chunk, playerTables } from './db'
import { buildSyncPlan, type TeamAggregate } from './plan'

/**
 * PlayHQ → players sync (spec §8.2) on `payload.db.drizzle`. Same steps and order as the legacy
 * sync: lock, collect (network only), heal, plan (pure), new players + aliases, wipe guard, one
 * transaction for seasons and active flags, then the per-match store (own try/catch), mark the run, revalidate. Raw writes bypass the
 * collection hooks on purpose, so revalidation is explicit.
 */

export const LOCK_MS = 10 * 60 * 1000
export type SyncResult = { status: 'ok' | 'error' | 'locked'; playersCreated: number; seasonRows: number; error?: string }

export function isLocked(latest: { status: string | null; startedAt: Date } | undefined, now: Date): boolean {
  return !!latest && latest.status === 'running' && now.getTime() - latest.startedAt.getTime() < LOCK_MS
}

export type CollectedMatch = { bundle: MatchBundle; seasonName: string; teamId: string }
export type CollectedData = {
  /** Season aggregates of every FINAL game (the season rows are planned from these, as before). */
  aggregates: TeamAggregate[]
  /** The same aggregates restricted to the games that produced a stored match (what the reconciliation compares). */
  matchAggregates: TeamAggregate[]
  matches: CollectedMatch[]
  skipped: { gameId: string; reason: SkipReason }[]
  /** pairKeys of (team, season) pairs where a game summary fetch failed: never pruned or reconciled as complete. */
  partialPairs: string[]
  /** Games whose summary was fetched uncached because the fixture stamp differed from the stored one. */
  refreshed: number
}

/**
 * Every senior club team's season aggregates, newest senior season group = order 0, and from the
 * SAME summary fetches (one PlayHQ call per game) the mapped match bundles. Throws on any PlayHQ
 * failure above the per-game level. `stored` maps gameId to the fixture `updatedAt` stored with its
 * match: a game that is new or whose stamp changed is fetched uncached, so a corrected scorecard is
 * never served from the seven-day cache, and the one fresh object feeds both the season aggregate
 * and the bundle so they cannot disagree.
 */
export async function collectSeniorData(opts: { stored?: ReadonlyMap<string, string | null> } = {}): Promise<CollectedData> {
  const groups = (await getSeasonGroups()).filter((g) => g.seasons.some((s) => !s.isJunior))
  const out: CollectedData = { aggregates: [], matchAggregates: [], matches: [], skipped: [], partialPairs: [], refreshed: 0 }
  for (const [order, group] of groups.entries()) {
    const teams = await getClubTeams(group)
    const clubIds = new Set(teams.map((t) => t.id))
    const seasonStartYear = seasonStartYearOf(group.name)
    // Season-level flag OR grade-name heuristic, same as getGameSummaryAuto: a U-age grade
    // inside a senior-classified season must never put junior names into players tables.
    for (const team of teams.filter((t) => !t.isJunior && !isJuniorGrade(t.gradeName ?? ''))) {
      const finals = (await getTeamGames(team, clubIds)).filter((g) => g.status === 'FINAL')
      // One broken scorecard shouldn't block every future sync: skip it (logged) and
      // let the next run retry. Season/team/fixture failures above still abort.
      const fetched = await mapLimit(finals, 5, async (g) => {
        const known = opts.stored?.has(g.id) ?? false
        const fresh = !known || (g.updatedAt ?? null) !== (opts.stored?.get(g.id) ?? null)
        try {
          const raw: RawGameSummary = await getRawGameSummary(g.id, { status: 'FINAL', fresh })
          return { game: g, raw, refreshed: fresh && known }
        } catch (err) {
          console.error('[players] skipping game summary', g.id, err instanceof Error ? err.message : err)
          return null
        }
      })
      if (fetched.some((f) => f === null)) out.partialPairs.push(pairKey(team.id, group.name))
      const ok = fetched.filter((f): f is NonNullable<typeof f> => f !== null)
      out.refreshed += ok.filter((f) => f.refreshed).length
      const cards = ok.map((f) => ({ ...f, card: mapScorecard(f.raw, PLAYHQ_ORG_ID, false) }))
      const stats = aggregatePlayers(cards.map((c) => c.card), team.id, false)
      if (stats.length) out.aggregates.push({ seasonName: group.name, seasonOrder: order, teamId: team.id, teamName: team.name, gradeName: team.gradeName, stats })

      const kept: typeof cards = []
      for (const c of cards) {
        const bundle = mapMatchBundle(c.raw, {
          clubOrgId: PLAYHQ_ORG_ID, clubIds, seasonName: group.name, seasonStartYear, competitionName: team.competitionName, isJunior: false, fixture: c.game,
        })
        if (isSkip(bundle)) out.skipped.push({ gameId: c.raw.id, reason: bundle.skip })
        else {
          out.matches.push({ bundle, seasonName: group.name, teamId: bundle.match.clubTeamId })
          kept.push(c)
        }
      }
      const keptStats = aggregatePlayers(kept.map((c) => c.card), team.id, false)
      if (keptStats.length) out.matchAggregates.push({ seasonName: group.name, seasonOrder: order, teamId: team.id, teamName: team.name, gradeName: team.gradeName, stats: keptStats })
    }
  }
  return out
}

/** The season aggregates only (kept for callers that do not need match rows). */
export async function collectSeniorAggregates(): Promise<TeamAggregate[]> {
  return (await collectSeniorData()).aggregates
}

export type MatchStoreCounters = { matchesUpserted: number; matchesSkipped: number; matchMismatches: number; matchError: number }

/**
 * Writes the collected bundles and reconciles them with the season aggregates. Never throws: a
 * match-store failure must not fail the player sync (the season data is already committed), so every
 * failure is counted in `matchError` and logged. A (team, season) holding a game whose write failed
 * is left out of the reconciliation.
 */
export async function writeMatchStore(payload: Payload, data: CollectedData, aliasMap: ReadonlyMap<string, number>): Promise<MatchStoreCounters> {
  const counters: MatchStoreCounters = { matchesUpserted: 0, matchesSkipped: data.skipped.length, matchMismatches: 0, matchError: 0 }
  try {
    const failed = new Set<string>(data.partialPairs)
    const warnings = new Set<string>()
    for (const m of data.matches) {
      for (const w of m.bundle.warnings) warnings.add(`${w} (game ${m.bundle.match.gameId})`)
      try {
        if ((await upsertMatchBundle(payload, m.bundle, aliasMap)) !== 'unchanged') counters.matchesUpserted++
      } catch (err) {
        counters.matchError++
        failed.add(pairKey(m.teamId, m.seasonName))
        console.error('[matches] write failed', m.bundle.match.gameId, err instanceof Error ? err.message : err)
      }
    }
    for (const w of warnings) console.warn('[matches] unknown_shape', w)
    // Drop stored games PlayHQ no longer reports (reclassified, abandoned, vanished) for the pairs synced
    // cleanly this run, so they cannot hold the reconciliation in permanent mismatch. The collection
    // throws on any PlayHQ failure, so reaching here means the fetch was complete; failed writes are skipped.
    const pairs = new Map<string, { clubTeamId: string; seasonName: string }>()
    for (const a of data.matchAggregates) pairs.set(pairKey(a.teamId, a.seasonName), { clubTeamId: a.teamId, seasonName: a.seasonName })
    for (const m of data.matches) pairs.set(pairKey(m.teamId, m.seasonName), { clubTeamId: m.teamId, seasonName: m.seasonName })
    const prunePairs = [...pairs.entries()].filter(([k]) => !failed.has(k)).map(([, v]) => v)
    const pruned = await pruneStaleMatches(payload, prunePairs, data.matches.map((m) => m.bundle.match.gameId))
    if (pruned) console.warn('[matches] removed stale stored matches', pruned)
    await relinkMatchPlayers(payload)
    const rec = await reconcileMatchStore(payload, { aggregates: data.matchAggregates, aliasMap, skipPairs: failed })
    counters.matchMismatches = rec.mismatchedPlayers
    for (const m of rec.samples.slice(0, 5)) console.error('[matches] reconcile', m)
    // Corrected scorecards were fetched uncached: expire the cached copies and the match-store tag.
    await revalidatePaths([], undefined, [...(data.refreshed ? ['playhq-game'] : []), 'match-store'])
  } catch (err) {
    counters.matchError = Math.max(1, counters.matchError, data.matches.length)
    console.error('[matches] match-store step failed', err instanceof Error ? err.message : err)
  }
  return counters
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
    // 2. Collect everything first — a PlayHQ failure aborts before any player write. The stored
    //    fixture stamps (match store) only decide which scorecards are fetched uncached.
    const stored = await storedFixtureStamps(payload).catch((err) => {
      console.error('[matches] could not read stored fixture stamps', err instanceof Error ? err.message : err)
      return new Map<string, string | null>()
    })
    const data = await collectSeniorData({ stored })
    const aggregates = data.aggregates
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

    // 7b. Per-match rows, in their own try/catch (never fails the sync). The alias map is read AFTER
    //     the new-player insert above, so a player first seen in this run resolves.
    const aliasNow: { nameKey: string; player: number }[] = await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases)
    const matchCounters = await writeMatchStore(payload, data, new Map(aliasNow.map((a) => [a.nameKey, a.player])))

    // 8. Mark the run.
    await db
      .update(t.player_sync_runs)
      .set({ status: 'ok', finishedAt: new Date().toISOString(), playersCreated: plan.newPlayers.length, seasonRows: rows.length, ...matchCounters })
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
