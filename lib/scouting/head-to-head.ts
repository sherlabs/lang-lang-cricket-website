import { newestFirst, type ScoutMatch } from './types'

export type Ledger = {
  played: number
  won: number
  lost: number
  drawn: number
  tied: number
  noResult: number
  /** Games stored with no result at all (a blank import): neither a win nor a loss. */
  unknown: number
  wonByForfeit: number
  lostByForfeit: number
}

export const emptyLedger = (): Ledger => ({ played: 0, won: 0, lost: 0, drawn: 0, tied: 0, noResult: 0, unknown: 0, wonByForfeit: 0, lostByForfeit: 0 })

export function ledgerOf(matches: readonly ScoutMatch[]): Ledger {
  const l = emptyLedger()
  for (const m of matches) {
    l.played++
    if (m.forfeit && (m.result === 'won' || m.result === 'lost')) {
      if (m.result === 'won') l.wonByForfeit++
      else l.lostByForfeit++
    } else if (m.result === 'won') l.won++
    else if (m.result === 'lost') l.lost++
    else if (m.result === 'draw') l.drawn++
    else if (m.result === 'tie') l.tied++
    else if (m.result === 'no_result' || m.result === 'abandoned') l.noResult++
    else l.unknown++
  }
  return l
}

/** One side's innings in a game, as "runs/wickets" parts. */
export type ScoreLine = { runs: number | null; wickets: number | null }[]

export type LastMeeting = {
  gameId: string
  date: string | null
  grade: string | null
  result: ScoutMatch['result']
  forfeit: boolean
  venue: string | null
  ours: ScoreLine
  theirs: ScoreLine
}

/** Their result against us, from their point of view. `forfeit` marks a result by forfeit. */
export type TheirResult = { gameId: string; date: string | null; outcome: 'W' | 'L' | 'D' | 'T' | 'N' | '?'; forfeit: boolean }

export type VenueRow = { venue: string; ledger: Ledger }
export type SeasonRow = { season: string; seasonYear: number | null; ledger: Ledger }

export type HeadToHead = {
  total: Ledger
  home: Ledger
  away: Ledger
  bySeason: SeasonRow[]
  venues: VenueRow[]
  last: LastMeeting | null
  /** Their last results against us, newest first. The store holds only games against the club. */
  theirRecent: TheirResult[]
}

const scoreOf = (m: ScoutMatch, club: boolean): ScoreLine =>
  m.innings.filter((i) => i.played && i.clubBatting === club).sort((a, b) => a.seq - b.seq).map((i) => ({ runs: i.runs, wickets: i.wickets }))

function theirOutcome(m: ScoutMatch): TheirResult['outcome'] {
  if (m.result === 'won') return 'L'
  if (m.result === 'lost') return 'W'
  if (m.result === 'draw') return 'D'
  if (m.result === 'tie') return 'T'
  if (m.result === 'no_result' || m.result === 'abandoned') return 'N'
  return '?'
}

export function headToHead(matches: readonly ScoutMatch[], recent: number): HeadToHead {
  const sorted = [...matches].sort(newestFirst)
  const seasons = new Map<string, { year: number | null; ms: ScoutMatch[] }>()
  const venues = new Map<string, ScoutMatch[]>()
  for (const m of sorted) {
    const s = seasons.get(m.season)
    if (s) s.ms.push(m)
    else seasons.set(m.season, { year: m.seasonYear, ms: [m] })
    if (m.venue?.trim()) venues.set(m.venue.trim(), [...(venues.get(m.venue.trim()) ?? []), m])
  }
  const last = sorted[0]
  return {
    total: ledgerOf(sorted),
    home: ledgerOf(sorted.filter((m) => m.isHome)),
    away: ledgerOf(sorted.filter((m) => !m.isHome)),
    bySeason: [...seasons].map(([season, v]) => ({ season, seasonYear: v.year, ledger: ledgerOf(v.ms) })).sort((a, b) => (b.seasonYear ?? -1) - (a.seasonYear ?? -1) || a.season.localeCompare(b.season)),
    venues: [...venues].map(([venue, ms]) => ({ venue, ledger: ledgerOf(ms) })).sort((a, b) => b.ledger.played - a.ledger.played || a.venue.localeCompare(b.venue)),
    last: last
      ? { gameId: last.gameId, date: last.date, grade: last.grade, result: last.result, forfeit: last.forfeit, venue: last.venue, ours: scoreOf(last, true), theirs: scoreOf(last, false) }
      : null,
    theirRecent: sorted.slice(0, recent).map((m) => ({ gameId: m.gameId, date: m.date, outcome: theirOutcome(m), forfeit: m.forfeit })),
  }
}

export type GameRow = { gameId: string; date: string | null; grade: string | null; venue: string | null; isHome: boolean; result: ScoutMatch['result']; forfeit: boolean; ours: ScoreLine; theirs: ScoreLine }

/** The plain ledger of games, newest first: what the page leads with when there are too few games for a plan. */
export const gameRows = (matches: readonly ScoutMatch[]): GameRow[] =>
  [...matches].sort(newestFirst).map((m) => ({ gameId: m.gameId, date: m.date, grade: m.grade, venue: m.venue, isHome: m.isHome, result: m.result, forfeit: m.forfeit, ours: scoreOf(m, true), theirs: scoreOf(m, false) }))
