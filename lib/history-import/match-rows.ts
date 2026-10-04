import { createHash } from 'node:crypto'
import { JUNIOR_GRADE_RE } from '@/lib/playhq/junior-rules'
import { nameKeyOf, type DismissalType } from '@/lib/playhq/match-rows'
import { slugify } from '@/lib/slugify'
import { commentRow, headerIndex, isExampleName, RowReader } from './cells'
import type { ParsedCsv, RowIssue } from './csv-parse'
import { IMPORT_GAME_PREFIX } from './constants'

/** Match rows: one row per player per game (W2 spec 6.1). Bowler and fielder names are deliberately not importable. */
export const MATCH_ROWS_COLUMNS = [
  'date', 'grade', 'team', 'opponent', 'game_ref', 'format', 'result', 'team_runs', 'team_wickets', 'opp_runs', 'opp_wickets',
  'first_name', 'last_name', 'batted', 'runs', 'balls', 'fours', 'sixes', 'how_out', 'overs', 'maidens', 'runs_conceded', 'wickets',
] as const
export const MATCH_ROWS_EXPORT_EXTRA = ['source', 'hidden'] as const
const REQUIRED = ['date', 'grade', 'team', 'opponent', 'first_name'] as const

export const FORMATS = ['one_day', 'two_day'] as const
export const RESULTS = ['won', 'lost', 'draw', 'tie', 'no_result'] as const
export type ImportResult = (typeof RESULTS)[number]
/** `not_out` plus the dismissal types the match store knows. */
export const HOW_OUT = ['not_out', 'bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'run_out', 'hit_wicket', 'retired_hurt', 'retired', 'retired_out', 'other'] as const

export type MatchPlayerRow = {
  row: number
  firstName: string
  lastName: string
  nameKey: string
  batted: boolean | null
  runs: number | null
  balls: number | null
  fours: number | null
  sixes: number | null
  howOut: (typeof HOW_OUT)[number] | null
  bowlBalls: number | null
  maidens: number | null
  runsConceded: number | null
  wickets: number | null
}
export type ImportedGame = {
  gameId: string
  firstRow: number
  date: string
  seasonStartYear: number
  seasonName: string
  gradeName: string
  teamName: string
  teamSlug: string
  opponent: string
  gameRef: string | null
  format: (typeof FORMATS)[number] | null
  result: ImportResult | null
  teamRuns: number | null
  teamWickets: number | null
  oppRuns: number | null
  oppWickets: number | null
  players: MatchPlayerRow[]
}

/** Cricket seasons start in July: a game on 2013-02-10 belongs to 2012/13. */
export const SEASON_START_MONTH = 7
export function seasonOfDate(date: string): { startYear: number; name: string } {
  const [y, m] = date.split('-').map(Number)
  const startYear = m >= SEASON_START_MONTH ? y : y - 1
  return { startYear, name: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}` }
}

const validDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && Number(m[1]) >= 1850
}

/** Stable id of an imported game: the grade and the optional game reference keep a double-header, or two grades sharing a team name, apart. */
export function importedGameId(g: { date: string; gradeName: string; teamName: string; opponent: string; gameRef: string | null }): string {
  const key = [g.date, g.gradeName, g.teamName, g.opponent, g.gameRef ?? ''].map((s) => s.trim().toLowerCase()).join('|')
  return IMPORT_GAME_PREFIX + createHash('sha1').update(key).digest('hex')
}

const COLUMN_OF = { teamRuns: 'team_runs', teamWickets: 'team_wickets', oppRuns: 'opp_runs', oppWickets: 'opp_wickets', result: 'result', format: 'format' } as const

export type MatchRowsParse = { games: ImportedGame[]; issues: RowIssue[]; ignored: number }

export function parseMatchRows(csv: Extract<ParsedCsv, { ok: true }>, today: string = new Date().toISOString().slice(0, 10)): MatchRowsParse {
  const allowed = [...MATCH_ROWS_COLUMNS, ...MATCH_ROWS_EXPORT_EXTRA] as readonly string[]
  const head = headerIndex(csv.header, allowed, REQUIRED)
  const issues = [...head.issues]
  if (head.issues.length) return { games: [], issues, ignored: 0 }
  type Flat = Omit<ImportedGame, 'players' | 'gameId' | 'firstRow'> & { player: MatchPlayerRow }
  const flat: Flat[] = []
  let ignored = 0
  for (const line of csv.rows) {
    const comment = commentRow(line)
    if (comment) { issues.push(comment); continue }
    const r = new RowReader(line, head.index)
    if (r.raw('source').trim().toLowerCase() === 'playhq') { ignored++; continue }
    const date = r.raw('date').trim()
    if (!validDate(date)) r.fail('date', date ? `"${date}" is not a date. Use the form 2013-02-10.` : 'This cell is empty. Use the form 2013-02-10.')
    else if (date > today) r.fail('date', `${date} is in the future.`)
    const grade = r.text('grade', { required: true })
    const team = r.text('team', { required: true })
    const opponent = r.text('opponent', { required: true })
    const gameRef = r.text('game_ref', { max: 40 })
    const fmtRaw = r.raw('format').trim().toLowerCase()
    const format = !fmtRaw ? null : (FORMATS as readonly string[]).includes(fmtRaw) ? (fmtRaw as (typeof FORMATS)[number]) : (r.fail('format', `"${fmtRaw}" is not a format. Use one_day, two_day or leave it blank.`), undefined)
    const resRaw = r.raw('result').trim().toLowerCase()
    const result = !resRaw ? null : (RESULTS as readonly string[]).includes(resRaw) ? (resRaw as ImportResult) : (r.fail('result', `"${resRaw}" is not a result. Use won, lost, draw, tie, no_result or leave it blank.`), undefined)
    const teamRuns = r.int('team_runs', { max: 2000 })
    const teamWickets = r.int('team_wickets', { max: 10 })
    const oppRuns = r.int('opp_runs', { max: 2000 })
    const oppWickets = r.int('opp_wickets', { max: 10 })
    const first = r.text('first_name', { required: true })
    const last = r.text('last_name')
    if (isExampleName(first, last)) r.fail('first_name', 'This is an example row from the template. Remove the example rows.')
    if (typeof grade === 'string' && JUNIOR_GRADE_RE.test(grade)) r.fail('grade', `"${grade}" is a junior grade. Junior players are not part of the history.`)
    if (typeof team === 'string' && JUNIOR_GRADE_RE.test(team)) r.fail('team', `"${team}" is a junior team. Junior players are not part of the history.`)
    const batted = r.bool('batted')
    const runs = r.int('runs', { max: 1000 })
    const balls = r.int('balls', { max: 2000 })
    const fours = r.int('fours', { max: 250 })
    const sixes = r.int('sixes', { max: 250 })
    const howRaw = r.raw('how_out').trim().toLowerCase()
    const howOut = !howRaw ? null : (HOW_OUT as readonly string[]).includes(howRaw) ? (howRaw as (typeof HOW_OUT)[number]) : (r.fail('how_out', `"${howRaw}" is not a way of getting out. Use one of: ${HOW_OUT.join(', ')}.`), undefined)
    const bowlBalls = r.overs('overs')
    const maidens = r.int('maidens', { max: 100 })
    const conceded = r.int('runs_conceded', { max: 1000 })
    const wickets = r.int('wickets', { max: 10 })

    if (batted === false && ((runs ?? 0) > 0 || howOut !== null)) r.fail('batted', 'Marked as did not bat, but runs or how out are filled in.')
    if (batted === null && (typeof runs === 'number' || typeof howOut === 'string')) r.fail('batted', 'Runs or how out are given, so say yes under batted.')
    if (typeof balls === 'number' && typeof runs === 'number' && runs > 0 && balls === 0) r.fail('balls', 'Runs were scored off 0 balls.')
    if (typeof fours === 'number' && typeof sixes === 'number' && typeof runs === 'number' && fours * 4 + sixes * 6 > runs) r.fail('fours', 'Fours and sixes add up to more runs than the batter scored.')
    if (typeof maidens === 'number' && typeof bowlBalls === 'number' && maidens * 6 > bowlBalls) r.fail('maidens', 'More maidens than overs bowled.')
    if ((bowlBalls === null || bowlBalls === 0) && ((conceded ?? 0) > 0 || (wickets ?? 0) > 0 || (maidens ?? 0) > 0)) r.fail('overs', 'Runs conceded, maidens or wickets are given with no overs bowled.')

    if (r.issues.length || !validDate(date) || typeof grade !== 'string' || typeof team !== 'string' || typeof opponent !== 'string' || typeof first !== 'string') {
      issues.push(...r.issues)
      continue
    }
    const lastName = last ?? ''
    const season = seasonOfDate(date)
    flat.push({
      date, seasonStartYear: season.startYear, seasonName: season.name, gradeName: grade, teamName: team, teamSlug: slugify(team), opponent, gameRef: gameRef ?? null,
      format: format ?? null, result: result ?? null, teamRuns: teamRuns ?? null, teamWickets: teamWickets ?? null, oppRuns: oppRuns ?? null, oppWickets: oppWickets ?? null,
      player: {
        row: line.row, firstName: first, lastName, nameKey: nameKeyOf({ firstName: first, lastName }), batted: batted ?? null, runs: runs ?? null, balls: balls ?? null,
        fours: fours ?? null, sixes: sixes ?? null, howOut: howOut ?? null, bowlBalls: bowlBalls ?? null, maidens: maidens ?? null, runsConceded: conceded ?? null, wickets: wickets ?? null,
      },
    })
  }

  // Group the rows into games, then check that the rows of one game agree.
  const groups = new Map<string, Flat[]>()
  for (const f of flat) {
    const id = importedGameId(f)
    groups.set(id, [...(groups.get(id) ?? []), f])
  }
  // A game reference given on some rows of a game and left off others is almost always a typo.
  const loose = new Map<string, { withRef: Set<string>; without: number[] }>()
  for (const [, rows] of groups) {
    for (const f of rows) {
      const k = [f.date, f.gradeName, f.teamName, f.opponent].map((s) => s.trim().toLowerCase()).join('|')
      const e = loose.get(k) ?? { withRef: new Set<string>(), without: [] }
      if (f.gameRef) e.withRef.add(f.gameRef.toLowerCase())
      else e.without.push(f.player.row)
      loose.set(k, e)
    }
  }
  for (const e of loose.values()) {
    if (e.withRef.size > 0 && e.without.length > 0) for (const row of e.without) issues.push({ row, column: 'game_ref', message: 'Other rows of this game (same date, grade, team and opponent) have a game_ref but this row has none.' })
  }
  const games: ImportedGame[] = []
  for (const [gameId, rows] of groups) {
    const head = rows[0]
    const first = rows[0].player.row
    let consistent = true
    for (const field of ['teamRuns', 'teamWickets', 'oppRuns', 'oppWickets', 'result', 'format'] as const) {
      const given = rows.filter((x) => x[field] !== null)
      const firstValue = given[0]?.[field]
      const odd = given.find((x) => x[field] !== firstValue)
      if (odd) {
        consistent = false
        issues.push({ row: odd.player.row, column: COLUMN_OF[field], message: `This game (first row ${first}) has different values for the same figure on different rows. Every row of a game must agree.` })
      }
    }
    const seenNames = new Map<string, number>()
    for (const x of rows) {
      const prev = seenNames.get(x.player.nameKey)
      if (prev !== undefined) { consistent = false; issues.push({ row: x.player.row, column: 'first_name', message: `This player is already listed for this game in row ${prev}.` }) }
      else seenNames.set(x.player.nameKey, x.player.row)
    }
    if (!consistent) continue
    const pick = <K extends 'teamRuns' | 'teamWickets' | 'oppRuns' | 'oppWickets' | 'result' | 'format'>(k: K) => rows.map((x) => x[k]).find((v) => v !== null) ?? null
    games.push({
      gameId, firstRow: first, date: head.date, seasonStartYear: head.seasonStartYear, seasonName: head.seasonName, gradeName: head.gradeName, teamName: head.teamName,
      teamSlug: head.teamSlug, opponent: head.opponent, gameRef: head.gameRef, format: pick('format'), result: pick('result'),
      teamRuns: pick('teamRuns'), teamWickets: pick('teamWickets'), oppRuns: pick('oppRuns'), oppWickets: pick('oppWickets'), players: rows.map((x) => x.player),
    })
  }
  return { games, issues, ignored }
}

export type { DismissalType }
