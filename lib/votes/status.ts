import { CLUB_TIMEZONE, SEASON_START_MONTH } from '@/config/site'
import { wallClockToUtc } from '@/lib/selection/fixtures-plan'
import { localDateOf } from '@/lib/selection/weekend'
import type { VoteSettings } from './settings'

/**
 * When a game can be voted on (wave B spec 3.3). The window is a pure function of the game date and `voteWindowDays`: nothing
 * writes the close to the row, no cron closes it. A selector can override with `votesState` (`open` or `closed`).
 */
export type VoteFixture = { status: string; localDate: string; votesState?: string | null; countsForAwards?: boolean | null }
export type VoteStatus = 'pending' | 'open' | 'closed'

const MS_DAY = 86_400_000
export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? localDate : new Date(d.getTime() + days * MS_DAY).toISOString().slice(0, 10)
}

/** The instant the window closes: the start of the club-local day after the last open day. */
export function windowClosesAt(localDate: string, voteWindowDays: number, tz: string = CLUB_TIMEZONE): Date | null {
  const iso = wallClockToUtc(addDays(localDate, voteWindowDays + 1), '00:00', tz)
  return iso ? new Date(iso) : null
}

export function voteStatus(f: VoteFixture, settings: Pick<VoteSettings, 'voteWindowDays'>, now: Date = new Date(), tz: string = CLUB_TIMEZONE): VoteStatus {
  if (f.status !== 'final') return 'pending'
  if (f.votesState === 'open') return 'open'
  if (f.votesState === 'closed') return 'closed'
  // Compare club-local dates: open through the end of the local day `voteWindowDays` after the game.
  return localDateOf(now, tz) <= addDays(f.localDate, settings.voteWindowDays) ? 'open' : 'closed'
}

/** A finished game that counts towards the awards (not excluded, for example a washed-out game). */
export const isCounting = (f: Pick<VoteFixture, 'status' | 'countsForAwards'>): boolean => f.status === 'final' && f.countsForAwards !== false

/** A ballot cast at `castAt` can be changed until the earlier of "cast + edit hours" and the close of the voting window. */
export function editWindowOpen(f: VoteFixture, castAt: Date | string | null | undefined, settings: Pick<VoteSettings, 'voteWindowDays' | 'editWindowHours'>, now: Date = new Date(), tz: string = CLUB_TIMEZONE): boolean {
  if (voteStatus(f, settings, now, tz) !== 'open') return false
  if (!castAt) return true
  const cast = new Date(castAt).getTime()
  if (!Number.isFinite(cast)) return false
  if (now.getTime() >= cast + settings.editWindowHours * 3_600_000) return false
  // A manual `open` override ignores the computed close; otherwise the window's close also ends editing.
  if (f.votesState !== 'open') {
    const close = windowClosesAt(f.localDate, settings.voteWindowDays, tz)
    if (close && now.getTime() >= close.getTime()) return false
  }
  return true
}

/** The season (start year) a club-local date belongs to. */
export function seasonStartYearOfDate(localDate: string, startMonth: number = SEASON_START_MONTH): number {
  const year = Number(localDate.slice(0, 4))
  const month = Number(localDate.slice(5, 7))
  return month >= startMonth ? year : year - 1
}
