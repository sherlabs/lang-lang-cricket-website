import { closestPlayers } from '@/lib/players/duplicates'
import type { MatchBundle } from '@/lib/playhq/match-rows'
import { normaliseClubName } from '@/lib/stats/match/opposition-key'
import { importedSeasonOrder, importedSeasonTeamId } from './constants'
import { buildImportedBundle } from './bundle'
import type { RowIssue } from './csv-parse'
import type { ImportedGame } from './match-rows'
import type { SeasonTotalsRow } from './season-totals'

/**
 * Plans an import without touching the database (W2 spec 6.1): which rows are created, updated or unchanged, which
 * are errors, which players are new. `apply` runs the same plan, so the dry run and the write cannot disagree.
 */
export type KnownPlayer = { id: number; firstName: string; lastName: string; hidden: boolean }

export type ImportContext = {
  /** Lower-case `first|last` name key to the player it routes to (through `player_aliases`). */
  playersByKey: ReadonlyMap<string, KnownPlayer>
  allPlayers: readonly KnownPlayer[]
  /** `${playerId}|${startYear}` for every PlayHQ season row (history PlayHQ already covers is never double counted). */
  playhqSeasons: ReadonlySet<string>
  /** `${localDate}|${normalised opponent}` for every PlayHQ game. */
  playhqGames: ReadonlySet<string>
  /** Imported season rows: key `${playerId}|${teamId}` to the stored counts (JSON of the counts, grade and team name). */
  existingSeasons: ReadonlyMap<string, string>
  /** Imported games: `gameId` to the stored `sourceHash`. */
  existingMatches: ReadonlyMap<string, string>
  createUnknown: boolean
}

export type NewPlayerPlan = { nameKey: string; firstName: string; lastName: string; rows: number[] }
export type PlanSummary = { create: number; update: number; unchanged: number; errors: number; warnings: number; ignored: number }
export type ImportPlan<Op> = {
  kind: 'season-totals' | 'match-rows'
  summary: PlanSummary
  rowErrors: RowIssue[]
  warnings: RowIssue[]
  newPlayers: NewPlayerPlan[]
  /** Rows that overlap data PlayHQ already holds (also counted in `rowErrors`). */
  overlaps: RowIssue[]
  ops: Op[]
}

export type SeasonOp = {
  action: 'create' | 'update' | 'unchanged'
  row: SeasonTotalsRow
  playerId: number | null
  /** Set when the player does not exist yet. */
  newNameKey: string | null
  teamId: string
  seasonOrder: number
  signature: string
}
export type MatchOp = { action: 'create' | 'update' | 'unchanged'; game: ImportedGame; bundle: MatchBundle }

export const seasonSignature = (r: Pick<SeasonTotalsRow, 'counts' | 'gradeName' | 'teamName' | 'season'>): string =>
  JSON.stringify([r.season, r.teamName, r.gradeName, Object.entries(r.counts).sort(([a], [b]) => a.localeCompare(b))])

/** Resolves player names; unknown names are warnings with the closest existing players, or errors unless the admin allows new players. */
function resolvePlayers(
  items: { row: number; firstName: string; lastName: string; nameKey: string }[],
  ctx: ImportContext,
  rowErrors: RowIssue[],
  warnings: RowIssue[],
): { newPlayers: NewPlayerPlan[]; unresolved: Set<number> } {
  const fresh = new Map<string, NewPlayerPlan>()
  const unresolved = new Set<number>()
  for (const it of items) {
    if (ctx.playersByKey.has(it.nameKey)) continue
    const entry = fresh.get(it.nameKey)
    if (entry) { entry.rows.push(it.row); continue }
    const near = closestPlayers(it, ctx.allPlayers, 3)
    const hint = near.length ? ` Did you mean ${near.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(' or ')}? Use that spelling to add to the existing player.` : ''
    if (ctx.createUnknown) {
      fresh.set(it.nameKey, { nameKey: it.nameKey, firstName: it.firstName, lastName: it.lastName, rows: [it.row] })
      warnings.push({ row: it.row, column: 'first_name', message: `"${`${it.firstName} ${it.lastName}`.trim()}" is not a known player and will be created.${hint}` })
    } else {
      unresolved.add(it.row)
      rowErrors.push({ row: it.row, column: 'first_name', message: `"${`${it.firstName} ${it.lastName}`.trim()}" is not a known player.${hint} Tick "create new players for unknown names" to add them.` })
    }
  }
  return { newPlayers: [...fresh.values()], unresolved }
}

const summarise = (ops: { action: string }[], rowErrors: RowIssue[], warnings: RowIssue[], ignored: number): PlanSummary => ({
  create: ops.filter((o) => o.action === 'create').length,
  update: ops.filter((o) => o.action === 'update').length,
  unchanged: ops.filter((o) => o.action === 'unchanged').length,
  errors: new Set(rowErrors.map((e) => `${e.row}|${e.column}|${e.message}`)).size,
  warnings: warnings.length,
  ignored,
})

export function planSeasonTotalsImport(
  parsed: { rows: SeasonTotalsRow[]; issues: RowIssue[]; ignored: number },
  ctx: ImportContext,
): ImportPlan<SeasonOp> {
  const rowErrors = [...parsed.issues]
  const warnings: RowIssue[] = []
  const overlaps: RowIssue[] = []
  const { newPlayers, unresolved } = resolvePlayers(parsed.rows, ctx, rowErrors, warnings)
  const ops: SeasonOp[] = []
  for (const row of parsed.rows) {
    if (unresolved.has(row.row)) continue
    const player = ctx.playersByKey.get(row.nameKey) ?? null
    if (player && ctx.playhqSeasons.has(`${player.id}|${row.seasonStartYear}`)) {
      const issue = { row: row.row, column: 'season', message: `PlayHQ already has ${row.season} for ${row.firstName} ${row.lastName}. Remove this row so the season is not counted twice.` }
      rowErrors.push(issue)
      overlaps.push(issue)
      continue
    }
    const teamId = importedSeasonTeamId(row.season, row.teamSlug)
    const signature = seasonSignature(row)
    const stored = player ? ctx.existingSeasons.get(`${player.id}|${teamId}`) : undefined
    ops.push({
      action: stored === undefined ? 'create' : stored === signature ? 'unchanged' : 'update',
      row, playerId: player?.id ?? null, newNameKey: player ? null : row.nameKey, teamId, seasonOrder: importedSeasonOrder(row.seasonStartYear), signature,
    })
  }
  return { kind: 'season-totals', summary: summarise(ops, rowErrors, warnings, parsed.ignored), rowErrors: rowErrors.sort(byRow), warnings, newPlayers, overlaps, ops }
}

export function planMatchRowsImport(
  parsed: { games: ImportedGame[]; issues: RowIssue[]; ignored: number },
  ctx: ImportContext,
): ImportPlan<MatchOp> {
  const rowErrors = [...parsed.issues]
  const warnings: RowIssue[] = []
  const overlaps: RowIssue[] = []
  const players = parsed.games.flatMap((g) => g.players)
  const { newPlayers, unresolved } = resolvePlayers(players, ctx, rowErrors, warnings)
  const ops: MatchOp[] = []
  for (const game of parsed.games) {
    if (game.players.some((p) => unresolved.has(p.row))) continue
    if (ctx.playhqGames.has(`${game.date}|${normaliseClubName(game.opponent)}`)) {
      const issue = { row: game.firstRow, column: 'date', message: `PlayHQ already has the game on ${game.date} against ${game.opponent}. Remove these rows so the game is not counted twice.` }
      rowErrors.push(issue)
      overlaps.push(issue)
      continue
    }
    const bundle = buildImportedBundle(game)
    const stored = ctx.existingMatches.get(game.gameId)
    ops.push({ action: stored === undefined ? 'create' : stored === bundle.sourceHash ? 'unchanged' : 'update', game, bundle })
  }
  return { kind: 'match-rows', summary: summarise(ops, rowErrors, warnings, parsed.ignored), rowErrors: rowErrors.sort(byRow), warnings, newPlayers, overlaps, ops }
}

const byRow = (a: RowIssue, b: RowIssue) => a.row - b.row || (a.column ?? '').localeCompare(b.column ?? '')
