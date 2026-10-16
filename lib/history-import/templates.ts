import { toCsv, type CsvCell } from '@/lib/stats/csv'
import { MATCH_ROWS_COLUMNS } from './match-rows'
import { SEASON_TOTALS_COLUMNS } from './season-totals'

/** Downloadable templates: the header plus two clearly fake example rows the importer refuses ("remove the example rows"). */
export type ImportKind = 'season-totals' | 'match-rows'
export const IMPORT_KINDS: readonly ImportKind[] = ['season-totals', 'match-rows']
export const isImportKind = (v: unknown): v is ImportKind => v === 'season-totals' || v === 'match-rows'

const row = (cols: readonly string[], values: Record<string, CsvCell>): CsvCell[] => cols.map((c) => values[c] ?? '')

export function templateCsv(kind: ImportKind): string {
  if (kind === 'season-totals') {
    const c = SEASON_TOTALS_COLUMNS
    return toCsv(c, [
      row(c, { season: '2012/13', team: 'A Grade', grade: 'A Grade', first_name: 'Example', last_name: 'Player', games: 14, bat_innings: 13, bat_not_outs: 2, bat_runs: 412, bat_high_score: 88, bat_high_score_not_out: 'no', bat_balls: 530, bat_fours: 40, bat_sixes: 6, bowl_overs: '61.3', bowl_maidens: 9, bowl_runs: 240, bowl_wickets: 11, best_wickets: 3, best_runs: 18, catches: 5 }),
      // Balls, fours and sixes left blank mean "not recorded": strike rate shows n/a for that season.
      row(c, { season: '2011/12', team: 'B Grade', grade: 'B Grade', first_name: 'Example', last_name: 'Player', games: 10, bat_innings: 9, bat_not_outs: 1, bat_runs: 205, bat_high_score: 51, bat_high_score_not_out: 'yes', catches: 2 }),
    ])
  }
  const c = MATCH_ROWS_COLUMNS
  return toCsv(c, [
    row(c, { date: '2013-02-09', grade: 'A Grade', team: 'A Grade', opponent: 'Example Opposition', format: 'one_day', result: 'won', team_runs: 201, team_wickets: 7, opp_runs: 188, opp_wickets: 10, first_name: 'Example', last_name: 'Player', batted: 'yes', runs: 54, balls: 61, fours: 6, sixes: 1, how_out: 'caught', overs: '8.2', maidens: 1, runs_conceded: 33, wickets: 2 }),
    row(c, { date: '2013-02-09', grade: 'A Grade', team: 'A Grade', opponent: 'Example Opposition', format: 'one_day', result: 'won', team_runs: 201, team_wickets: 7, opp_runs: 188, opp_wickets: 10, first_name: 'Example', last_name: 'Player', batted: 'no' }),
  ])
}
