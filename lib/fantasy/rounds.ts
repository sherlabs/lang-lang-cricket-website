import { groupByWeekend, weekendKey } from '../selection/weekend'
import { wallClockToUtc } from '../selection/fixtures-plan'

/**
 * Fantasy rounds (wave F spec 4.1). A round is one club weekend (Monday to Sunday, keyed by its Saturday) and is DERIVED from the
 * stored selection fixtures; the only stored extras are the lowest lock time seen, a committee lock override and a manual scored mark
 * (`fantasy-round-state`). Pure: dates come in, a lock and a status come out, with the clock injected.
 */
export type RoundFixture = { gameId: string; localDate: string; startsAt: string | null; status: string }

/**
 * Fixture statuses that mean "played to no result". Today a selection fixture only carries `upcoming`, `final` or `removed`, and the
 * match store keeps only FINAL games, so a game PlayHQ calls ABANDONED never reaches a state with this value; the committee closes
 * that round with Mark round scored. The constant is the one place to extend if the fixtures ever carry such a status.
 */
export const NO_RESULT_FIXTURE_STATUSES: readonly string[] = ['abandoned']

/** What the match store says about a stored FINAL game: its result is `abandoned` or it was a forfeit (no appearances are scored). */
export type StoredGame = { gameId: string; date: string | null; noResult: boolean }

export type RoundStatus = 'upcoming' | 'locked' | 'scored'

const earliest = (dates: readonly (Date | null)[]): Date | null => {
  const ok = dates.filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
  return ok.length ? new Date(Math.min(...ok.map((d) => d.getTime()))) : null
}

/** The earliest start among the fixtures of a round (null when none has a start time). */
export function earliestStart(fixtures: readonly Pick<RoundFixture, 'startsAt'>[]): Date | null {
  return earliest(fixtures.map((f) => (f.startsAt ? new Date(f.startsAt) : null)))
}

/**
 * The lock of a round: the earliest of the stored lock (never raised), the earliest fixture start now, and a committee override;
 * with nothing to go on, 00:00 club time on the Saturday. A fixture moved LATER therefore never reopens a round, and one moved
 * EARLIER locks it sooner.
 */
export function effectiveLock(o: { weekendKey: string; storedLocksAt?: string | Date | null; lockOverride?: string | Date | null; fixtures: readonly Pick<RoundFixture, 'startsAt'>[] }): Date {
  const stored = o.storedLocksAt ? new Date(o.storedLocksAt) : null
  const override = o.lockOverride ? new Date(o.lockOverride) : null
  const fromFixtures = earliestStart(o.fixtures)
  const best = earliest([stored, override, fromFixtures])
  if (best) return best
  const fallback = wallClockToUtc(o.weekendKey, '00:00')
  return fallback ? new Date(fallback) : new Date(`${o.weekendKey}T00:00:00Z`)
}

/** Is `fixture` finished for the purposes of scoring? A stored FINAL game, or a status that means no result. */
export function isTerminal(fixture: Pick<RoundFixture, 'gameId' | 'status'>, storedGameIds: ReadonlySet<string>): boolean {
  return storedGameIds.has(fixture.gameId) || NO_RESULT_FIXTURE_STATUSES.includes(fixture.status)
}

export type RoundView = {
  key: string
  fixtures: RoundFixture[]
  locksAt: Date
  status: RoundStatus
  /** Scored by the committee rather than by the fixtures. */
  closedByCommittee: boolean
  /** Points are final only when scored; until then they are provisional. */
  provisional: boolean
}

export type RoundStateRow = { weekendKey: string; locksAt?: string | Date | null; lockOverride?: string | Date | null; scoredManually?: boolean | null }

/**
 * Every round with a live (non-removed) fixture, oldest first. A round with no live fixtures does not exist, so it never blocks
 * anything. `scored` needs every live fixture terminal, or a manual mark.
 */
export function buildRounds(fixtures: readonly RoundFixture[], states: readonly RoundStateRow[], storedGameIds: ReadonlySet<string>, now: Date): RoundView[] {
  const live = fixtures.filter((f) => f.status !== 'removed' && /^\d{4}-\d{2}-\d{2}$/.test(f.localDate))
  const byKey = new Map(states.map((s) => [s.weekendKey, s]))
  return groupByWeekend(live).map(({ key, rows }) => {
    const st = byKey.get(key)
    const locksAt = effectiveLock({ weekendKey: key, storedLocksAt: st?.locksAt, lockOverride: st?.lockOverride, fixtures: rows })
    const manual = Boolean(st?.scoredManually)
    const allTerminal = rows.length > 0 && rows.every((f) => isTerminal(f, storedGameIds))
    const scored = manual || allTerminal
    const status: RoundStatus = now.getTime() < locksAt.getTime() ? 'upcoming' : scored ? 'scored' : 'locked'
    return { key, fixtures: rows, locksAt, status, closedByCommittee: manual && !allTerminal, provisional: status !== 'scored' }
  })
}

/** The round managers are picking for: the first whose lock is still in the future. */
export function currentRound(rounds: readonly RoundView[], now: Date): RoundView | null {
  return rounds.find((r) => now.getTime() < r.locksAt.getTime()) ?? null
}

/** The weekend a club-local date belongs to. */
export const roundOfDate = (localDate: string): string => weekendKey(localDate)

/** A stored game that scores no appearance (abandoned, or forfeited). */
export const scoresNothing = (g: Pick<StoredGame, 'noResult'>): boolean => g.noResult

/**
 * The dates a fantasy season covers: from the first day of the club's season-start month in its start year to the day before the
 * next season starts. Fixtures are kept forever, so without this window last season's weekends would show up as rounds.
 */
export function seasonWindow(seasonStartYear: number, startMonth: number): { from: string; to: string } {
  const m = String(Math.min(12, Math.max(1, Math.trunc(startMonth) || 1))).padStart(2, '0')
  return { from: `${seasonStartYear}-${m}-01`, to: `${seasonStartYear + 1}-${m}-01` }
}
