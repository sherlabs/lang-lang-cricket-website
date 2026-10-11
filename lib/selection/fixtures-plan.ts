import { AVAILABILITY, CLUB_TIMEZONE } from '@/config/site'
import type { ClubTeam, Game } from '@/lib/playhq/types'
import { normaliseLabel } from '@/lib/stats/labels'

/**
 * Selection fixtures (announce-teams spec 4.3): a durable copy of the club's upcoming senior games, so availability and team
 * sheets keep a stable key through a PlayHQ outage, a cache expiry or a reschedule. This file is pure: it maps PlayHQ games to
 * rows and plans the upsert (new, moved, removed, kept). Rows are never deleted; a game that vanishes becomes `removed`.
 */
export type FixtureStatus = 'upcoming' | 'final' | 'removed'
export type FixtureInput = {
  gameId: string
  /** PlayHQ's grade id, or `name:<normalised grade name>` when PlayHQ gave none, so every fixture has one. */
  gradeId: string
  gradeName: string
  clubTeamId: string
  clubTeamName: string
  roundName: string | null
  localDate: string
  localTime: string | null
  startsAt: string | null
  venueName: string | null
  venueSuburb: string | null
  opponentName: string
  isHome: boolean
  status: FixtureStatus
}
export type StoredFixture = FixtureInput & { id: number | string }

/** Offset of `tz` from UTC in minutes at the UTC instant `at`. */
function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
  const g = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value)
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - at.getTime()) / 60_000
}

/** The UTC instant of a wall-clock date and time in `tz` (daylight saving aware; a missing time means 00:00). ISO string, or null for a bad date. */
export function wallClockToUtc(localDate: string, localTime: string | null, tz: string = CLUB_TIMEZONE): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!d) return null
  const t = /^(\d{2}):(\d{2})/.exec(localTime ?? '00:00')
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0)
  // Two passes settle the offset around a daylight-saving change.
  let utc = guess - offsetMinutes(new Date(guess), tz) * 60_000
  utc = guess - offsetMinutes(new Date(utc), tz) * 60_000
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null
}

/** A PlayHQ game as a fixture row, or null when it has no date or is not one of the club's teams. */
export function gameToFixture(game: Game, team: Pick<ClubTeam, 'id' | 'name'> | undefined): FixtureInput | null {
  if (!game.localDate || !team) return null
  return {
    gameId: game.id,
    gradeId: game.gradeId ?? `name:${normaliseLabel(game.gradeName)}`,
    gradeName: game.gradeName ?? '',
    clubTeamId: team.id,
    clubTeamName: team.name,
    roundName: game.roundName,
    localDate: game.localDate,
    localTime: game.localTime,
    startsAt: wallClockToUtc(game.localDate, game.localTime),
    venueName: game.venueName,
    venueSuburb: game.venueSuburb,
    opponentName: game.opponent.name,
    isHome: game.club.isHome,
    status: game.status === 'FINAL' ? 'final' : 'upcoming',
  }
}

/** Is `localDate` (YYYY-MM-DD) inside the kept window around `today`? */
export function inWindow(localDate: string, today: string, back: number = AVAILABILITY.fixturesBackDays, ahead: number = AVAILABILITY.fixturesAheadDays): boolean {
  const day = (s: string) => Date.parse(`${s}T00:00:00Z`)
  const diff = (day(localDate) - day(today)) / 86_400_000
  return Number.isFinite(diff) && diff >= -back && diff <= ahead
}

const FIELDS = ['gradeId', 'gradeName', 'clubTeamId', 'clubTeamName', 'roundName', 'localDate', 'localTime', 'startsAt', 'venueName', 'venueSuburb', 'opponentName', 'isHome', 'status'] as const
const norm = (v: unknown) => (v === undefined || v === '' ? null : v)

export type FixturePlan = {
  create: FixtureInput[]
  update: { id: number | string; data: Partial<FixtureInput>; moved: boolean }[]
  /** Stored upcoming games PlayHQ no longer lists. */
  remove: (number | string)[]
  kept: number
  skippedOutOfWindow: number
}

/**
 * Plans the upsert. Incoming games outside the window are skipped; a stored upcoming game that PlayHQ no longer returns becomes
 * `removed` (its availability and sheet stay); a stored `removed` game that returns is restored.
 */
export function planFixtureUpsert(incoming: readonly FixtureInput[], stored: readonly StoredFixture[], today: string): FixturePlan {
  const plan: FixturePlan = { create: [], update: [], remove: [], kept: 0, skippedOutOfWindow: 0 }
  const byGame = new Map(stored.map((s) => [s.gameId, s]))
  const seen = new Set<string>()
  for (const g of incoming) {
    if (!inWindow(g.localDate, today)) {
      plan.skippedOutOfWindow += 1
      continue
    }
    seen.add(g.gameId)
    const old = byGame.get(g.gameId)
    if (!old) {
      plan.create.push(g)
      continue
    }
    const data: Partial<FixtureInput> = {}
    for (const f of FIELDS) if (norm(old[f]) !== norm(g[f])) (data as Record<string, unknown>)[f] = g[f]
    if (Object.keys(data).length === 0) plan.kept += 1
    else plan.update.push({ id: old.id, data, moved: 'localDate' in data || 'localTime' in data || 'venueName' in data || 'venueSuburb' in data })
  }
  for (const s of stored) if (!seen.has(s.gameId) && s.status === 'upcoming') plan.remove.push(s.id)
  return plan
}
