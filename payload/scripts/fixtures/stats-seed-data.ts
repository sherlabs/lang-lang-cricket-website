/**
 * Deterministic stats fixture data (spec section 7): about 70 players across the real PlayHQ
 * window Summer 2023/24 to Summer 2025/26, with planted leaders so tests and acceptance checks
 * know the exact answers. Pure: no Payload or database imports, so the script and the int
 * test share one generator.
 *
 * `seasonOrder` follows the real data: the upcoming Summer 2026/27 group is order 0 and holds
 * no rows, so the "newest group has no rows" case is exercised (fact 9). Nothing is invented
 * before 2023.
 */
export const SEED_MARKER = '[seed]'

export const SEED_SEASONS = [
  { seasonName: 'Summer 2025/26', seasonOrder: 1 },
  { seasonName: 'Summer 2024/25', seasonOrder: 2 },
  { seasonName: 'Summer 2023/24', seasonOrder: 3 },
] as const

export type SeedCounts = {
  games: number; batInnings: number; batNotOuts: number; batRuns: number; batHighScore: number; batHighScoreNotOut: boolean
  batBalls: number; batFours: number; batSixes: number; bowlBalls: number; bowlMaidens: number; bowlRuns: number
  bowlWickets: number; bowlBestWickets: number; bowlBestRuns: number; catches: number
}
export type SeedRow = { seasonName: string; seasonOrder: number; teamId: string; teamName: string; gradeName: string } & SeedCounts
export type SeedPlayer = {
  firstName: string
  lastName: string
  hidden: boolean
  manualYears: string
  honours: { years: string; title: string }[]
  rows: SeedRow[]
}

/** Planted facts, exported for assertions. */
export const PLANTED = {
  careerLeader: { firstName: 'Marcus', lastName: 'Careerleader', slug: 'marcus-careerleader', runs: 2017 },
  nearMilestone: { firstName: 'Neil', lastName: 'Ninetynine', slug: 'neil-ninetynine', games: 99 },
  veteran: { firstName: 'Vic', lastName: 'Veteran', slug: 'vic-veteran', manualYears: '1998–2024' },
  hidden: ['hidden-star-one', 'hidden-star-two', 'hidden-star-three'],
  wicketLeader: { firstName: 'Wally', lastName: 'Wicketking', slug: 'wally-wicketking' },
  /** A visible player whose first name starts with `=`, so CSV export tests can prove the formula guard. */
  formulaName: { firstName: '=Formula', lastName: 'Injection', slug: 'formula-injection' },
} as const

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Liam', 'Noah', 'Oliver', 'Jack', 'Lucas', 'Henry', 'Leo', 'Archie', 'Max', 'Ethan', 'Sam', 'Ben', 'Tom', 'Josh', 'Ryan', 'Dylan', 'Callum', 'Riley', 'Jordan', 'Hamish', 'Angus', 'Lachlan', 'Mitch', 'Brodie', 'Kane', 'Zac']
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Hall', 'Green', 'Wood', 'Clarke', 'Hughes', 'Edwards', 'Turner', 'Cooper', 'Murphy', 'Kelly', 'Ryan', 'Harris', 'Morgan', 'Bell', 'Fraser', 'Gibson', 'Hunt', 'Lowe', 'Nash', 'Page']

const GRADES = [
  { id: 'A', name: 'A Grade' },
  { id: 'B', name: 'B Grade' },
  { id: 'C', name: 'C Grade' },
] as const

const blank = (): SeedCounts => ({
  games: 0, batInnings: 0, batNotOuts: 0, batRuns: 0, batHighScore: 0, batHighScoreNotOut: false, batBalls: 0, batFours: 0, batSixes: 0,
  bowlBalls: 0, bowlMaidens: 0, bowlRuns: 0, bowlWickets: 0, bowlBestWickets: 0, bowlBestRuns: 0, catches: 0,
})

type Rng = () => number
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

/** A plausible batting line for a given number of runs and games. */
function batting(r: Rng, games: number, runs: number, opts: { zeroBalls?: boolean } = {}): Partial<SeedCounts> {
  const innings = Math.max(1, games - int(r, 0, 2))
  const notOuts = Math.min(innings - 1, int(r, 0, 3))
  const hs = Math.min(runs, Math.max(Math.round(runs / 3), int(r, 20, 120)))
  return {
    batInnings: innings, batNotOuts: notOuts, batRuns: runs, batHighScore: hs, batHighScoreNotOut: r() < 0.25,
    batBalls: opts.zeroBalls ? 0 : Math.round(runs * (1.1 + r() * 0.6)),
    batFours: Math.round(runs / 11), batSixes: Math.round(runs / (45 + r() * 40)),
  }
}

function bowling(r: Rng, games: number, wickets: number): Partial<SeedCounts> {
  const balls = Math.max(36, wickets * int(r, 14, 26) + int(r, 0, 60))
  const bestW = Math.min(wickets, Math.max(2, Math.min(6, Math.round(wickets / 5) + int(r, 0, 2))))
  return {
    bowlBalls: balls, bowlWickets: wickets, bowlRuns: Math.round(wickets * (18 + r() * 14) + balls / 6 * 1.5),
    bowlMaidens: Math.round(balls / 6 / 6), bowlBestWickets: bestW, bowlBestRuns: Math.max(5, bestW * int(r, 5, 9)),
  }
}

const row = (season: (typeof SEED_SEASONS)[number], grade: { id: string; name: string }, counts: Partial<SeedCounts>): SeedRow => ({
  seasonName: season.seasonName, seasonOrder: season.seasonOrder,
  teamId: `team-${grade.id}-${season.seasonOrder}`, teamName: `Lang Lang ${grade.name}`, gradeName: grade.name,
  ...blank(), ...counts,
})

const sumRows = (rows: SeedRow[], k: keyof SeedCounts) => rows.reduce((n, r) => n + (r[k] as number), 0)

export function generateStatsSeed(seed = 20261003): SeedPlayer[] {
  const r = mulberry32(seed)
  const players: SeedPlayer[] = []
  const used = new Set<string>()
  const reserved = new Set(['Marcus Careerleader', 'Neil Ninetynine', 'Vic Veteran', 'Wally Wicketking'])

  const name = () => {
    for (;;) {
      const n = `${FIRST[int(r, 0, FIRST.length - 1)]} ${LAST[int(r, 0, LAST.length - 1)]}`
      if (!used.has(n) && !reserved.has(n)) { used.add(n); return n.split(' ') as [string, string] }
    }
  }

  // ---- Planted players -----------------------------------------------------------------------
  // Exactly 2,017 career runs over 3 seasons; random batters cannot reach it (max 580 x 3).
  const leaderRuns = [800, 700, 517]
  players.push({
    firstName: 'Marcus', lastName: 'Careerleader', hidden: false, manualYears: '', honours: [{ years: '2024/25', title: 'Club Champion' }],
    rows: SEED_SEASONS.map((s, i) => row(s, GRADES[0], { games: 16, ...batting(r, 16, leaderRuns[i]), batHighScore: [141, 118, 102][i], batHighScoreNotOut: i === 0, catches: 6 })),
  })
  // 99 games exactly: one short of the 100-game milestone. Mixed teams per season.
  players.push({
    firstName: 'Neil', lastName: 'Ninetynine', hidden: false, manualYears: '', honours: [],
    rows: SEED_SEASONS.flatMap((s) => [
      row(s, GRADES[1], { games: 20, ...batting(r, 20, 260), catches: 5 }),
      row(s, GRADES[2], { games: 13, ...batting(r, 13, 130), catches: 3 }),
    ]),
  })
  players.push({
    firstName: 'Vic', lastName: 'Veteran', hidden: false, manualYears: PLANTED.veteran.manualYears,
    honours: [{ years: '1999', title: 'Life Member' }, { years: '2010–2012', title: 'Club President' }],
    rows: SEED_SEASONS.map((s) => row(s, GRADES[1], { games: 14, ...batting(r, 14, 310), ...bowling(r, 14, 12), catches: 7 })),
  })
  players.push({
    firstName: 'Wally', lastName: 'Wicketking', hidden: false, manualYears: '', honours: [{ years: '2025/26', title: 'Best and Fairest' }],
    rows: SEED_SEASONS.map((s, i) => row(s, GRADES[0], { games: 17, ...batting(r, 17, 90), ...bowling(r, 17, [38, 34, 31][i]), bowlBestWickets: 7, bowlBestRuns: 21 })),
  })
  // Hidden stars: the top figures in every table, who must never appear anywhere public.
  for (const [i, n] of ['One', 'Two', 'Three'].entries()) {
    players.push({
      firstName: 'Hidden', lastName: `Star ${n}`, hidden: true, manualYears: '', honours: [{ years: '2025', title: 'Hidden Honour' }],
      rows: SEED_SEASONS.map((s) => row(s, GRADES[0], { games: 18, ...batting(r, 18, 900 + i * 50), ...bowling(r, 18, 45 + i), catches: 20 })),
    })
  }
  // Women's, masters and junior rows to exercise classification and the junior toggle.
  const special = [
    { id: 'WT20', name: "Women's T20" }, { id: 'O40', name: 'Over 40s' }, { id: 'U16', name: 'Under 16' },
  ]
  for (const sp of special) {
    for (let i = 0; i < 4; i++) {
      const [f, l] = name()
      players.push({
        firstName: f, lastName: l, hidden: false, manualYears: '', honours: [],
        rows: SEED_SEASONS.slice(0, 2).map((s) => row(s, sp, { games: int(r, 8, 12), ...batting(r, 10, int(r, 120, 380)), ...(i % 2 ? bowling(r, 10, int(r, 6, 20)) : {}), catches: int(r, 0, 6) })),
      })
    }
  }

  // ---- Random squad ---------------------------------------------------------------------------
  const HONOUR_POOL = [
    'Best and Fairest', 'Club Champion', 'Premiership Player', 'Captain', 'Vice Captain', 'Life Member', 'Most Improved', 'CCCA Representative',
    'Leading Run Scorer', 'Leading Wicket Taker', 'Hall of Fame',
  ]
  const YEARS = ['2024', '2024/25', '2023-24', '2025/26', '2023/24 - 2024/25', '2025', 'unknown']
  let honourCount = 0
  while (players.length < 70) {
    const [f, l] = name()
    const kind = r()
    const grade = GRADES[int(r, 0, 2)]
    const seasons = SEED_SEASONS.slice(0, int(r, 1, 3))
    const rows: SeedRow[] = []
    for (const s of seasons) {
      const games = int(r, 8, 18)
      const teams = r() < 0.2 ? [grade, GRADES[(GRADES.indexOf(grade) + 1) % 3]] : [grade]
      for (const t of teams) {
        const g = Math.max(2, Math.round(games / teams.length))
        const bat = kind < 0.7 ? batting(r, g, int(r, 150, 580) / teams.length | 0, { zeroBalls: r() < 0.06 }) : batting(r, g, int(r, 20, 120))
        const bowl = kind > 0.35 ? bowling(r, g, int(r, 8, 35) / teams.length | 0 || 1) : {}
        rows.push(row(s, t, { games: g, ...bat, ...bowl, catches: int(r, 0, 12) }))
      }
    }
    const honours: SeedPlayer['honours'] = []
    if (honourCount < 20 && r() < 0.4) {
      honourCount++
      honours.push({ years: YEARS[int(r, 0, YEARS.length - 1)], title: ` ${HONOUR_POOL[int(r, 0, HONOUR_POOL.length - 1)]} ` })
    }
    players.push({ firstName: f, lastName: l, hidden: false, manualYears: '', honours, rows })
  }
  // Modest, visible player with a spreadsheet-formula name (CSV injection guard).
  players.push({
    firstName: PLANTED.formulaName.firstName, lastName: PLANTED.formulaName.lastName, hidden: false, manualYears: '', honours: [],
    rows: SEED_SEASONS.slice(0, 2).map((s) => row(s, GRADES[2], { games: 12, ...batting(r, 12, 180), catches: 2 })),
  })
  // Sanity: the planted leader's career total is exact.
  const lead = players[0].rows
  if (sumRows(lead, 'batRuns') !== PLANTED.careerLeader.runs) throw new Error('stats seed: planted career leader total drifted')
  if (sumRows(players[1].rows, 'games') !== PLANTED.nearMilestone.games) throw new Error('stats seed: planted near-milestone total drifted')
  return players
}
