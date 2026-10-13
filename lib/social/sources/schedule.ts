import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { upcomingFixtures } from '@/lib/selection/store'
import { getPublishedTeam, getPublishedWeekend, WITHHELD_NAME } from '@/lib/teams-queries'
import { groupByWeekend, weekendKey } from '@/lib/selection/weekend'
import type { FixtureGame, FixturesData, FixturesParams } from '../specs/fixtures'
import { lineupRows } from '../filters'
import type { LineupData, LineupParams } from '../specs/lineup'
import type { SourceList } from '../types'
import { CLUB_LOCALE } from '@/config/site'
import { gameRow } from '../game-rows'
import { displayGrade } from '../names'
import { clubToday, dayLabel, loadSocialPlayers, timeLabel } from './shared'

const addDays = (isoDate: string, n: number): string => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export async function fixturesChoices(): Promise<SourceList> {
  const payload = await getPayloadClient()
  const rows = await upcomingFixtures(payload, clubToday())
  const groups = groupByWeekend(rows).slice(0, 6)
  return { choices: groups.map((g) => ({ id: g.key, label: `Weekend of ${dayLabel(g.key)} (${g.rows.length} ${g.rows.length === 1 ? 'game' : 'games'})` })), empty: 'No upcoming games are listed yet.' }
}

export async function loadFixtures(p: FixturesParams): Promise<FixturesData | null> {
  const payload = await getPayloadClient()
  // The Monday to Sunday week the Saturday key belongs to.
  const monday = addDays(weekendKey(p.weekend), -5)
  const sunday = addDays(monday, 6)
  const rows = (await upcomingFixtures(payload, monday)).filter((r) => r.localDate <= sunday)
  const games: FixtureGame[] = rows.map((r) => ({
    grade: displayGrade(r.gradeName), round: r.roundName, dayLabel: dayLabel(r.localDate), time: timeLabel(r.localTime), opponent: r.opponentName,
    venue: [r.venueName, r.venueSuburb].filter(Boolean).join(', '), home: r.isHome,
  }))
  return { weekLabel: dayLabel(weekendKey(p.weekend)), games }
}

export async function lineupChoices(): Promise<SourceList> {
  const weekend = await getPublishedWeekend()
  const teams = weekend?.teams ?? []
  return { version: 2, choices: teams.map((t) => ({ id: t.gameId, label: `${displayGrade(t.gradeName)} v ${t.opponentName}, ${dayLabel(t.localDate)}`, row: gameRow({ date: t.localDate, grade: displayGrade(t.gradeName), round: t.roundName, opposition: t.opponentName, upcoming: true }, CLUB_LOCALE) })), empty: 'No teams have been published yet.' }
}

export async function loadLineup(p: LineupParams): Promise<LineupData | null> {
  const team = await getPublishedTeam(p.gameId)
  if (!team) return null
  const players = await loadSocialPlayers(team.localDate)
  const eligible = new Map([...players.values()].map((x) => [x.slug, x.eligible]))
  const rows = lineupRows(team.slots, eligible, WITHHELD_NAME)
  return {
    grade: displayGrade(team.gradeName), round: team.roundName, opponent: team.opponentName, whenLabel: [dayLabel(team.localDate), timeLabel(team.localTime)].filter(Boolean).join(', '),
    venue: team.venueName ?? '', showOrder: team.showOrder, updated: team.updated, players: rows,
  }
}
