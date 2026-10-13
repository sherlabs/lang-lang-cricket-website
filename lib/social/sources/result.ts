import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import { getMatchByGameId, getMatchWithSquad } from '@/lib/match-store/queries'
import { readStoredBundles } from '@/lib/match-store/read'
import { RESULT_WORDS, resultLetter, resultLineOf, resultWord, sideScore, type InningsScore, type ResultLine } from '@/lib/stats/match/yearbook'
import { CLUB_LOCALE } from '@/config/site'
import { gameRow } from '../game-rows'
import { topBatters, topBowlers } from '../filters'
import { deriveMargin, playedInMatch, potmFigures } from '../results'
import type { PotmData, PotmParams } from '../specs/potm'
import type { ResultData, ResultGame, ResultParams } from '../specs/result'
import type { SourceList } from '../types'
import { getLabelMap } from '@/lib/stats/label-queries'
import { canonicalTeam, type LabelMap } from '@/lib/stats/labels'
import { clubNames, clubToday, dayLabel, gradeLabel, loadSocialPlayers, publicTeam } from './shared'

const RECENT = 24

const shortSide = (innings: readonly InningsScore[]): string =>
  innings.map((i) => (i.runs === null ? '' : `${i.runs}${i.wickets !== null && i.wickets < 10 ? `/${i.wickets}` : ''}`)).filter(Boolean).join(' & ')

const wordOf = (l: ResultLine): string => (resultWord(l) === RESULT_WORDS.U ? '' : resultWord(l))

function toGame(l: ResultLine, labels: LabelMap, club: string, venue = ''): ResultGame {
  const letter = resultLetter(l)
  return {
    gameId: l.gameId, grade: gradeLabel(l.grade, labels), team: publicTeam(canonicalTeam(l.team, labels), l.grade, club), round: l.round, date: l.date ?? '', dateLabel: dayLabel(l.date), venue, opponent: l.opponent,
    letter: letter === 'U' ? '-' : letter, word: wordOf(l), clubScore: sideScore(l.club), oppScore: sideScore(l.opp),
    clubShort: shortSide(l.club), oppShort: shortSide(l.opp), margin: deriveMargin(l),
  }
}

/** The newest finished stored games, newest first. Result lines carry no player data. */
async function recentLines(limit = RECENT): Promise<ResultLine[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'matches', where: { status: { equals: 'FINAL' } }, sort: ['-localDate', '-id'], limit, depth: 0, pagination: false, overrideAccess: true, select: { gameId: true },
  })
  const ids = docs.map((d) => String(d.gameId))
  if (!ids.length) return []
  const bundles = await readStoredBundles(payload, { gameIds: ids })
  const lines = bundles.flatMap((b) => { const l = resultLineOf(b); return l ? [l] : [] })
  return lines.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.gameId.localeCompare(a.gameId))
}

export async function resultChoices(): Promise<SourceList> {
  const [lines, labels, club] = await Promise.all([recentLines(), getLabelMap(), clubNames()])
  const choices: SourceList['choices'] = []
  const dates = [...new Set(lines.map((l) => l.date).filter((d): d is string => !!d))]
  for (const date of dates.slice(0, 3)) {
    const n = lines.filter((l) => l.date === date).length
    if (n > 1) choices.push({ id: `round|${date}`, label: `Whole round: ${dayLabel(date)} (${n} games)` })
  }
  for (const l of lines.slice(0, 24)) {
    const g = toGame(l, labels, club.name)
    choices.push({
      id: `single|${l.gameId}`,
      label: `${[g.grade, l.round].filter(Boolean).join(' ')} v ${l.opponent}, ${dayLabel(l.date)}${wordOf(l) ? `, ${wordOf(l).toLowerCase()}` : ''}`,
      row: gameRow({ date: l.date, grade: g.grade, round: l.round, opposition: l.opponent, letter: g.letter, clubName: club.name, clubScore: g.clubShort, oppScore: g.oppShort }, CLUB_LOCALE),
      variants: [{ id: `single|${l.gameId}`, label: 'Score only' }, { id: `scorecard|${l.gameId}`, label: 'With top performers' }],
    })
  }
  return { version: 2, choices, empty: 'No finished games yet.' }
}

export async function loadResult(p: ResultParams): Promise<ResultData | null> {
  if (p.mode === 'round') {
    const [recent, labels, club] = await Promise.all([recentLines(60), getLabelMap(), clubNames()])
    const games = recent.filter((l) => l.date === p.date)
    if (!games.length) return null
    return { mode: 'round', dateLabel: dayLabel(p.date), round: games[0].round, games: games.map((l) => toGame(l, labels, club.name)).sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true })) }
  }
  const match = await getMatchByGameId(p.gameId)
  if (!match) return null
  const line = resultLineOf(match)
  if (!line) return null
  const game = toGame(line, await getLabelMap(), (await clubNames()).name, [match.match.venueName, match.match.venueSuburb].filter(Boolean).join(', '))
  if (p.mode === 'single') return { mode: 'single', game }
  // Names appear only for eligible players: a junior without the opt-in never reaches a picture.
  const players = await loadSocialPlayers(line.date ?? clubToday())
  const ok = (id: number | null) => id !== null && players.get(id)?.eligible === true
  return { mode: 'scorecard', game, batters: topBatters(match.innings, ok), bowlers: topBowlers(match.innings, ok) }
}

/** The finished games to choose a player of the match from, and the players of one chosen game. */
export async function potmGames(): Promise<SourceList> {
  const [lines, labels, club] = await Promise.all([recentLines(), getLabelMap(), clubNames()])
  return {
    version: 2,
    choices: lines.slice(0, 24).map((l) => {
      const g = toGame(l, labels, club.name)
      return {
        id: l.gameId,
        label: `${[g.grade, l.round].filter(Boolean).join(' ')} v ${l.opponent}, ${dayLabel(l.date)}`,
        row: gameRow({ date: l.date, grade: g.grade, round: l.round, opposition: l.opponent, letter: g.letter, clubName: club.name, clubScore: g.clubShort, oppScore: g.oppShort }, CLUB_LOCALE),
      }
    }),
    empty: 'No finished games yet.',
  }
}

export async function potmPlayers(gameId: string): Promise<SourceList> {
  const match = await getMatchWithSquad(gameId)
  if (!match) return { choices: [], empty: 'That game was not found.' }
  const players = await loadSocialPlayers(match.match.localDate ?? clubToday())
  const seen = new Set<number>()
  const choices: SourceList['choices'] = []
  const add = (id: number | null, name: string) => {
    if (id === null || seen.has(id) || players.get(id)?.eligible !== true) return
    seen.add(id)
    choices.push({ id: `${gameId}|${id}`, label: name })
  }
  for (const s of match.squad) add(s.playerId, s.name)
  for (const inn of match.innings) for (const r of [...inn.batting, ...inn.bowling, ...inn.fielding]) if (r.isClubSide) add(r.playerId, r.name)
  return { choices: choices.sort((a, b) => a.label.localeCompare(b.label)), empty: 'No players can be picked for this game.' }
}

/** The player must be in this stored game's squad or rows and eligible; anything else answers like an unknown id. */
export async function loadPotm(p: PotmParams): Promise<PotmData | null> {
  const match = await getMatchWithSquad(p.gameId)
  if (!match || !playedInMatch(match, p.playerId)) return null
  const date = match.match.localDate ?? clubToday()
  const info = (await loadSocialPlayers(date)).get(p.playerId)
  if (!info?.eligible) return null
  const figures = potmFigures(match, p.playerId)
  return {
    player: info.name, opponent: match.match.opponentOrgName?.trim() || match.match.opponentName?.trim() || 'the opposition', grade: gradeLabel(match.match.gradeName, await getLabelMap()), round: match.match.roundName,
    dateLabel: dayLabel(date), statLine: p.text || figures.statLine, big: figures.big,
  }
}
