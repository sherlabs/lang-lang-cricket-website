import type { EventPromoData } from '@/lib/social/specs/event-promo'
import type { FixturesData } from '@/lib/social/specs/fixtures'
import type { LineupData } from '@/lib/social/specs/lineup'
import type { MilestoneData } from '@/lib/social/specs/milestone'
import type { PotmData } from '@/lib/social/specs/potm'
import type { ResultData, ResultGame } from '@/lib/social/specs/result'
import type { SeasonWrapData } from '@/lib/social/specs/season-wrap'
import type { SponsorThanksData } from '@/lib/social/specs/sponsor-thanks'
import type { TossData } from '@/lib/social/specs/toss'
import type { LeadersData } from '@/lib/social/specs/stats-leaders'
import type { GraphicType } from '@/lib/social/types'

/** A 2x2 PNG, drawn as a stand-in for a cover or a logo (no network). */
export const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8Dwn4EBDMAMAB0IA/8dwhKcAAAAAElFTkSuQmCC'

const game = (over: Partial<ResultGame> = {}): ResultGame => ({
  gameId: 'g1', grade: 'B Grade', team: 'Club B Grade', round: 'Round 4', date: '2025-10-11', dateLabel: 'Sat 11 Oct', venue: 'Home Oval', opponent: 'Rivals United',
  letter: 'W', word: 'Won', clubScore: '182/6 (40.0 ov)', oppScore: '158 (38.2 ov)', clubShort: '182/6', oppShort: '158', margin: 'by 24 runs', ...over,
})

const names = ['Alex Brown', 'Sam Carter', 'Jordan Lee', 'Taylor Nguyen', 'Chris Patel', 'Morgan Smith', 'Riley Jones', 'Casey Wilson', 'Drew Taylor', 'Jamie Clark', 'Pat Murphy', 'Robin Walker', 'Kim Hall', 'Lee Young']

export const FIXTURE_DATA: Record<GraphicType, unknown> = {
  result: { mode: 'scorecard', game: game(), batters: names.slice(0, 5).map((n, i) => ({ name: n, figures: `${60 - i * 9} (${50 - i * 5})` })), bowlers: names.slice(5, 10).map((n, i) => ({ name: n, figures: `${4 - (i % 3)}/${12 + i * 4}` })) } satisfies ResultData,
  fixtures: { weekLabel: 'Sat 18 Oct', games: Array.from({ length: 9 }, (_, i) => ({ grade: `${'ABCDEFGHI'[i]} Grade`, round: 'Round 5', dayLabel: i % 2 ? 'Sunday' : 'Saturday', time: '1:00pm', opponent: `Opponent number ${i + 1}`, venue: 'Home Oval', home: i % 2 === 0 })) } satisfies FixturesData,
  lineup: { grade: 'B Grade', round: 'Round 5', opponent: 'Rivals United', whenLabel: 'Sat 18 Oct, 1:00pm', venue: 'Home Oval', showOrder: true, updated: false, players: names.slice(0, 13).map((n, i) => ({ order: i + 1, name: n, captain: i === 0, keeper: i === 5 })) } satisfies LineupData,
  potm: { player: 'Alexander Montgomery-Featherstonehaugh', opponent: 'Rivals United', grade: 'B Grade', round: 'Round 4', dateLabel: 'Sat 11 Oct', statLine: '54 off 41 balls  |  2/18 from 6 overs', big: { value: '54', label: 'runs' } } satisfies PotmData,
  milestone: { player: 'Alex Brown', figure: '1,000', unit: 'runs', kind: 'achieved', detail: '1,000 runs, reached in 2025/26' } satisfies MilestoneData,
  'stats-leaders': { metric: 'Most runs', seasonLabel: '2025/26', scopeLabel: 'Senior', rows: names.slice(0, 6).map((n, i) => ({ rank: i + 1, name: n, value: String(412 - i * 37), context: `${12 - i} inns` })) } satisfies LeadersData,
  'event-promo': { title: 'Season presentation night with a very long title that wraps', dateLabel: 'Sat 22 Nov', timeLabel: '6:30pm', place: 'The clubrooms', cover: TINY_PNG } satisfies EventPromoData,
  'sponsor-thanks': { sponsors: [{ name: 'Smith Hardware', tier: 'Platinum', logo: TINY_PNG }, { name: 'No Logo Plumbing', tier: 'Gold', logo: null }], line: 'Thank you for backing the club this season.' } satisfies SponsorThanksData,
  'season-wrap': { title: '2025/26 yearbook', seasonLabel: '2025/26', premiership: 'B Grade premiers', cover: TINY_PNG, record: '12 wins, 3 losses', topRuns: { name: 'Alex Brown', value: '612' }, topWickets: { name: 'Sam Carter', value: '31' } } satisfies SeasonWrapData,
  toss: { winner: 'Club', clubWon: true, choice: 'bat', opponent: 'Rivals United', grade: 'B Grade', round: 'Round 4', dateLabel: 'Sat 11 Oct', venue: 'Home Oval, Lang Lang' } satisfies TossData,
}

export const EMPTY_DATA: Partial<Record<GraphicType, unknown>> = {
  result: { mode: 'round', dateLabel: 'Sat 11 Oct', round: null, games: [] },
  fixtures: { weekLabel: 'Sat 18 Oct', games: [] },
  lineup: { ...(FIXTURE_DATA.lineup as LineupData), players: [] },
  'stats-leaders': { ...(FIXTURE_DATA['stats-leaders'] as LeadersData), rows: [] },
  'sponsor-thanks': { sponsors: [], line: '' },
  toss: { ...(FIXTURE_DATA.toss as TossData), winner: '' },
}
