import type { Game, GameSide, RawCompetitor, RawFixtureGame } from './types'

function side(c: RawCompetitor): GameSide {
  return { id: c.id, name: c.name, isHome: c.isHomeTeam, outcome: c.outcome ?? null, score: c.scoreTotal ?? null }
}

export function mapGame(raw: RawFixtureGame, clubTeamIds: Set<string>): Game | null {
  const clubRaw = raw.competitors.find((c) => clubTeamIds.has(c.id))
  if (!clubRaw) return null
  const oppRaw = raw.competitors.find((c) => c.id !== clubRaw.id) ?? clubRaw
  const localDate = raw.schedule?.date ?? null
  const localTime = raw.schedule?.time ?? null
  return {
    id: raw.id, status: raw.status, url: raw.url,
    gradeId: raw.grade?.id ?? null, gradeName: raw.grade?.name ?? null,
    roundName: raw.round?.name ?? null, roundAbbr: raw.round?.abbreviatedName ?? null,
    isFinalRound: raw.round?.isFinalRound ?? false,
    localDate, localTime, sortKey: `${localDate ?? '9999-12-31'}T${localTime ?? '00:00:00'}`,
    venueName: raw.venue?.name ?? null, venueSuburb: raw.venue?.address?.suburb ?? null,
    club: side(clubRaw), opponent: side(oppRaw),
    isClubDerby: clubTeamIds.has(oppRaw.id) && oppRaw.id !== clubRaw.id,
  }
}

export function isFinished(g: Game): boolean {
  return g.status === 'FINAL' || g.status === 'ABANDONED'
}

type Wickets = { club: number | null; opponent: number | null; clubDeclared?: boolean; opponentDeclared?: boolean }

function scoreText(side: GameSide, wickets: number | null | undefined, declared?: boolean) {
  if (side.score == null) return side.name
  const w = wickets != null && wickets < 10 ? `${wickets}/` : ''
  return `${side.name} ${w}${side.score}${declared ? ' dec' : ''}`
}

export function resultSentence(g: Game, w?: Wickets): string {
  const o = g.club.outcome
  if (g.status === 'ABANDONED' || o === 'ABANDONED') return 'Match abandoned'
  if (!o) return ''
  if (o === 'WON_BY_FORFEIT') return `${g.club.name} won by forfeit`
  if (o === 'LOST_BY_FORFEIT') return `${g.club.name} lost by forfeit`
  if (o === 'DRAW' || o === 'DREW') return `${g.club.name} drew with ${g.opponent.name}`
  if (o === 'TIE' || o === 'TIED') return `${g.club.name} tied with ${g.opponent.name}`
  if (o === 'NO_RESULT') return 'No result'
  const club = scoreText(g.club, w?.club, w?.clubDeclared)
  const opp = scoreText(g.opponent, w?.opponent, w?.opponentDeclared)
  const suffix = o.endsWith('_ON_FIRST_INNINGS') ? ' on first innings' : ''
  if (o.startsWith('WON')) return `${club} defeated ${opp}${suffix}`
  if (o.startsWith('LOST')) return `${club} lost to ${opp}${suffix}`
  return `${club} v ${opp}`
}

export const sortUpcoming = (games: Game[]) => [...games].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
export const sortResults = (games: Game[]) => [...games].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
export function dedupeGames(games: Game[]): Game[] {
  const seen = new Set<string>()
  return games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)))
}
