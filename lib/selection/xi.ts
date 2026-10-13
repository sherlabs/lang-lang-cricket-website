import type { Answer } from '../availability'
import { SELECTION } from '../../config/site'
import type { BatEntry, BowlEntry } from './form'
import { balanceCounts, ROLE_LABEL, type RoleOrUnknown } from './roles'

/**
 * The best XI suggester (wave E, WP-2): ordered rules, never a score. Pure and deterministic: the same players, rules, size, pins
 * and leave-outs always give the same proposal, in the same order, with a sentence for every pick, reserve and exclusion. Every
 * number in a sentence is a recorded one (last-five lines from stored games); a player with no stored games reads "No data", never
 * zero. No database, Next or React imports: the selector query module loads the rows and this decides.
 *
 * Fill order: keeper (when the rules ask for one), then bowling options up to `minBowlers`, then batters up to `minBatters`, then the
 * best of what is left until the team is full. A pick can satisfy several needs (an all-rounder is a batter and a bowler, exactly as
 * `balanceCounts` counts them). Inside a need, players are compared by this ordered tuple and nothing else:
 *   1. availability: in, then maybe, then no answer yet;
 *   2. has enough recent data (at least `minFormEntries` innings or spells in the last five);
 *   3. the role-relevant last-five line (batting: runs; bowling: wickets, then fewer runs conceded);
 *   4. games played this season;
 *   5. name.
 * The last "best of the rest" step has no single line to compare (a batter's runs and a bowler's wickets are different things), so
 * it uses 1, 2 (for the player's own role), 4 and 5 only.
 */
export type XiRulesInput = { minBowlers: number; minBatters: number; requireKeeper: boolean; treatNoAnswerAsMaybe: boolean }

export type XiPlayer = {
  id: number
  name: string
  /** The effective role (selectors' own view, else suggested from the stats). */
  role: RoleOrUnknown
  roleSource: 'selectors' | 'stats'
  answer: Answer
  /** Grade name of another side this player is already picked in the same day. */
  alsoPickedIn: string | null
  /** The last five innings and spells from stored games, newest first (the `loadInsights` rows). */
  battingEntries: readonly BatEntry[]
  bowlingEntries: readonly BowlEntry[]
  gamesThisSeason: number
  /** Stored batting positions from the last five innings (1 to 11); innings without a recorded position are not here. */
  positions: readonly number[]
}

export type XiInput = {
  players: readonly XiPlayer[]
  rules: XiRulesInput
  /** 11, 12 or 13; 0 (no limit) is suggested at `SELECTION.xi.openTeamSize`. */
  size: number
  pins: readonly number[]
  leaves: readonly number[]
  /** A selector's chosen keeper for this proposal. Counts as pinned. */
  keeperId?: number | null
}

export type Need = 'keeper' | 'bowler' | 'batter' | 'best' | 'pinned'
export type XiPick = { id: number; name: string; order: number; need: Need; pinned: boolean; isKeeper: boolean; role: RoleOrUnknown; orderSuggested: boolean; medianPosition: number | null; reason: string }
export type XiReserve = { id: number; name: string; reason: string }
export type XiExclusion = { id: number; name: string; code: 'left-out' | 'out' | 'other-grade' | 'no-answer'; reason: string }
export type XiResult = { size: number; picks: XiPick[]; reserves: XiReserve[]; excluded: XiExclusion[]; keeperId: number | null; notes: string[] }

const tierOf = (a: Answer): number => (a === 'in' ? 0 : a === 'maybe' ? 1 : a === 'none' ? 2 : 3)

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const batRuns = (p: XiPlayer): number | null => (p.battingEntries.length ? sum(p.battingEntries.map((e) => e.runs)) : null)
const bowlLine = (p: XiPlayer): { wickets: number; runs: number } | null => (p.bowlingEntries.length ? { wickets: sum(p.bowlingEntries.map((e) => e.wickets)), runs: sum(p.bowlingEntries.map((e) => e.runs)) } : null)
const countsAsBowler = (p: XiPlayer) => p.role === 'bowler' || p.role === 'all-rounder'
const countsAsBatter = (p: XiPlayer) => p.role === 'batter' || p.role === 'all-rounder' || p.role === 'keeper'

type Metric = 'bat' | 'bowl' | 'none'
/** Which line is relevant to a player in the "best of the rest" step: bowlers by spells, everyone else by innings. */
const ownMetric = (p: XiPlayer): 'bat' | 'bowl' => (p.role === 'bowler' ? 'bowl' : 'bat')
const hasData = (p: XiPlayer, m: 'bat' | 'bowl') => (m === 'bat' ? p.battingEntries.length : p.bowlingEntries.length) >= SELECTION.xi.minFormEntries

/** The ordered tuple. Negative: `a` ranks before `b`. Always ends on name then id, so ties never depend on input order. */
function compare(a: XiPlayer, b: XiPlayer, metric: Metric): number {
  const t = tierOf(a.answer) - tierOf(b.answer)
  if (t) return t
  const ma = metric === 'none' ? ownMetric(a) : metric
  const mb = metric === 'none' ? ownMetric(b) : metric
  const d = Number(hasData(b, mb)) - Number(hasData(a, ma))
  if (d) return d
  if (metric === 'bat') {
    const ra = batRuns(a)
    const rb = batRuns(b)
    if (ra !== rb) return ra == null ? 1 : rb == null ? -1 : rb - ra
  } else if (metric === 'bowl') {
    const wa = bowlLine(a)
    const wb = bowlLine(b)
    if (wa == null && wb != null) return 1
    if (wb == null && wa != null) return -1
    if (wa && wb) {
      if (wa.wickets !== wb.wickets) return wb.wickets - wa.wickets
      if (wa.runs !== wb.runs) return wa.runs - wb.runs
    }
  }
  if (a.gamesThisSeason !== b.gamesThisSeason) return b.gamesThisSeason - a.gamesThisSeason
  return a.name.localeCompare(b.name) || a.id - b.id
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const lastN = (n: number) => (n === 5 ? 'five' : String(n))

/** "Last five bats: 34, 12*, 0, 51, 8" or "No batting data". */
export function battingText(p: XiPlayer): string {
  const n = p.battingEntries.length
  if (!n) return 'No batting data'
  const line = p.battingEntries.map((e) => `${e.runs}${e.notOut ? '*' : ''}`).join(', ')
  return n === 1 ? `Last bat: ${line}` : `Last ${lastN(n)} bats: ${line}`
}
export function bowlingText(p: XiPlayer): string {
  const n = p.bowlingEntries.length
  if (!n) return 'No bowling data'
  const line = p.bowlingEntries.map((e) => `${e.wickets}/${e.runs}`).join(', ')
  return n === 1 ? `Last spell: ${line}` : `Last ${lastN(n)} spells: ${line}`
}

const answerText = (a: Answer): string => (a === 'in' ? 'In' : a === 'maybe' ? 'Maybe' : a === 'out' ? 'Out (said they are out for this game)' : 'No answer yet')
const roleText = (p: XiPlayer): string => `${ROLE_LABEL[p.role].toLowerCase()}${p.role === 'unknown' ? '' : p.roleSource === 'selectors' ? ', role set by selectors' : ', role suggested from stored games'}`
const withCap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function pickReason(p: XiPlayer, need: Need, pinned: boolean): string {
  const lead =
    need === 'keeper' ? `Keeper (${roleText(p)})`
    : need === 'bowler' ? `Bowling option (${roleText(p)})`
    : need === 'batter' ? `Batter (${roleText(p)})`
    : need === 'best' ? `Best of those left (${roleText(p)})`
    : `Kept in the team (${roleText(p)})`
  const metric = need === 'bowler' ? 'bowl' : need === 'keeper' || need === 'batter' ? 'bat' : ownMetric(p)
  const line = metric === 'bowl' ? bowlingText(p) : battingText(p)
  const clash = p.alsoPickedIn ? ` Also picked in ${p.alsoPickedIn} that day.` : ''
  return `${pinned ? 'Pinned by you. ' : ''}${withCap(lead)}. ${answerText(p.answer)}. ${line}.${clash}`
}

export function suggestXi(input: XiInput): XiResult {
  const { rules } = input
  const notes: string[] = []
  const byId = new Map(input.players.map((p) => [p.id, p]))
  const size = input.size > 0 ? input.size : SELECTION.xi.openTeamSize
  if (input.size <= 0) notes.push(`No team size is set for this game, so ${size} players are suggested.`)

  const keeperPin = input.keeperId != null && byId.has(input.keeperId) ? input.keeperId : null
  const pinSet = new Set([...input.pins.filter((id) => byId.has(id)), ...(keeperPin != null ? [keeperPin] : [])])
  const leaveSet = new Set(input.leaves.filter((id) => byId.has(id) && !pinSet.has(id)))

  const picked: { p: XiPlayer; need: Need; pinned: boolean }[] = []
  const pickedIds = new Set<number>()
  const add = (p: XiPlayer, need: Need, pinned: boolean) => {
    picked.push({ p, need, pinned })
    pickedIds.add(p.id)
  }

  // Pins first (in the rank order of a plain fill, so the output never depends on the order of the query string).
  const pinned = [...pinSet].map((id) => byId.get(id)!).sort((a, b) => compare(a, b, 'none'))
  for (const p of pinned) add(p, 'pinned', true)
  if (pinned.length > size) notes.push(`You pinned ${pinned.length} players for a team of ${size}. Un-pin some before using this team.`)

  const eligible = (p: XiPlayer) => !pickedIds.has(p.id) && !leaveSet.has(p.id) && p.answer !== 'out' && p.alsoPickedIn == null && (p.answer !== 'none' || rules.treatNoAnswerAsMaybe)
  const counts = () => balanceCounts(picked.map((x) => ({ role: x.p.role, isKeeper: x.p.id === keeperPin })))
  const room = () => picked.length < size
  const best = (pred: (p: XiPlayer) => boolean, metric: Metric): XiPlayer | null => input.players.filter((p) => eligible(p) && pred(p)).sort((a, b) => compare(a, b, metric))[0] ?? null

  let keeperFilledBy: number | null = null
  if (rules.requireKeeper && counts().keepers === 0 && room()) {
    const k = best((p) => p.role === 'keeper', 'bat')
    if (k) {
      add(k, 'keeper', false)
      keeperFilledBy = k.id
    } else notes.push('No wicketkeeper is available, so none was picked. Set a keeper role on a player card, or pin one.')
  }
  while (room() && counts().bowlers < rules.minBowlers) {
    const p = best(countsAsBowler, 'bowl')
    if (!p) {
      notes.push(`Only ${counts().bowlers} bowling options are available (the rule is ${rules.minBowlers}).`)
      break
    }
    add(p, 'bowler', false)
  }
  while (room() && counts().batters < rules.minBatters) {
    const p = best(countsAsBatter, 'bat')
    if (!p) {
      notes.push(`Only ${counts().batters} batters are available (the rule is ${rules.minBatters}).`)
      break
    }
    add(p, 'batter', false)
  }
  while (room()) {
    const p = best(() => true, 'none')
    if (!p) {
      notes.push(`Only ${picked.length} players are available for a team of ${size}.`)
      break
    }
    add(p, 'best', false)
  }

  // Keeper tag: a chosen keeper, else the keeper the rules picked, else the best-ranked keeper already in the team.
  const keeperTag = keeperPin ?? keeperFilledBy ?? picked.filter((x) => x.p.role === 'keeper').sort((a, b) => compare(a.p, b.p, 'bat'))[0]?.p.id ?? null

  // Batting order: median stored position, only with enough innings; everyone else goes last in pick order.
  const medians = new Map<number, number>()
  for (const x of picked) if (x.p.positions.length >= SELECTION.xi.orderMinInnings) medians.set(x.p.id, median(x.p.positions))
  const ordered = [...picked.entries()].sort(([ia, a], [ib, b]) => {
    const ma = medians.get(a.p.id)
    const mb = medians.get(b.p.id)
    if (ma != null && mb != null) return ma - mb || a.p.name.localeCompare(b.p.name) || a.p.id - b.p.id
    if (ma != null) return -1
    if (mb != null) return 1
    return ia - ib
  })
  const picks: XiPick[] = ordered.map(([, x], i) => ({
    id: x.p.id,
    name: x.p.name,
    order: i + 1,
    need: x.need,
    pinned: x.pinned,
    isKeeper: x.p.id === keeperTag,
    role: x.p.role,
    orderSuggested: medians.has(x.p.id),
    medianPosition: medians.get(x.p.id) ?? null,
    reason: pickReason(x.p, x.need, x.pinned),
  }))

  // Reserves and exclusions: everyone not picked says why.
  const rest = input.players.filter((p) => !pickedIds.has(p.id))
  const reservePool = rest.filter(eligible).sort((a, b) => compare(a, b, 'none'))
  const nextBowler = reservePool.filter(countsAsBowler).sort((a, b) => compare(a, b, 'bowl'))[0]?.id
  const nextBatter = reservePool.filter((p) => countsAsBatter(p) && p.role !== 'keeper').sort((a, b) => compare(a, b, 'bat'))[0]?.id
  const nextKeeper = reservePool.filter((p) => p.role === 'keeper').sort((a, b) => compare(a, b, 'bat'))[0]?.id
  const reserves: XiReserve[] = reservePool.map((p) => {
    const bits: string[] = []
    if (p.id === nextKeeper) bits.push(`Next keeper in line: ${battingText(p).toLowerCase()}`)
    if (p.id === nextBowler) {
      const l = bowlLine(p)
      bits.push(l ? `Next bowler in line: ${plural(l.wickets, 'wicket', 'wickets')} in last ${lastN(p.bowlingEntries.length)} ${p.bowlingEntries.length === 1 ? 'spell' : 'spells'}` : 'Next bowler in line: no stored spells')
    }
    if (p.id === nextBatter) {
      const r = batRuns(p)
      bits.push(r != null ? `Next batter in line: ${plural(r, 'run', 'runs')} in last ${lastN(p.battingEntries.length)} innings` : 'Next batter in line: no stored innings')
    }
    if (!bits.length) bits.push(`Not needed: the team is full (${roleText(p)})`)
    return { id: p.id, name: p.name, reason: `${withCap(bits.join('. '))}. ${answerText(p.answer)}. ${ownMetric(p) === 'bowl' ? bowlingText(p) : battingText(p)}.` }
  })
  const excluded: XiExclusion[] = rest
    .filter((p) => !eligible(p))
    .map((p): XiExclusion => {
      if (leaveSet.has(p.id)) return { id: p.id, name: p.name, code: 'left-out', reason: 'Left out by you.' }
      if (p.answer === 'out') return { id: p.id, name: p.name, code: 'out', reason: 'Out. They said they are out for this game.' }
      if (p.alsoPickedIn) return { id: p.id, name: p.name, code: 'other-grade', reason: `Already in ${p.alsoPickedIn}.` }
      return { id: p.id, name: p.name, code: 'no-answer', reason: 'No answer yet, and the settings leave out players who have not answered.' }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)

  return { size, picks, reserves, excluded, keeperId: keeperTag, notes }
}
