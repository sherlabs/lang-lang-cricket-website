import { PlayHQError } from '@/lib/playhq/client'
import type { Game } from '@/lib/playhq/types'

/**
 * Pure helpers of `pnpm backfill:matches` (WP-M, spec M4): argument parsing and the plan of which
 * games to fetch. No database, no network, so both are unit-tested. The guard flags (`--target`,
 * `--confirm`) are checked by `payload/scripts/_guard.ts`, not here.
 */

export const MIN_DELAY_MS = 500
export const DEFAULT_DELAY_MS = 1500
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5
/** Per-game statuses `--continue-on-error` records as a failed game; anything else that is 5xx-or-429 still stops. */
export const TOLERATED_STATUSES: readonly number[] = [500, 502, 503, 504]

export type BackfillArgs = {
  /** Write to the database. Without it the run is a read-only dry run. */
  apply: boolean
  /** Season group names (or a unique part of one, e.g. `2025/26`); empty means every senior season. */
  seasons: string[]
  /** Earliest local game date, `YYYY-MM-DD`. */
  since: string | null
  /** Most games to fetch in one invocation. */
  limit: number | null
  teamId: string | null
  delayMs: number
  logPath: string | null
  /** Refetch games that are already stored (after a mapper fix). */
  force: boolean
  /** Record a failed game (PlayHQ 500/502/503/504 or an unmappable body) and carry on, instead of stopping. */
  continueOnError: boolean
  /** With `continueOnError`: stop after this many failed games in a row (PlayHQ is down or throttling). */
  maxConsecutiveFailures: number
  /** Known-bad game ids left out of the plan up front (never requested). */
  skipGames: string[]
}

const KNOWN = new Set(['--target', '--confirm', '--apply', '--season', '--since', '--limit', '--team', '--delay-ms', '--log', '--force', '--continue-on-error', '--max-consecutive-failures', '--skip-game'])
const WITH_VALUE = new Set(['--target', '--season', '--since', '--limit', '--team', '--delay-ms', '--log', '--max-consecutive-failures', '--skip-game'])

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const out: BackfillArgs = { apply: false, seasons: [], since: null, limit: null, teamId: null, delayMs: DEFAULT_DELAY_MS, logPath: null, force: false, continueOnError: false, maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES, skipGames: [] }
  const args = argv.filter((a) => a !== '--')
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]
    if (!raw.startsWith('--')) {
      // a value already consumed below, or the script path from `payload run`
      continue
    }
    const eq = raw.indexOf('=')
    const flag = eq === -1 ? raw : raw.slice(0, eq)
    if (!KNOWN.has(flag)) throw new Error(`Unknown option ${flag}`)
    let value: string | undefined
    if (WITH_VALUE.has(flag)) {
      value = eq === -1 ? args[++i] : raw.slice(eq + 1)
      if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${flag} needs a value`)
    }
    switch (flag) {
      case '--apply': out.apply = true; break
      case '--force': out.force = true; break
      case '--continue-on-error': out.continueOnError = true; break
      case '--skip-game': out.skipGames.push(value!); break
      case '--max-consecutive-failures': {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1) throw new Error('--max-consecutive-failures must be a whole number of games, 1 or more')
        out.maxConsecutiveFailures = n
        break
      }
      case '--season': out.seasons.push(value!); break
      case '--team': out.teamId = value!; break
      case '--log': out.logPath = value!; break
      case '--since':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value!) || Number.isNaN(Date.parse(value!))) throw new Error('--since must be a date like 2025-10-01')
        out.since = value!
        break
      case '--limit': {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1) throw new Error('--limit must be a whole number of games, 1 or more')
        out.limit = n
        break
      }
      case '--delay-ms': {
        const n = Number(value)
        if (!Number.isInteger(n) || n < MIN_DELAY_MS) throw new Error(`--delay-ms must be a whole number of at least ${MIN_DELAY_MS} (PlayHQ is the club's live key)`)
        out.delayMs = n
        break
      }
      default: break // --target and --confirm belong to the guard
    }
  }
  return out
}

/** The season group names matching the `--season` filters (exact name, else a case-insensitive part of it). */
export function selectSeasons(names: readonly string[], filters: readonly string[]): string[] {
  if (!filters.length) return [...names]
  return names.filter((n) => filters.some((f) => n === f || n.toLowerCase().includes(f.toLowerCase())))
}

export type FixtureGame = { seasonName: string; teamId: string; teamName: string; game: Pick<Game, 'id' | 'status' | 'updatedAt' | 'localDate'> }
export type StoredStamp = { playhqUpdatedAt: string | null; sourceHash: string | null }
export type PlanOpts = Pick<BackfillArgs, 'since' | 'limit' | 'teamId' | 'force'> & { skipGames?: readonly string[] }
export type PlanGroup = { seasonName: string; teamId: string; teamName: string; fetch: number; skip: number; excluded: number }
export type BackfillPlan = {
  toFetch: FixtureGame[]
  /** FINAL games that are already stored with the fixture's stamp (no summary call needed). */
  upToDate: FixtureGame[]
  /** FINAL games left out by `--limit` (a later invocation picks them up). */
  deferred: FixtureGame[]
  /** FINAL games left out by `--skip-game` (known-bad, never requested). */
  excluded: FixtureGame[]
  groups: PlanGroup[]
}

/**
 * Which FINAL games need a summary call. A game whose stored `playhqUpdatedAt` equals the fixture's
 * (and that has a stored hash) is up to date and skipped without a call; the database is the
 * checkpoint, so re-running after an interruption continues where it stopped.
 */
export function planBackfill(fixtures: readonly FixtureGame[], stored: ReadonlyMap<string, StoredStamp>, opts: PlanOpts): BackfillPlan {
  const plan: BackfillPlan = { toFetch: [], upToDate: [], deferred: [], excluded: [], groups: [] }
  const groups = new Map<string, PlanGroup>()
  const seen = new Set<string>()
  const skipGames = new Set(opts.skipGames ?? [])
  for (const f of fixtures) {
    if (f.game.status !== 'FINAL' || seen.has(f.game.id)) continue
    if (opts.teamId && f.teamId !== opts.teamId) continue
    if (opts.since && (f.game.localDate ?? '0000-00-00') < opts.since) continue
    seen.add(f.game.id)
    const key = `${f.seasonName}|${f.teamId}`
    const group = groups.get(key) ?? { seasonName: f.seasonName, teamId: f.teamId, teamName: f.teamName, fetch: 0, skip: 0, excluded: 0 }
    groups.set(key, group)
    if (skipGames.has(f.game.id)) {
      plan.excluded.push(f)
      group.excluded++
      continue
    }
    const s = stored.get(f.game.id)
    const current = !opts.force && !!s && !!s.sourceHash && !!f.game.updatedAt && s.playhqUpdatedAt === f.game.updatedAt
    if (current) {
      plan.upToDate.push(f)
      group.skip++
    } else if (opts.limit !== null && plan.toFetch.length >= opts.limit) {
      plan.deferred.push(f)
    } else {
      plan.toFetch.push(f)
      group.fetch++
    }
  }
  plan.groups = [...groups.values()]
  return plan
}

export function estimateSeconds(requests: number, delayMs: number): number {
  return Math.ceil((requests * delayMs) / 1000)
}

/** Thrown (by the throttled fetch) to end the run at once: a 429, or a 5xx without `--continue-on-error`. */
export class StopRun extends Error {}

export type FailedGame = {
  gameId: string
  seasonName: string
  teamId: string
  teamName: string
  localDate: string | null
  /** The PlayHQ HTTP status, or null for a game whose body failed to map or store. */
  status: number | null
  error: string
}

export type GamesRunResult = { failed: FailedGame[]; stopped: string | null; processed: number }

export type GamesRunDeps<R> = {
  /** One PlayHQ summary request. A rejection that is not a `PlayHQError` is a network-level failure. */
  fetchGame: (f: FixtureGame) => Promise<R>
  /** Map and write the game. A rejection here is a game that failed to map or store. */
  storeGame: (f: FixtureGame, raw: R) => Promise<void>
  onFailed?: (failure: FailedGame) => void
}

type Verdict = { stop: string } | { failed: FailedGame }

function judge(err: unknown, phase: 'fetch' | 'store', f: FixtureGame, opts: Pick<BackfillArgs, 'continueOnError'>): Verdict {
  const message = err instanceof Error ? err.message : String(err)
  const status = err instanceof PlayHQError ? err.status : null
  const failed: FailedGame = {
    gameId: f.game.id, seasonName: f.seasonName, teamId: f.teamId, teamName: f.teamName, localDate: f.game.localDate ?? null, status, error: message,
  }
  if (err instanceof StopRun) return { stop: message }
  if (err instanceof PlayHQError) {
    // Rate limit, an unset key (status 0) and a rejected key are never a per-game problem.
    if (err.status === 429 || err.status === 0 || err.status === 401 || err.status === 403) return { stop: message }
    if (err.status >= 500 && !(opts.continueOnError && TOLERATED_STATUSES.includes(err.status))) return { stop: message }
    return { failed }
  }
  // Any other rejection of the request itself is a network-level failure; only the opt-in mode changes how it is treated
  // (the default has always recorded it as a game error and carried on).
  if (phase === 'fetch' && opts.continueOnError) return { stop: `Network failure: ${message}` }
  return { failed }
}

/**
 * The per-game loop of the apply run, one request at a time (the caller's fetch is the throttled
 * queue). Default: the first 429 or 5xx stops the run, anything else is recorded as a failed game.
 * `--continue-on-error`: a 500/502/503/504 or a body that fails to map is recorded and the run goes
 * on, but 429, a network failure, and `maxConsecutiveFailures` failed games in a row still stop it.
 * A failed game is never stored (`storeGame` is not called when the fetch failed).
 */
export async function runGames<R>(
  games: readonly FixtureGame[],
  opts: Pick<BackfillArgs, 'continueOnError' | 'maxConsecutiveFailures'>,
  deps: GamesRunDeps<R>,
): Promise<GamesRunResult> {
  const result: GamesRunResult = { failed: [], stopped: null, processed: 0 }
  let consecutive = 0
  for (const f of games) {
    let verdict: Verdict | null = null
    let raw: R | undefined
    try {
      raw = await deps.fetchGame(f)
    } catch (err) {
      verdict = judge(err, 'fetch', f, opts)
    }
    if (!verdict) {
      try {
        await deps.storeGame(f, raw as R)
      } catch (err) {
        verdict = judge(err, 'store', f, opts)
      }
    }
    if (!verdict) {
      consecutive = 0
      result.processed++
      continue
    }
    if ('stop' in verdict) {
      result.stopped = verdict.stop
      return result
    }
    result.failed.push(verdict.failed)
    deps.onFailed?.(verdict.failed)
    consecutive++
    if (opts.continueOnError && consecutive >= opts.maxConsecutiveFailures) {
      result.stopped = `${consecutive} games failed in a row (PlayHQ looks down or throttling)`
      return result
    }
  }
  return result
}

/** The end-of-run lines for failed games: a count, then one line per game id (for the console and the --log file). */
export function failedReport(failed: readonly FailedGame[]): string[] {
  if (!failed.length) return []
  return [
    `[failed] ${failed.length} game${failed.length === 1 ? '' : 's'} failed and were NOT stored (a re-run tries them again; --skip-game <id> leaves one out):`,
    ...failed.map((x) => `[failed] ${x.gameId} ${x.seasonName} / ${x.teamName} (${x.teamId}) ${x.localDate ?? 'no date'} ${x.status !== null ? `HTTP ${x.status}` : 'error'}: ${x.error}`),
  ]
}
