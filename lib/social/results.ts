import type { MatchSquad, StoredMatch } from '@/lib/match-store/queries'
import type { ResultLine } from '@/lib/stats/match/yearbook'
import { oversText } from '@/lib/stats/match/yearbook'

/**
 * Pure result and player-of-the-match wording from stored match data (wave C spec Appendix B item 1). The store has scores and an
 * outcome word but no ready-made "won by 24 runs", so the margin is worked out here, and only when it is certain.
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `by 24 runs` or `by 3 wickets`; empty for a draw, tie, forfeit, first-innings result, two-innings game or missing totals. */
export function deriveMargin(l: Pick<ResultLine, 'result' | 'forfeit' | 'onFirstInnings' | 'club' | 'opp'>): string {
  if ((l.result !== 'won' && l.result !== 'lost') || l.forfeit || l.onFirstInnings) return ''
  if (l.club.length !== 1 || l.opp.length !== 1) return ''
  const [club, opp] = [l.club[0], l.opp[0]]
  if (club.runs === null || opp.runs === null) return ''
  const winner = l.result === 'won' ? club : opp
  const loser = l.result === 'won' ? opp : club
  if (winner.seq < loser.seq) {
    const diff = (winner.runs as number) - (loser.runs as number)
    return diff > 0 ? `by ${plural(diff, 'run', 'runs')}` : ''
  }
  if (winner.wickets === null) return ''
  const left = 10 - winner.wickets
  return left > 0 ? `by ${plural(left, 'wicket', 'wickets')}` : ''
}

export type PotmFigures = { statLine: string; big: { value: string; label: string } | null }

/** What one club player did in one stored game, as a short line and (if worth it) one big figure. Empty when they did neither. */
export function potmFigures(match: Pick<StoredMatch, 'innings'>, playerId: number): PotmFigures {
  let runs = 0, balls = 0, batted = false, notOut = false
  let bowlBalls = 0, bowlRuns = 0, wickets = 0
  for (const inn of match.innings) {
    for (const b of inn.batting) {
      if (b.playerId !== playerId) continue
      batted = true
      runs += b.runs
      balls += b.balls ?? 0
      if (b.status === 'not_out') notOut = true
    }
    for (const b of inn.bowling) {
      if (b.playerId !== playerId) continue
      bowlBalls += b.balls
      bowlRuns += b.runs
      wickets += b.wickets
    }
  }
  const parts: string[] = []
  if (batted) parts.push(`${runs}${notOut ? '*' : ''}${balls > 0 ? ` off ${balls} ${balls === 1 ? 'ball' : 'balls'}` : ''}`)
  if (bowlBalls > 0) parts.push(`${wickets}/${bowlRuns} from ${oversText(bowlBalls)} overs`)
  let big: PotmFigures['big'] = null
  if (bowlBalls > 0 && wickets * 20 > (batted ? runs : 0) && wickets > 0) big = { value: `${wickets}/${bowlRuns}`, label: wickets === 1 ? 'wicket' : 'wickets' }
  else if (batted && runs > 0) big = { value: `${runs}${notOut ? '*' : ''}`, label: runs === 1 ? 'run' : 'runs' }
  return { statLine: parts.join('  |  '), big }
}

/** Did this club player appear in the stored game (squad, batting, bowling or fielding)? */
export function playedInMatch(match: Pick<StoredMatch, 'innings'> & { squad: MatchSquad }, playerId: number): boolean {
  if (match.squad.some((s) => s.playerId === playerId)) return true
  return match.innings.some((i) => [...i.batting, ...i.bowling, ...i.fielding].some((r) => r.playerId === playerId))
}
