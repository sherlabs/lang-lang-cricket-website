import { aggregateFromMatchRows, emptyPlayerRows, type PlayerRows } from '@/lib/match-store/aggregate'
import { matchCountsOf } from './match/counts'
import type { MatchMinimums } from './match/minimums'
import { inningsKey, type FactSet, type MatchHeader, type MatchCounts } from './match/types'
import { finishStatLab, type StatLabContext, type StatLabParams, type StatLabResult, type StatLabRow } from './statlab'
import type { MatchCells } from './statlab-columns'

/**
 * Match-mode StatLab table (W2 spec 5.1), pure. Every figure, classic or match-only, comes from the
 * same stored match rows, so the table never mixes sources. The caller filters the fact set (season,
 * grade, categories, opposition, format) with `filterMatchFacts` first.
 *
 * Partnership columns are inferred from batting order and fall of wickets, so they count only the
 * innings where a stand could be derived and are `n/a` for a player with none.
 */
type Group = {
  playerId: number
  seasons: Set<string>
  teams: Set<string>
  grades: Set<string>
  rows: PlayerRows
  set: FactSet
  stands: { runs: number }[]
  batInnings: Set<string>
}

export type MatchLabContext = Pick<StatLabContext, 'players' | 'activeIds'> & {
  minimums: MatchMinimums
  /** Shown name for a canonical grade label (the label map is built by the caller). */
  gradeLabel?: (raw: string | null) => string | null
}

function matchCells(g: Group, counts: MatchCounts): MatchCells {
  const available = [...g.batInnings].filter((k) => g.set.innings.get(k)?.partnerships === 'ok').length
  return { counts, partnerships: { innings: available, best: g.stands.reduce<number | null>((b, s) => (b === null || s.runs > b ? s.runs : b), null), fifties: g.stands.filter((s) => s.runs >= 50).length } }
}

export function buildMatchStatLab(p: StatLabParams, set: FactSet, ctx: MatchLabContext, forcedByColumn: boolean): StatLabResult {
  const label = ctx.gradeLabel ?? ((g: string | null) => g)
  const groups = new Map<string, Group>()
  const keyOf = (playerId: number, h: MatchHeader) =>
    p.scope === 'career' ? `${playerId}` : p.scope === 'season' ? `${playerId}\u0000${h.seasonName}` : `${playerId}\u0000${h.seasonName}\u0000${h.team}`
  const get = (playerId: number, m: number): Group | null => {
    const h = set.matches.get(m)
    if (!h || !ctx.players.has(playerId)) return null
    const k = keyOf(playerId, h)
    let g = groups.get(k)
    if (!g) {
      g = {
        playerId, seasons: new Set(), teams: new Set(), grades: new Set(), rows: emptyPlayerRows(),
        set: { matches: set.matches, innings: set.innings, appearances: [], bat: [], bowl: [], credits: [], partnerships: [] }, stands: [], batInnings: new Set(),
      }
      groups.set(k, g)
    }
    g.seasons.add(h.seasonName)
    g.teams.add(h.team)
    const gl = label(h.grade)
    if (gl) g.grades.add(gl)
    return g
  }

  for (const a of set.appearances) {
    const g = get(a.player, a.m)
    if (!g) continue
    g.rows.games++
    g.set.appearances.push(a)
  }
  for (const b of set.bat) {
    const g = get(b.player, b.m)
    if (!g) continue
    g.set.bat.push(b)
    g.batInnings.add(inningsKey(b.m, b.seq))
    g.rows.batting.push({ played: true, status: b.status, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes })
  }
  for (const w of set.bowl) {
    const g = get(w.player, w.m)
    if (!g) continue
    g.set.bowl.push(w)
    g.rows.bowling.push({ played: true, balls: w.balls, maidens: w.maidens, runs: w.runs, wickets: w.wickets })
  }
  for (const c of set.credits) {
    const g = get(c.player, c.m)
    if (!g) continue
    g.set.credits.push(c)
    g.rows.catches += c.catches
  }
  // A stand belongs to each visible partner. The runs of a stand with a hidden partner are not identifying.
  for (const s of set.partnerships) {
    const ids = [s.a, s.b].filter((x): x is number => x !== null)
    for (const id of new Set(ids)) get(id, s.m)?.stands.push({ runs: s.runs })
  }

  const items: StatLabRow[] = []
  for (const g of groups.values()) {
    const pl = ctx.players.get(g.playerId)!
    const counts = aggregateFromMatchRows(g.rows)
    items.push({
      playerId: g.playerId, name: pl.name, slug: pl.slug,
      season: p.scope === 'career' ? '' : [...g.seasons][0],
      team: p.scope === 'team-season' ? [...g.teams][0] : '',
      grade: [...g.grades].sort((a, b) => a.localeCompare(b)).join(' / '),
      seasons: g.seasons.size,
      counts,
      match: matchCells(g, matchCountsOf(g.set)),
    })
  }
  return finishStatLab(items, p, ctx, 'match', forcedByColumn)
}
