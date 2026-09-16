import { PLAYHQ_ORG_ID, mapLimit, phqFetch, phqFetchAll } from './client'
import { groupSeasons, isJuniorCompetition, pickDefaultSeason } from './seasons'
import { dedupeGames, isFinished, mapGame } from './games'
import { mapScorecard } from './scorecard'
import { aggregatePlayers } from './players'
import { mapLadder } from './ladder'
import type { ClubTeam, Game, Ladder, PlayerSeasonStats, RawFixtureGame, RawGameSummary, RawLadder, RawSeason, RawTeam, Scorecard, SeasonGroup } from './types'

export const TTL = { seasons: 21600, teams: 21600, fixture: 1800, ladder: 3600, gameFinal: 604800, gameLive: 900 }

export async function getSeasonGroups(): Promise<SeasonGroup[]> {
  const res = await phqFetch<{ data: RawSeason[] }>(`/v1/organisations/${PLAYHQ_ORG_ID}/seasons`, { revalidate: TTL.seasons, tags: ['playhq-seasons'] })
  return groupSeasons(res.data)
}

export async function resolveSeason(param: string | undefined) {
  const groups = await getSeasonGroups()
  const wanted = param ? decodeURIComponent(param) : null
  const season = (wanted && groups.find((g) => g.name === wanted)) || pickDefaultSeason(groups)
  return { groups, season }
}

export async function getClubTeams(season: SeasonGroup): Promise<ClubTeam[]> {
  const perSeason = await Promise.all(
    season.seasons.map(async (s) => {
      const teams = await phqFetchAll<RawTeam>(`/v1/seasons/${s.id}/teams`, { revalidate: TTL.teams, tags: ['playhq-teams'] })
      return teams
        .filter((t) => t.club?.id === PLAYHQ_ORG_ID)
        .map<ClubTeam>((t) => ({ id: t.id, name: t.name, seasonId: s.id, seasonName: season.name, competitionName: s.competitionName, isJunior: s.isJunior, gradeId: t.grade?.id ?? null, gradeName: t.grade?.name ?? null }))
    })
  )
  return perSeason.flat().sort((a, b) => Number(a.isJunior) - Number(b.isJunior) || a.name.localeCompare(b.name))
}

export async function getTeamGames(team: ClubTeam, clubTeamIds: Set<string>): Promise<Game[]> {
  const raw = await phqFetchAll<RawFixtureGame>(`/v1/teams/${team.id}/fixture`, { revalidate: TTL.fixture, tags: ['playhq-fixture'] })
  return raw.map((g) => mapGame(g, clubTeamIds)).filter((g): g is Game => g !== null)
}

export async function getClubGames(season: SeasonGroup) {
  const teams = await getClubTeams(season)
  const ids = new Set(teams.map((t) => t.id))
  const games = await mapLimit(teams, 5, (t) => getTeamGames(t, ids))
  return { teams, games: dedupeGames(games.flat()) }
}

export async function getGameSummary(gameId: string, isJunior: boolean, status?: string): Promise<Scorecard> {
  const res = await phqFetch<{ data: RawGameSummary }>(`/v2/games/${gameId}/summary`, { revalidate: status === 'FINAL' ? TTL.gameFinal : TTL.gameLive, tags: ['playhq-game'] })
  return mapScorecard(res.data, PLAYHQ_ORG_ID, isJunior)
}

export async function getLadder(gradeId: string, clubTeamIds: Set<string>): Promise<Ladder | null> {
  const raw = await phqFetch<RawLadder>(`/v2/grades/${gradeId}/ladder`, { revalidate: TTL.ladder, tags: ['playhq-ladder'] })
  return mapLadder(raw, clubTeamIds)
}

export async function getTeamPlayerStats(team: ClubTeam, games: Game[]): Promise<{ stats: PlayerSeasonStats[]; gamesCounted: number }> {
  const finals = games.filter((g) => g.status === 'FINAL')
  const cards = await mapLimit(finals, 5, (g) =>
    getGameSummary(g.id, team.isJunior, 'FINAL').catch((err) => {
      console.error('[playhq] game summary failed', g.id, err instanceof Error ? err.message : err)
      return null
    })
  )
  const ok = cards.filter((c): c is Scorecard => c !== null)
  return { stats: aggregatePlayers(ok, team.id, team.isJunior), gamesCounted: ok.length }
}

export async function findClubTeam(teamId: string) {
  const groups = await getSeasonGroups()
  for (const season of groups) {
    const team = (await getClubTeams(season)).find((t) => t.id === teamId)
    if (team) return { team, season }
  }
  return null
}

export function isJuniorGrade(gradeName: string) {
  return isJuniorCompetition(gradeName) || /u1\d|under/i.test(gradeName)
}
export { isFinished }

export async function getGameSummaryAuto(gameId: string): Promise<Scorecard | null> {
  const res = await phqFetch<{ data: RawGameSummary }>(`/v2/games/${gameId}/summary`, { revalidate: TTL.gameLive, tags: ['playhq-game'] })
  const raw = res.data
  if (!raw.teams.some((t) => t.organisation?.id === PLAYHQ_ORG_ID)) return null
  return mapScorecard(raw, PLAYHQ_ORG_ID, isJuniorGrade(raw.grade?.name ?? ''))
}
