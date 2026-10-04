import { JUNIOR_GRADE_RE } from '@/lib/playhq/junior-rules'
import { nameKeyOf } from '@/lib/playhq/match-rows'
import { slugify } from '@/lib/slugify'
import { commentRow, headerIndex, isExampleName, RowReader } from './cells'
import type { ParsedCsv, RowIssue } from './csv-parse'

/** Season totals: one row per player per team per season (W2 spec 6.1). */
export const SEASON_TOTALS_COLUMNS = [
  'season', 'team', 'grade', 'first_name', 'last_name', 'games', 'bat_innings', 'bat_not_outs', 'bat_runs', 'bat_high_score', 'bat_high_score_not_out',
  'bat_balls', 'bat_fours', 'bat_sixes', 'bowl_overs', 'bowl_maidens', 'bowl_runs', 'bowl_wickets', 'best_wickets', 'best_runs', 'catches',
] as const
/** Columns an export adds. The importer accepts them so an export re-imports: PlayHQ rows are skipped, `hidden` is informational. */
export const SEASON_TOTALS_EXPORT_EXTRA = ['source', 'hidden'] as const
const REQUIRED = ['season', 'team', 'first_name', 'games'] as const

export type SeasonTotalsRow = {
  row: number
  season: string
  seasonStartYear: number
  teamName: string
  teamSlug: string
  gradeName: string | null
  firstName: string
  lastName: string
  nameKey: string
  /** Counts as stored in `player_seasons`. */
  counts: {
    games: number; batInnings: number; batNotOuts: number; batRuns: number; batHighScore: number; batHighScoreNotOut: boolean
    batBalls: number; batFours: number; batSixes: number; batRunsUnballed: number
    bowlBalls: number; bowlMaidens: number; bowlRuns: number; bowlWickets: number; bowlBestWickets: number; bowlBestRuns: number; catches: number
  }
  /** Balls, fours and sixes were left blank: strike rate shows n/a for this season. */
  unballed: boolean
}

const SEASON_RE = /^(\d{4})\/(\d{2})$/

/** `2012/13` to its start year, or null when the shape (or the second year) is wrong. */
export function parseSeason(s: string): number | null {
  const m = SEASON_RE.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  return Number(m[2]) === (y + 1) % 100 ? y : null
}

export type SeasonTotalsParse = { rows: SeasonTotalsRow[]; issues: RowIssue[]; ignored: number }

export function parseSeasonTotals(csv: Extract<ParsedCsv, { ok: true }>): SeasonTotalsParse {
  const allowed = [...SEASON_TOTALS_COLUMNS, ...SEASON_TOTALS_EXPORT_EXTRA] as readonly string[]
  const head = headerIndex(csv.header, allowed, REQUIRED)
  const issues = [...head.issues]
  if (head.issues.length) return { rows: [], issues, ignored: 0 }
  const rows: SeasonTotalsRow[] = []
  const seen = new Map<string, number>()
  let ignored = 0
  for (const line of csv.rows) {
    const comment = commentRow(line)
    if (comment) { issues.push(comment); continue }
    const r = new RowReader(line, head.index)
    // An exported PlayHQ row is not importable (the sync owns it); skip it so an export re-imports as a no-op.
    if (r.raw('source').trim().toLowerCase() === 'playhq') { ignored++; continue }
    const seasonRaw = r.raw('season').trim()
    const year = parseSeason(seasonRaw)
    if (year === null) r.fail('season', seasonRaw ? `"${seasonRaw}" is not a season. Use the form 2012/13.` : 'This cell is empty. Use the form 2012/13.')
    const team = r.text('team', { required: true })
    const grade = r.text('grade')
    const first = r.text('first_name', { required: true })
    const last = r.text('last_name')
    if (isExampleName(first, last)) r.fail('first_name', 'This is an example row from the template. Remove the example rows.')
    if (typeof grade === 'string' && JUNIOR_GRADE_RE.test(grade)) r.fail('grade', `"${grade}" is a junior grade. Junior players are not part of the history.`)
    if (typeof team === 'string' && JUNIOR_GRADE_RE.test(team)) r.fail('team', `"${team}" is a junior team. Junior players are not part of the history.`)

    const games = r.int('games', { required: true, max: 1000 })
    const innings = r.int('bat_innings', { max: 2000 })
    const notOuts = r.int('bat_not_outs', { max: 2000 })
    const runs = r.int('bat_runs', { max: 50_000 })
    const high = r.int('bat_high_score', { max: 1000 })
    const highNo = r.bool('bat_high_score_not_out')
    const balls = r.int('bat_balls', { max: 100_000 })
    const fours = r.int('bat_fours', { max: 10_000 })
    const sixes = r.int('bat_sixes', { max: 10_000 })
    const bowlBalls = r.overs('bowl_overs')
    const maidens = r.int('bowl_maidens', { max: 5000 })
    const conceded = r.int('bowl_runs', { max: 50_000 })
    const wickets = r.int('bowl_wickets', { max: 2000 })
    const bestW = r.int('best_wickets', { max: 10 })
    const bestR = r.int('best_runs', { max: 1000 })
    const catches = r.int('catches', { max: 2000 })

    if (typeof high === 'number' && typeof runs === 'number' && high > runs) r.fail('bat_high_score', `The high score (${high}) is more than the total runs (${runs}).`)
    if (typeof notOuts === 'number' && typeof innings === 'number' && notOuts > innings) r.fail('bat_not_outs', `Not-outs (${notOuts}) are more than innings (${innings}).`)
    if ((wickets ?? 0) === 0 && ((bestW ?? 0) > 0 || (bestR ?? 0) > 0)) r.fail('best_wickets', 'There are 0 wickets but a best bowling figure. Clear the best figure or fix the wickets.')
    if (typeof bestW === 'number' && typeof wickets === 'number' && bestW > wickets) r.fail('best_wickets', `Best wickets (${bestW}) is more than total wickets (${wickets}).`)
    if (typeof bestR === 'number' && typeof conceded === 'number' && bestR > conceded) r.fail('best_runs', `Best-figure runs (${bestR}) is more than runs conceded (${conceded}).`)
    if ((fours ?? 0) * 4 + (sixes ?? 0) * 6 > (runs ?? 0) && fours != null && sixes != null && typeof runs === 'number') r.fail('bat_fours', 'Fours and sixes add up to more runs than the batter scored.')

    if (r.issues.length || year === null || typeof team !== 'string' || typeof first !== 'string' || last === undefined || games == null) {
      issues.push(...r.issues)
      continue
    }
    const lastName = last ?? ''
    const nameKey = nameKeyOf({ firstName: first, lastName })
    const teamSlug = slugify(team)
    const dupKey = `${year}|${teamSlug}|${nameKey}`
    if (seen.has(dupKey)) { issues.push({ row: line.row, column: null, message: `The same player, team and season already appear in row ${seen.get(dupKey)}.` }); continue }
    seen.set(dupKey, line.row)

    const runsN = runs ?? 0
    const unballed = balls === null
    rows.push({
      row: line.row, season: seasonRaw, seasonStartYear: year, teamName: team, teamSlug, gradeName: grade ?? null, firstName: first, lastName, nameKey,
      unballed,
      counts: {
        games, batInnings: innings ?? 0, batNotOuts: notOuts ?? 0, batRuns: runsN, batHighScore: high ?? 0, batHighScoreNotOut: highNo === true,
        // Blank balls mean "not recorded": zero balls and every run unballed, so strike rate is n/a rather than wrong.
        batBalls: balls ?? 0, batFours: fours ?? 0, batSixes: sixes ?? 0, batRunsUnballed: unballed ? runsN : 0,
        bowlBalls: bowlBalls ?? 0, bowlMaidens: maidens ?? 0, bowlRuns: conceded ?? 0, bowlWickets: wickets ?? 0, bowlBestWickets: bestW ?? 0, bowlBestRuns: bestR ?? 0, catches: catches ?? 0,
      },
    })
  }
  return { rows, issues, ignored }
}
