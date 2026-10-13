import { type FactSet, type InningsMeta, type MatchHeader, type PartnershipFact, type PartnershipReason } from '@/lib/stats/match/types'

/**
 * Fall-of-wicket views (wave E, WP-4). Pure; club-side aggregates only, no person. A figure here is the team score when a
 * wicket fell, never an over: PlayHQ gives no over, minute or delivery for a wicket. Limited-overs and two-day games are never
 * averaged together, because a score at wicket 3 means different things in 35 overs and over two days.
 */
export type FormatGroup = 'limited' | 'timed'
export type Side = 'ours' | 'theirs'

/** The format group from the stored game type (`oneDay` / `twoDay`); null when the stored type is neither. */
export function formatGroup(h: Pick<MatchHeader, 'format'>): FormatGroup | null {
  return h.format === 'oneDay' ? 'limited' : h.format === 'twoDay' ? 'timed' : null
}

export type Collapse = {
  /** First and last wicket of the collapse (1-based). */
  from: number
  to: number
  /** Team score before the first of these wickets fell, and when the last fell. */
  startScore: number
  endScore: number
  wickets: number
  runs: number
}

/**
 * Windows of `wickets` consecutive wickets that added at most `runs` runs in total (the runs between the wicket before the
 * window and its last wicket). Overlapping or touching windows are one collapse, counted once, reported as the whole span.
 */
export function findCollapses(fow: readonly number[], wickets: number, runs: number): Collapse[] {
  const at = (k: number) => (k <= 0 ? 0 : fow[k - 1])
  const spans: { from: number; to: number }[] = []
  for (let first = 1; wickets >= 1 && first + wickets - 1 <= fow.length; first++) {
    const last = first + wickets - 1
    if (at(last) - at(first - 1) > runs) continue
    const open = spans[spans.length - 1]
    if (open && first <= open.to) open.to = last
    else spans.push({ from: first, to: last })
  }
  return spans.map(({ from, to }) => ({ from, to, startScore: at(from - 1), endScore: at(to), wickets: to - from + 1, runs: at(to) - at(from - 1) }))
}

export type FowInnings = { m: number; seq: number; side: Side; fow: number[]; header: MatchHeader; group: FormatGroup | null }

export type FowCoverage = {
  /** Played innings in view. */
  innings: number
  /** Innings with a validated fall of wickets. */
  valid: number
  /** Played innings with no fall of wickets stored (imported history, scorers who left it out). */
  noFow: number
  /** Stored fall of wickets that failed validation, by reason code. */
  rejected: Partial<Record<PartnershipReason, number>>
  rejectedTotal: number
}

export function fowInnings(set: FactSet): { list: FowInnings[]; coverage: FowCoverage } {
  const list: FowInnings[] = []
  const coverage: FowCoverage = { innings: 0, valid: 0, noFow: 0, rejected: {}, rejectedTotal: 0 }
  for (const i of set.innings.values()) {
    const header = set.matches.get(i.m)
    if (!header) continue
    coverage.innings++
    if (i.fow) {
      coverage.valid++
      list.push({ m: i.m, seq: i.seq, side: i.clubBatting ? 'ours' : 'theirs', fow: i.fow, header, group: formatGroup(header) })
    } else if (i.fowReject) {
      coverage.rejected[i.fowReject] = (coverage.rejected[i.fowReject] ?? 0) + 1
      coverage.rejectedTotal++
    } else {
      coverage.noFow++
    }
  }
  list.sort((a, b) => (a.header.date ?? '9999-12-31').localeCompare(b.header.date ?? '9999-12-31') || a.m - b.m || a.seq - b.seq)
  return { list, coverage }
}

export type WicketCell = { wicket: number; n: number; mean: number | null; min: number | null; max: number | null }

/** Mean and range of the team score at wicket 1..10 over the innings given; a mean needs `minInnings` innings behind it. */
export function scoreAtWicket(items: readonly FowInnings[], minInnings: number, maxWicket = 10): WicketCell[] {
  const cells: WicketCell[] = []
  for (let w = 1; w <= maxWicket; w++) {
    const xs = items.flatMap((x) => (x.fow.length >= w ? [x.fow[w - 1]] : []))
    const enough = xs.length >= Math.max(1, minInnings)
    cells.push({
      wicket: w, n: xs.length,
      mean: enough ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
      min: enough ? Math.min(...xs) : null,
      max: enough ? Math.max(...xs) : null,
    })
  }
  return cells
}

export type FormatBlock = { group: FormatGroup; games: number; innings: number; cells: WicketCell[] }
export type SideTable = {
  side: Side
  blocks: FormatBlock[]
  /** Two-day games left out because there are too few for a table of their own (count of games), else 0. */
  timedLeftOut: number
  /** Valid innings whose stored game type is neither one-day nor two-day. */
  unknownFormat: number
}

/** Score-at-wicket tables for one side, one block per format group. Timed games get a block only with `minTimedGames` games. */
export function sideTable(list: readonly FowInnings[], side: Side, o: { minInnings: number; minTimedGames: number }): SideTable {
  const mine = list.filter((x) => x.side === side)
  const blocks: FormatBlock[] = []
  let timedLeftOut = 0
  for (const group of ['limited', 'timed'] as const) {
    const items = mine.filter((x) => x.group === group)
    if (items.length === 0) continue
    const games = new Set(items.map((x) => x.m)).size
    if (group === 'timed' && games < o.minTimedGames) {
      timedLeftOut = games
      continue
    }
    blocks.push({ group, games, innings: items.length, cells: scoreAtWicket(items, o.minInnings) })
  }
  return { side, blocks, timedLeftOut, unknownFormat: mine.filter((x) => x.group === null).length }
}

export type CollapseEntry = {
  side: Side
  header: MatchHeader
  seq: number
  group: FormatGroup | null
  collapse: Collapse
  /** Biggest stand after the collapse (inferred), our batting only; null when the partnerships could not be derived. */
  recovery: number | null
}

export type CollapseSummary = {
  entries: CollapseEntry[]
  /** Innings with at least one collapse, per season and side, newest season first. */
  perSeason: { season: string; startYear: number; ours: number; theirs: number; innings: number }[]
}

/**
 * Every collapse in the validated innings, newest first. A collapse is counted in any format (four wickets for 20 is four for
 * 20 in a two-day game too); the format group is shown beside it. Recovery uses the stored inferred partnerships of our
 * batting innings: the biggest stand that began after the collapse ended.
 */
export function collapseSummary(list: readonly FowInnings[], partnerships: readonly PartnershipFact[], innings: ReadonlyMap<string, InningsMeta>, o: { wickets: number; runs: number }): CollapseSummary {
  const stands = new Map<string, PartnershipFact[]>()
  for (const p of partnerships) {
    const k = `${p.m}:${p.seq}`
    const l = stands.get(k)
    if (l) l.push(p)
    else stands.set(k, [p])
  }
  const entries: CollapseEntry[] = []
  const perSeason = new Map<string, { season: string; startYear: number; ours: number; theirs: number; innings: number }>()
  for (const x of list) {
    const season = perSeason.get(x.header.seasonName) ?? { season: x.header.seasonName, startYear: x.header.seasonStartYear ?? 0, ours: 0, theirs: 0, innings: 0 }
    season.innings++
    perSeason.set(x.header.seasonName, season)
    const found = findCollapses(x.fow, o.wickets, o.runs)
    if (found.length === 0) continue
    season[x.side]++
    const meta = innings.get(`${x.m}:${x.seq}`)
    const derivable = x.side === 'ours' && meta?.partnerships === 'ok'
    for (const collapse of found) {
      const after = derivable ? (stands.get(`${x.m}:${x.seq}`) ?? []).filter((p) => p.wicket > collapse.to) : []
      entries.push({ side: x.side, header: x.header, seq: x.seq, group: x.group, collapse, recovery: derivable && after.length ? Math.max(...after.map((p) => p.runs)) : null })
    }
  }
  entries.sort((a, b) => (b.header.date ?? '').localeCompare(a.header.date ?? '') || b.header.id - a.header.id || a.seq - b.seq || a.collapse.from - b.collapse.from)
  return { entries, perSeason: [...perSeason.values()].sort((a, b) => b.startYear - a.startYear || a.season.localeCompare(b.season)) }
}

