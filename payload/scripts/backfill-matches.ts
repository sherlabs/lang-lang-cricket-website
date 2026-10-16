/**
 * Operator backfill of the per-match store from PlayHQ (WP-M, spec M4).
 *
 *   pnpm backfill:matches --target 127.0.0.1/langlang_dev                         # dry run, no writes
 *   pnpm backfill:matches --target 127.0.0.1/langlang_dev --apply --confirm \
 *       [--season "2025/26"]... [--since 2025-10-01] [--limit 3] [--team <id>] [--delay-ms 2000] [--log file] [--force] \
 *       [--continue-on-error [--max-consecutive-failures 5]] [--skip-game <id>]...
 *
 * It uses the club's LIVE PlayHQ key, so every PlayHQ request goes through one queue: strictly one
 * at a time, `--delay-ms` apart (default 1500, minimum 500), read-only GETs, and a 429 or 5xx stops
 * the run with a clear message (resume is cheap: the database is the checkpoint, a game already
 * stored with the fixture's `updatedAt` is skipped without a call). With the opt-in
 * `--continue-on-error`, a game PlayHQ answers 500/502/503/504 for (or whose body does not map) is
 * recorded as failed and not stored, and the run goes on; 429, a network failure and
 * `--max-consecutive-failures` (default 5) failed games in a row still stop it. `--skip-game <id>`
 * leaves a known-bad game out of the plan so it is never requested. The dry run reads seasons, teams
 * and team fixtures (a handful of GETs) and makes no summary call and no database write.
 */
import config from '@payload-config'
import { appendFileSync, writeFileSync } from 'node:fs'
import { getPayload } from 'payload'
import { desc } from '@payloadcms/db-postgres/drizzle'
import { matchTables } from '../../lib/match-store/db'
import { isLocked } from '../../lib/players/lock'
import { playerTables } from '../../lib/players/db'
import { TOLERATED_STATUSES, estimateSeconds, failedReport, parseBackfillArgs, planBackfill, runGames, selectSeasons, StopRun, type FailedGame, type FixtureGame, type StoredStamp } from '../../lib/match-store/backfill'
import { pairKey, reconcileMatchStore } from '../../lib/match-store/reconcile'
import { relinkMatchPlayers, upsertMatchBundle } from '../../lib/match-store/write'
import { PLAYHQ_ORG_ID, PlayHQError } from '../../lib/playhq/client'
import { isSkip, mapMatchBundle, seasonStartYearOf } from '../../lib/playhq/match-rows'
import { aggregatePlayers } from '../../lib/playhq/players'
import { getClubTeams, getRawGameSummary, getSeasonGroups, getTeamGames, isJuniorGrade } from '../../lib/playhq/queries'
import { mapScorecard } from '../../lib/playhq/scorecard'
import type { RawGameSummary } from '../../lib/playhq/types'
import type { TeamAggregate } from '../../lib/players/plan'
import { guard } from './_guard'

const args = parseBackfillArgs(process.argv.slice(2))
const logStamp = new Date().toISOString().replace(/[:.]/g, '-')
const logPath = args.logPath ?? `./backfill-matches-${logStamp}.log`
let logReady = false
const log = (line: string) => {
  console.log(line)
  // The file is created only after the guard accepted the run, so a refused run leaves nothing behind.
  if (logReady) appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`)
}

/** One queue for every api.playhq.com request: sequential, spaced, logged, and fatal on 429 or 5xx. */
function throttlePlayHQ(delayMs: number) {
  const realFetch = globalThis.fetch
  let chain: Promise<unknown> = Promise.resolve()
  let last = 0
  let requests = 0
  let stopped: string | null = null
  let tolerate = false
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith('https://api.playhq.com/')) return realFetch(input, init)
    const run = chain.then(async () => {
      if (stopped) throw new StopRun(stopped)
      const wait = last + delayMs - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      last = Date.now()
      requests++
      const res = await realFetch(input, init)
      log(`[request ${requests}] GET ${url.replace('https://api.playhq.com', '')} -> ${res.status}`)
      // `--continue-on-error` lets a per-game 500/502/503/504 through (the client turns it into a PlayHQError the loop records).
      if (res.status === 429 || (res.status >= 500 && !(tolerate && TOLERATED_STATUSES.includes(res.status)))) {
        stopped = `PlayHQ answered ${res.status} for ${url.replace('https://api.playhq.com', '')}`
        throw new StopRun(stopped)
      }
      return res
    })
    chain = run.catch(() => undefined)
    return run
  }) as typeof fetch
  return { count: () => requests, tolerateGameFailures: (on: boolean) => (tolerate = on), restore: () => (globalThis.fetch = realFetch) }
}

let failures: FailedGame[] = []
const reportFailures = () => {
  for (const line of failedReport(failures)) log(line)
}

async function main() {
  const g = await guard({ write: args.apply })
  writeFileSync(logPath, `# backfill-matches ${new Date().toISOString()} args=${JSON.stringify({ ...args, logPath })}\n`)
  logReady = true
  log(`[backfill] target ${g.target}, mode ${args.apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}, delay ${args.delayMs} ms, log ${logPath}`)
  const net = throttlePlayHQ(args.delayMs)
  const payload = await getPayload({ config })
  const t = matchTables(payload)
  const db = payload.db.drizzle
  try {
    if (args.apply) {
      // The nightly sync replaces the same match rows; two writers on one game can collide on the unique keys.
      const runs = playerTables(payload).player_sync_runs
      const [latest] = await db.select().from(runs).orderBy(desc(runs.startedAt)).limit(1)
      if (latest && isLocked({ status: latest.status, startedAt: new Date(latest.startedAt) }, new Date())) {
        throw new Error('A player sync is running right now (started ' + new Date(latest.startedAt).toISOString() + '). Wait for it to finish (it ends within minutes), then run this again. The nightly cron is at 17:00 UTC.')
      }
    }
    // 1. Seasons, teams and team fixtures (no summary calls).
    const groups = (await getSeasonGroups()).filter((s) => s.seasons.some((x) => !x.isJunior))
    const names = selectSeasons(groups.map((s) => s.name), args.seasons)
    if (!names.length) throw new Error(`No senior season matches ${JSON.stringify(args.seasons)}. Known: ${groups.map((s) => s.name).join(', ')}`)
    const fixtures: FixtureGame[] = []
    const teamsOf = new Map<string, { clubIds: Set<string>; competitionName: string; seasonName: string }>()
    for (const group of groups.filter((x) => names.includes(x.name))) {
      const teams = await getClubTeams(group)
      const clubIds = new Set(teams.map((x) => x.id))
      for (const team of teams.filter((x) => !x.isJunior && !isJuniorGrade(x.gradeName ?? ''))) {
        if (args.teamId && team.id !== args.teamId) continue
        teamsOf.set(team.id, { clubIds, competitionName: team.competitionName, seasonName: group.name })
        for (const game of await getTeamGames(team, clubIds)) fixtures.push({ seasonName: group.name, teamId: team.id, teamName: team.name, game })
      }
    }
    const storedRows: { gameId: string; playhqUpdatedAt: string | null; sourceHash: string | null }[] = await db
      .select({ gameId: t.matches.gameId, playhqUpdatedAt: t.matches.playhqUpdatedAt, sourceHash: t.matches.sourceHash })
      .from(t.matches)
    const stored = new Map<string, StoredStamp>(storedRows.map((r) => [r.gameId, { playhqUpdatedAt: r.playhqUpdatedAt, sourceHash: r.sourceHash }]))
    const plan = planBackfill(fixtures, stored, args)

    log(`[plan] seasons: ${names.join(', ')}`)
    for (const grp of plan.groups) log(`[plan] ${grp.seasonName} / ${grp.teamName}: ${grp.fetch} to fetch, ${grp.skip} already stored and current`)
    if (plan.excluded.length) log(`[plan] ${plan.excluded.length} games left out by --skip-game: ${plan.excluded.map((x) => x.game.id).join(', ')}`)
    log(`[plan] ${plan.toFetch.length} summary requests to make, ${plan.upToDate.length} games up to date${plan.deferred.length ? `, ${plan.deferred.length} left for a later run by --limit` : ''}`)
    log(`[plan] estimated time for the summaries: about ${estimateSeconds(plan.toFetch.length, args.delayMs)} s at ${args.delayMs} ms per request`)
    if (!args.apply) {
      log(`[dry run] ${net.count()} PlayHQ requests made so far (seasons, teams, fixtures). Nothing was written. Add --apply --confirm to write.`)
      return
    }

    // 2. The games, one at a time.
    const aliasRows: { nameKey: string; player: number }[] = await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases)
    const aliasMap = new Map(aliasRows.map((a) => [a.nameKey, a.player]))
    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0, error: 0 }
    const raws = new Map<string, RawGameSummary[]>() // `${teamId}|${season}` -> summaries of kept games
    const failed = new Set<string>() // team-seasons with a failed game: not reconciled
    net.tolerateGameFailures(args.continueOnError)
    const run = await runGames(plan.toFetch, args, {
      fetchGame: (f) => getRawGameSummary(f.game.id, { status: 'FINAL', fresh: true }),
      storeGame: async (f, raw) => {
        const info = teamsOf.get(f.teamId)!
        try {
          const bundle = mapMatchBundle(raw, {
            clubOrgId: PLAYHQ_ORG_ID, clubIds: info.clubIds, seasonName: f.seasonName, seasonStartYear: seasonStartYearOf(f.seasonName),
            competitionName: info.competitionName, isJunior: false, fixture: f.game as never,
          })
          if (isSkip(bundle)) {
            counts.skipped++
            log(`[game] ${f.game.id} skipped:${bundle.skip}`)
            return
          }
          for (const w of bundle.warnings) log(`[game] ${f.game.id} unknown_shape ${w}`)
          const action = await upsertMatchBundle(payload, bundle, aliasMap)
          counts[action]++
          raws.set(pairKey(f.teamId, f.seasonName), [...(raws.get(pairKey(f.teamId, f.seasonName)) ?? []), raw])
          log(`[game] ${f.game.id} ${action} (${f.seasonName} / ${f.teamName}, ${bundle.match.localDate})`)
        } catch (err) {
          failed.add(pairKey(f.teamId, f.seasonName))
          throw err
        }
      },
      onFailed: (x) => {
        counts.error++
        failed.add(pairKey(x.teamId, x.seasonName))
        log(`[game] ${x.gameId} ${args.continueOnError ? 'FAILED' : 'error'}: ${x.error}`)
      },
    })
    failures = run.failed
    net.tolerateGameFailures(false)
    if (run.stopped) throw new StopRun(run.stopped)
    const relinked = await relinkMatchPlayers(payload)

    // 3. Reconcile only the (team, season) pairs whose every FINAL game was fetched in this run.
    const aggregates: TeamAggregate[] = []
    let partial = 0
    for (const grp of plan.groups) {
      const key = pairKey(grp.teamId, grp.seasonName)
      const complete = grp.skip === 0 && grp.excluded === 0 && !plan.deferred.some((d) => d.teamId === grp.teamId && d.seasonName === grp.seasonName) && !failed.has(key)
      const list = raws.get(key) ?? []
      if (!complete || !list.length) {
        partial++
        continue
      }
      const stats = aggregatePlayers(list.map((r) => mapScorecard(r, PLAYHQ_ORG_ID, false)), grp.teamId, false)
      aggregates.push({ seasonName: grp.seasonName, seasonOrder: 0, teamId: grp.teamId, teamName: grp.teamName, gradeName: null, stats })
    }
    const rec = await reconcileMatchStore(payload, { aggregates, aliasMap: new Map((await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases)).map((a: { nameKey: string; player: number }) => [a.nameKey, a.player])), skipPairs: failed })
    for (const m of rec.samples) log(`[reconcile] mismatch ${JSON.stringify(m)}`)
    log(`[summary] created ${counts.created}, updated ${counts.updated}, unchanged ${counts.unchanged}, skipped ${counts.skipped}, failed/errors ${counts.error}; already current ${plan.upToDate.length}; ${net.count()} PlayHQ requests`)
    log(`[summary] club rows relinked to players: ${relinked}; players without an alias stay unlinked until the next player sync`)
    log(`[reconcile] ${rec.pairsCompared} team-seasons compared (${rec.playersCompared} players), ${rec.mismatchedPlayers} players mismatched; ${partial} team-seasons not compared because the run did not cover every game (the nightly sync reconciles them)`)
    reportFailures()
    if (failures.length) log(`[WARNING] ${failures.length} game${failures.length === 1 ? '' : 's'} failed and ${failures.length === 1 ? 'was' : 'were'} NOT stored (listed above). The run finished otherwise; run the same command again to retry only those, or pass --skip-game <id> for a game PlayHQ keeps rejecting.`)
  } catch (err) {
    if (err instanceof StopRun || (err instanceof PlayHQError && (err.status === 429 || err.status >= 500))) {
      reportFailures()
      log(`[STOPPED] ${err.message}. Not retrying: wait a while, then run the same command again; stored games are skipped.`)
      process.exitCode = 2
    } else throw err
  } finally {
    net.restore()
    await payload.destroy()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
