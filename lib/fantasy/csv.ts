import { toCsv } from '../stats/csv'

/** The leaderboard export (admin only). Team names are typed by the public, so every cell goes through the formula-injection guard. */
export type LeaderboardCsvRow = { rank: number; teamName: string; total: number; best: number; rounds: number; joined: string }

export const leaderboardCsv = (rows: readonly LeaderboardCsvRow[]): string =>
  toCsv(['Rank', 'Team', 'Total points', 'Best round', 'Rounds scored', 'Joined'], rows.map((r) => [r.rank, r.teamName, r.total, r.best, r.rounds, r.joined]))
