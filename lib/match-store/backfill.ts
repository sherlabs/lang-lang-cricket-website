import type { Game } from '@/lib/playhq/types'

/**
 * Pure helpers of `pnpm backfill:matches` (WP-M, spec M4): argument parsing and the plan of which
 * games to fetch. No database, no network, so both are unit-tested. The guard flags (`--target`,
 * `--confirm`) are checked by `payload/scripts/_guard.ts`, not here.
 */

export const MIN_DELAY_MS = 500
export const DEFAULT_DELAY_MS = 1500

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
}

const KNOWN = new Set(['--target', '--confirm', '--apply', '--season', '--since', '--limit', '--team', '--delay-ms', '--log', '--force'])
const WITH_VALUE = new Set(['--target', '--season', '--since', '--limit', '--team', '--delay-ms', '--log'])

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const out: BackfillArgs = { apply: false, seasons: [], since: null, limit: null, teamId: null, delayMs: DEFAULT_DELAY_MS, logPath: null, force: false }
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
export type PlanOpts = Pick<BackfillArgs, 'since' | 'limit' | 'teamId' | 'force'>
export type PlanGroup = { seasonName: string; teamId: string; teamName: string; fetch: number; skip: number }
export type BackfillPlan = {
  toFetch: FixtureGame[]
  /** FINAL games that are already stored with the fixture's stamp (no summary call needed). */
  upToDate: FixtureGame[]
  /** FINAL games left out by `--limit` (a later invocation picks them up). */
  deferred: FixtureGame[]
  groups: PlanGroup[]
}

/**
 * Which FINAL games need a summary call. A game whose stored `playhqUpdatedAt` equals the fixture's
 * (and that has a stored hash) is up to date and skipped without a call; the database is the
 * checkpoint, so re-running after an interruption continues where it stopped.
 */
export function planBackfill(fixtures: readonly FixtureGame[], stored: ReadonlyMap<string, StoredStamp>, opts: PlanOpts): BackfillPlan {
  const plan: BackfillPlan = { toFetch: [], upToDate: [], deferred: [], groups: [] }
  const groups = new Map<string, PlanGroup>()
  const seen = new Set<string>()
  for (const f of fixtures) {
    if (f.game.status !== 'FINAL' || seen.has(f.game.id)) continue
    if (opts.teamId && f.teamId !== opts.teamId) continue
    if (opts.since && (f.game.localDate ?? '0000-00-00') < opts.since) continue
    seen.add(f.game.id)
    const key = `${f.seasonName}|${f.teamId}`
    const group = groups.get(key) ?? { seasonName: f.seasonName, teamId: f.teamId, teamName: f.teamName, fetch: 0, skip: 0 }
    groups.set(key, group)
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
