import 'server-only'
import type { Payload } from 'payload'
import { CLUB_LOCALE, CLUB_TIMEZONE, fantasyPaths } from '@/config/site'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { fantasyToken } from './link'
import { computeLeaderboard, getSeasonRounds, roundLabel } from './queries'
import { currentRound } from './rounds'
import { getFantasySettings, getOpenSeason, getWorkingSeason, listEntries, loadPool, savedCountForRound, type FantasySeason } from './store'

/** Everything the Fantasy cricket view shows, read once on the server for a staff member. Counts only for this week's squads; no PIN data. */
export type AdminData = {
  isAdmin: boolean
  settings: { enabled: boolean; publicLeaderboard: boolean; competitionName: string }
  shareUrl: string | null
  defaultYear: number
  season: { id: number; name: string; year: number; status: FantasySeason['status']; rules: FantasySeason['rules']; blockedWords: string[] } | null
  thisWeek: { label: string; key: string; locksAt: string; lockText: string; saved: number; total: number } | null
  rounds: { key: string; label: string; status: string; provisional: boolean; closedByCommittee: boolean; lockText: string; reason: string | null }[]
  prices: { playerId: number; name: string; priceTenths: number; autoPriceTenths: number; overridden: boolean; available: boolean; games: number | null; perGame: number | null; thin: boolean }[]
  managers: number
  leaderboardPreview: { rank: number; teamName: string; total: number }[]
}

const lockFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export async function getAdminData(payload: Payload, isAdmin: boolean, now: Date = new Date()): Promise<AdminData> {
  const settings = await getFantasySettings(payload)
  const season = (await getOpenSeason(payload)) ?? (await getWorkingSeason(payload))
  const out: AdminData = {
    isAdmin,
    settings: { enabled: settings.enabled, publicLeaderboard: settings.publicLeaderboard, competitionName: settings.competitionName },
    shareUrl: settings.enabled && season?.status === 'open' ? `${payload.config.serverURL}${fantasyPaths.play(fantasyToken(settings.linkVersion))}` : null,
    defaultYear: currentSeasonStartYear(now),
    season: season ? { id: season.id, name: season.name, year: season.seasonStartYear, status: season.status, rules: season.rules, blockedWords: season.blockedWords } : null,
    thisWeek: null, rounds: [], prices: [], managers: 0, leaderboardPreview: [],
  }
  if (!season) return out
  const { rounds, summaries, reasons } = await getSeasonRounds(payload, season, now)
  const open = currentRound(rounds, now)
  if (open) {
    const counts = await savedCountForRound(payload, season.id, open.key)
    out.thisWeek = { label: roundLabel(open.key), key: open.key, locksAt: open.locksAt.toISOString(), lockText: lockFormat.format(open.locksAt), ...counts }
  }
  out.rounds = summaries.map((s) => ({ key: s.key, label: s.label, status: s.status, provisional: s.provisional, closedByCommittee: s.closedByCommittee, lockText: lockFormat.format(new Date(s.locksAt)), reason: reasons.get(s.key) ?? null }))
  out.managers = (await listEntries(payload, season.id, { includeDisabled: true })).length
  if (isAdmin) {
    const pool = await loadPool(payload, season.id)
    out.prices = [...pool.values()]
      .sort((a, b) => b.priceTenths - a.priceTenths || a.name.localeCompare(b.name))
      .map((p) => ({ playerId: p.id, name: p.name, priceTenths: p.priceTenths, autoPriceTenths: p.autoPriceTenths, overridden: p.overridden, available: p.available, games: p.basis?.games ?? null, perGame: p.basis && p.basis.games > 0 ? Math.round((p.basis.points / p.basis.games) * 10) / 10 : null, thin: p.basis?.thin ?? true }))
  }
  const lb = await computeLeaderboard(payload, season, { now, includeDisabled: true })
  out.leaderboardPreview = lb.rows.slice(0, 10).map((r) => ({ rank: r.rank, teamName: r.teamName, total: r.total }))
  return out
}
