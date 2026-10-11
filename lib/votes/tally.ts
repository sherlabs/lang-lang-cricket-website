import { VOTES } from '@/config/site'

/**
 * The leaderboard (wave B spec 3.8). Pure and deliberately blind to voters: it receives ballots as places only, never who cast
 * them. Points are computed from the STORED PLACES with the CURRENT ballot values, so a settings change re-tallies consistently.
 *
 * Privacy rules enforced here (spec 0.6): a game counts only with at least `minBallots` ballots; for a public audience a round
 * counts only when EVERY game in it that could count has a closed window (whatever its ballot count, so a ballot cast in an open
 * game can never change public output); output is cumulative by round, never per game.
 */
export type TallyFixture = {
  id: number
  /** The club weekend (`weekendKey`) so the club and each grade share one axis. */
  round: string
  gradeId: string
  /** Final and `countsForAwards`. */
  counting: boolean
  /** The voting window has closed. */
  closed: boolean
  /** Players who could be voted for (for the "games" column). */
  nominees: readonly number[]
}
export type TallyBallot = { fixtureId: number; picks: readonly { place: number; playerId: number }[] }
export type PlayerInfo = { name: string; sortName: string }
export type TallyInput = {
  fixtures: readonly TallyFixture[]
  ballots: readonly TallyBallot[]
  values: readonly number[]
  minBallots: number
  tieBreakFewestGames: boolean
  audience: 'public' | 'private'
  players: ReadonlyMap<number, PlayerInfo>
}
export type Movement = { kind: 'up' | 'down' | 'same' | 'new'; by: number }
export type BoardRow = {
  playerId: number
  name: string
  points: number
  /** Votes received per place: index 0 is the top place. */
  counts: number[]
  /** Ballots that named the player. */
  ballots: number
  /** Counted games the player was in. */
  games: number
  rank: number
  shared: boolean
  movement: Movement | null
}
export type RoundBoard = { round: string; rows: BoardRow[] }
export type TallyResult = {
  /** Cumulative board after each contributing round, oldest first. */
  boards: RoundBoard[]
  /** The latest board (empty when nothing counts yet). */
  rows: BoardRow[]
  rounds: string[]
  /** Games that are final and could count but are not in the totals (too few ballots, an open window or an open round). */
  uncountedGames: number
  countedGames: number
}

type Acc = { counts: number[]; ballots: number; games: number; points: number }

/** Which fixtures contribute, and how many are held back. */
export function contributing(i: Pick<TallyInput, 'fixtures' | 'ballots' | 'minBallots' | 'audience'>): { included: TallyFixture[]; held: number } {
  const perFixture = new Map<number, number>()
  for (const b of i.ballots) perFixture.set(b.fixtureId, (perFixture.get(b.fixtureId) ?? 0) + 1)
  const candidates = i.fixtures.filter((f) => f.counting)
  let eligible = candidates
  if (i.audience === 'public') {
    const open = new Set(candidates.filter((f) => !f.closed).map((f) => f.round))
    eligible = candidates.filter((f) => !open.has(f.round))
  }
  const included = eligible.filter((f) => (perFixture.get(f.id) ?? 0) >= i.minBallots)
  return { included, held: candidates.length - included.length }
}

function accumulate(fixtures: readonly TallyFixture[], ballots: readonly TallyBallot[], values: readonly number[]): Map<number, Acc> {
  const ids = new Set(fixtures.map((f) => f.id))
  const acc = new Map<number, Acc>()
  const get = (id: number): Acc => {
    let a = acc.get(id)
    if (!a) acc.set(id, (a = { counts: values.map(() => 0), ballots: 0, games: 0, points: 0 }))
    return a
  }
  for (const f of fixtures) for (const p of f.nominees) get(p).games += 1
  for (const b of ballots) {
    if (!ids.has(b.fixtureId)) continue
    for (const p of b.picks) {
      const idx = p.place - 1
      if (idx < 0 || idx >= values.length) continue
      const a = get(p.playerId)
      a.counts[idx] += 1
      a.ballots += 1
      a.points += values[idx]
    }
  }
  // A player with no vote at all is not on the board.
  for (const [id, a] of acc) if (a.ballots === 0) acc.delete(id)
  return acc
}

const fallbackInfo = (id: number): PlayerInfo => ({ name: `Player ${id}`, sortName: `~${String(id).padStart(9, '0')}` })

function rank(acc: Map<number, Acc>, players: ReadonlyMap<number, PlayerInfo>, fewest: boolean): BoardRow[] {
  const list = [...acc].map(([playerId, a]) => ({ playerId, a, info: players.get(playerId) ?? fallbackInfo(playerId) }))
  const compare = (x: (typeof list)[number], y: (typeof list)[number]): number => {
    if (y.a.points !== x.a.points) return y.a.points - x.a.points
    // Countback: most top-place votes, then the next, and so on.
    for (let i = 0; i < x.a.counts.length; i++) if (y.a.counts[i] !== x.a.counts[i]) return y.a.counts[i] - x.a.counts[i]
    if (fewest && x.a.games !== y.a.games) return x.a.games - y.a.games
    return 0
  }
  list.sort((x, y) => compare(x, y) || x.info.sortName.localeCompare(y.info.sortName) || x.playerId - y.playerId)
  const rows: BoardRow[] = []
  list.forEach((e, i) => {
    const tiedWithPrev = i > 0 && compare(list[i - 1], e) === 0
    rows.push({ playerId: e.playerId, name: e.info.name, points: e.a.points, counts: e.a.counts, ballots: e.a.ballots, games: e.a.games, rank: tiedWithPrev ? rows[i - 1].rank : i + 1, shared: false, movement: null })
  })
  for (const r of rows) r.shared = rows.filter((o) => o.rank === r.rank).length > 1
  return rows
}

function withMovement(rows: BoardRow[], previous: BoardRow[] | null): BoardRow[] {
  if (!previous) return rows
  const prev = new Map(previous.map((r) => [r.playerId, r.rank]))
  return rows.map((r) => {
    const before = prev.get(r.playerId)
    const movement: Movement = before == null ? { kind: 'new', by: 0 } : before === r.rank ? { kind: 'same', by: 0 } : before > r.rank ? { kind: 'up', by: before - r.rank } : { kind: 'down', by: r.rank - before }
    return { ...r, movement }
  })
}

export function tally(i: TallyInput): TallyResult {
  const { included, held } = contributing(i)
  const rounds = [...new Set(included.map((f) => f.round))].sort()
  const boards: RoundBoard[] = []
  let previous: BoardRow[] | null = null
  for (const round of rounds) {
    const upTo = included.filter((f) => f.round <= round)
    const rows = withMovement(rank(accumulate(upTo, i.ballots, i.values), i.players, i.tieBreakFewestGames), previous)
    boards.push({ round, rows })
    previous = rows
  }
  return { boards, rows: boards.length ? boards[boards.length - 1].rows : [], rounds, uncountedGames: held, countedGames: included.length }
}

/** The top rows of a board for charts and the presenter: the top `n`, plus anyone tied with the last place up to one extra. */
export function topRows(rows: readonly BoardRow[], n: number = VOTES.chartTop): BoardRow[] {
  const top = rows.slice(0, n)
  if (rows.length > n && rows[n].rank === rows[n - 1]?.rank) top.push(rows[n])
  return top
}

/** A movement as words (never colour alone). */
export function movementText(m: Movement | null): string {
  if (!m) return ''
  if (m.kind === 'new') return 'New'
  if (m.kind === 'same') return 'No change'
  return `${m.kind === 'up' ? 'Up' : 'Down'} ${m.by}`
}
