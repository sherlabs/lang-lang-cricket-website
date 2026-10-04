import type { Player, PlayerSeason } from '@/lib/domain'
import { battingAverages, bowlingAverages } from '@/lib/playhq/players'
import { EMPTY_COUNTS, combineCounts, pickCounts, type SeasonCounts } from './season-math'
import { PLAYHQ_DEFAULTS } from '@/config/site'

export function isActive(p: Pick<Player, 'activeOverride' | 'isActiveDerived'>) {
  return p.activeOverride ? p.activeOverride === 'active' : p.isActiveDerived
}
export const playerName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`.trim()
export const seasonYears = (name: string) => /\d{4}(\/\d{2})?/.exec(name)?.[0] ?? name
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * "<Club> B Grade" → "B Grade": strips the club's PlayHQ team-name prefix. Callers pass
 * `club.teamNamePrefix`; omitted, it falls back to the config default.
 */
export const teamLabel = (teamName: string, prefix: string = PLAYHQ_DEFAULTS.teamNamePrefix) =>
  prefix ? teamName.replace(new RegExp(`^${escapeRegExp(prefix)}\\s+`, 'i'), '') : teamName
export { initials } from '../identity'

export type SeasonLite = Pick<PlayerSeason, 'seasonName' | 'seasonOrder' | 'teamName'>

export function yearsLabel(p: Pick<Player, 'source' | 'manualYears'>, seasons: SeasonLite[]) {
  if (seasons.length === 0) return p.manualYears
  const sorted = [...seasons].sort((a, b) => b.seasonOrder - a.seasonOrder) // oldest first
  const first = seasonYears(sorted[0].seasonName), last = seasonYears(sorted[sorted.length - 1].seasonName)
  return first === last ? first : `${first} – ${last}`
}

export type PlayerCard = { id: number; slug: string; name: string; photoUrl: string; yearsLabel: string; grades: string[]; latestOrder: number | null; active: boolean }

export function toCard(p: Player, seasons: SeasonLite[], teamNamePrefix?: string): PlayerCard {
  const newestFirst = [...seasons].sort((a, b) => a.seasonOrder - b.seasonOrder)
  return {
    id: p.id, slug: p.slug, name: playerName(p), photoUrl: p.photoUrl, yearsLabel: yearsLabel(p, seasons),
    grades: [...new Set(newestFirst.map((s) => teamLabel(s.teamName, teamNamePrefix)))],
    latestOrder: newestFirst[0]?.seasonOrder ?? null, active: isActive(p),
  }
}

export function splitPlayers(list: { player: Player; seasons: SeasonLite[] }[], teamNamePrefix?: string) {
  const cards = list.filter((x) => !x.player.hidden).map((x) => toCard(x.player, x.seasons, teamNamePrefix))
  const byName = (a: PlayerCard, b: PlayerCard) => a.name.localeCompare(b.name)
  const active = cards.filter((c) => c.active).sort(byName)
  const past = cards.filter((c) => !c.active).sort((a, b) =>
    (a.latestOrder ?? Infinity) - (b.latestOrder ?? Infinity) || byName(a, b))
  return { active, past }
}

export const careerTotals = (rows: SeasonCounts[]) => rows.map(pickCounts).reduce(combineCounts, EMPTY_COUNTS)

const f = (v: number | null, dp: number) => (v == null ? '–' : v.toFixed(dp))

export function battingView(c: SeasonCounts) {
  const a = battingAverages({ runs: c.batRuns, innings: c.batInnings, notOuts: c.batNotOuts, balls: c.batBalls, runsUnballed: c.batRunsUnballed })
  return {
    runs: c.batRuns, innings: c.batInnings, notOuts: c.batNotOuts, fours: c.batFours, sixes: c.batSixes,
    highScore: c.batInnings ? `${c.batHighScore}${c.batHighScoreNotOut ? '*' : ''}` : '–',
    average: f(a.average, 2), strikeRate: f(a.strikeRate, 1),
  }
}
export type BattingView = ReturnType<typeof battingView>

export function bowlingView(c: SeasonCounts) {
  const a = bowlingAverages({ balls: c.bowlBalls, runs: c.bowlRuns, wickets: c.bowlWickets })
  return {
    overs: a.overs, maidens: c.bowlMaidens, runs: c.bowlRuns, wickets: c.bowlWickets,
    best: c.bowlBalls ? `${c.bowlBestWickets}/${c.bowlBestRuns}` : '–',
    average: f(a.average, 2), economy: f(a.economy, 2),
  }
}
export type BowlingView = ReturnType<typeof bowlingView>
