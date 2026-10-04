import { createHash } from 'node:crypto'
import { and, eq, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { matchTables, MATCH_SCHEMA } from '@/lib/match-store/db'
import { writeBundle } from '@/lib/match-store/write'
import { chunk } from '@/lib/players/db'
import { uniqueSlug } from '@/lib/players/plan'
import { ballsToOvers } from '@/lib/playhq/players'
import { titleCase } from '@/lib/playhq/names'
import { slugify } from '@/lib/slugify'
import { toCsv, type CsvCell } from '@/lib/stats/csv'
import { normaliseClubName } from '@/lib/stats/match/opposition-key'
import { revalidateStats } from '@/lib/stats/tags'
import { parseCsv } from './csv-parse'
import { parseMatchRows, MATCH_ROWS_COLUMNS, MATCH_ROWS_EXPORT_EXTRA } from './match-rows'
import { parseSeasonTotals, SEASON_TOTALS_COLUMNS, SEASON_TOTALS_EXPORT_EXTRA } from './season-totals'
import { planMatchRowsImport, planSeasonTotalsImport, seasonSignature, type ImportContext, type ImportPlan, type KnownPlayer, type MatchOp, type SeasonOp } from './plan'
import type { ImportKind } from './templates'

/**
 * Database side of the historical import (W2 spec 6.1). Preview reads and writes nothing; apply re-parses the same
 * text and writes everything in one transaction. Raw drizzle (hooks do not run), so revalidation is explicit.
 */

// Payload types its drizzle tables as `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any

type AnyPlan = ImportPlan<SeasonOp> | ImportPlan<MatchOp>
export type PreviewResult = { fileHash: string; plan: Omit<AnyPlan, 'ops'> & { ops?: never } }

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const startYearOf = (name: string) => {
  const m = /\d{4}/.exec(name)
  return m ? Number(m[0]) : null
}
export const fileHashOf = (text: string): string => createHash('sha1').update(text).digest('hex')

const SEASON_COUNT_KEYS = [
  'games', 'batInnings', 'batNotOuts', 'batRuns', 'batHighScore', 'batBalls', 'batFours', 'batSixes', 'batRunsUnballed',
  'bowlBalls', 'bowlMaidens', 'bowlRuns', 'bowlWickets', 'bowlBestWickets', 'bowlBestRuns', 'catches',
] as const

export async function loadImportContext(payload: Payload, createUnknown: boolean): Promise<ImportContext> {
  const db = payload.db.drizzle
  const { players, player_aliases, player_seasons } = payload.db.tables as Record<string, Table>
  const t = matchTables(payload)
  const [playerRows, aliasRows, seasonRows, matchRows] = await Promise.all([
    db.select({ id: players.id, firstName: players.firstName, lastName: players.lastName, hidden: players.hidden }).from(players),
    db.select({ nameKey: player_aliases.nameKey, player: player_aliases.player }).from(player_aliases),
    db.select().from(player_seasons),
    db.select({ gameId: t.matches.gameId, source: t.matches.source, sourceHash: t.matches.sourceHash, localDate: t.matches.localDate, opponentName: t.matches.opponentName, opponentOrgName: t.matches.opponentOrgName }).from(t.matches),
  ])
  const byId = new Map<number, KnownPlayer>()
  for (const p of playerRows as { id: number; firstName: string; lastName: string; hidden: boolean | null }[]) {
    byId.set(Number(p.id), { id: Number(p.id), firstName: p.firstName ?? '', lastName: p.lastName ?? '', hidden: p.hidden === true })
  }
  const playersByKey = new Map<string, KnownPlayer>()
  for (const a of aliasRows as { nameKey: string; player: number }[]) {
    const p = byId.get(Number(a.player))
    if (p) playersByKey.set(a.nameKey.trim().toLowerCase(), p)
  }
  const playhqSeasons = new Set<string>()
  const existingSeasons = new Map<string, string>()
  for (const r of seasonRows as Record<string, unknown>[]) {
    if (r.source === 'import') {
      const counts = Object.fromEntries([...SEASON_COUNT_KEYS.map((k) => [k, num(r[k])]), ['batHighScoreNotOut', r.batHighScoreNotOut === true]]) as never
      existingSeasons.set(`${num(r.player)}|${r.teamId}`, seasonSignature({ season: String(r.seasonName), teamName: String(r.teamName), gradeName: (r.gradeName as string | null) ?? null, counts }))
    } else {
      const y = startYearOf(String(r.seasonName))
      if (y !== null) playhqSeasons.add(`${num(r.player)}|${y}`)
    }
  }
  const playhqGames = new Set<string>()
  const existingMatches = new Map<string, string>()
  for (const m of matchRows as { gameId: string; source: string | null; sourceHash: string | null; localDate: string | null; opponentName: string | null; opponentOrgName: string | null }[]) {
    if (m.source === 'import') existingMatches.set(m.gameId, m.sourceHash ?? '')
    else if (m.localDate) {
      for (const name of [m.opponentOrgName, m.opponentName]) if (name) playhqGames.add(`${m.localDate}|${normaliseClubName(name)}`)
    }
  }
  return { playersByKey, allPlayers: [...byId.values()], playhqSeasons, playhqGames, existingSeasons, existingMatches, createUnknown }
}

export type PlanResult = { ok: true; fileHash: string; plan: AnyPlan } | { ok: false; error: string }

/** Parses and plans; touches nothing. */
export async function planImport(payload: Payload, kind: ImportKind, csvText: string, createUnknown: boolean): Promise<PlanResult> {
  const csv = parseCsv(csvText)
  if (!csv.ok) return { ok: false, error: csv.error }
  const ctx = await loadImportContext(payload, createUnknown)
  const plan = kind === 'season-totals' ? planSeasonTotalsImport(parseSeasonTotals(csv), ctx) : planMatchRowsImport(parseMatchRows(csv), ctx)
  return { ok: true, fileHash: fileHashOf(csvText), plan }
}

/** The preview payload: the summary and problems, without the operations. */
export function previewOf(r: Extract<PlanResult, { ok: true }>) {
  const { ops: _ops, ...rest } = r.plan
  void _ops
  return { fileHash: r.fileHash, ...rest }
}

export const newBatchId = (fileHash: string, now = new Date()) => `imp-${now.toISOString().replace(/\D/g, '').slice(0, 14)}-${fileHash.slice(0, 6)}`

export type ApplyResult = { ok: true; batch: string; created: number; updated: number; unchanged: number; playersCreated: number } | { ok: false; error: string }

export async function applyImport(payload: Payload, kind: ImportKind, csvText: string, opts: { createUnknown: boolean; expectedHash?: string | null; now?: Date }): Promise<ApplyResult> {
  const planned = await planImport(payload, kind, csvText, opts.createUnknown)
  if (!planned.ok) return planned
  if (opts.expectedHash && opts.expectedHash !== planned.fileHash) return { ok: false, error: 'The file is not the one that was previewed. Preview it again before importing.' }
  const { plan } = planned
  if (plan.rowErrors.length) return { ok: false, error: `Nothing was imported: the file still has ${plan.summary.errors} problem${plan.summary.errors === 1 ? '' : 's'}. Fix them and preview again.` }
  const batch = newBatchId(planned.fileHash, opts.now)
  const db = payload.db.drizzle
  const t = matchTables(payload)
  const { players, player_aliases, player_seasons } = payload.db.tables as Record<string, Table>
  const stamp = (opts.now ?? new Date()).toISOString()

  let playersCreated = 0
  await db.transaction(async (tx) => {
    // 1. New players (never hidden, source manual) with their alias, so every later sync routes the name to them.
    const idByKey = new Map<string, number>()
    if (plan.newPlayers.length) {
      const slugRows = await tx.select({ slug: players.slug }).from(players)
      const taken = new Set((slugRows as { slug: string | null }[]).map((r) => r.slug).filter((s): s is string => Boolean(s)))
      for (const part of chunk(plan.newPlayers, 200)) {
        const values = part.map((p) => ({
          slug: uniqueSlug(slugify(`${p.firstName} ${p.lastName}`), taken), firstName: p.firstName, lastName: p.lastName, displayName: `${p.firstName} ${p.lastName}`.trim(),
          source: 'manual', bio: '', manualYears: '', isActiveDerived: false, hidden: false, createdAt: stamp, updatedAt: stamp,
        }))
        const inserted: { id: number; slug: string }[] = await tx.insert(players).values(values).returning({ id: players.id, slug: players.slug })
        const bySlug = new Map(inserted.map((r) => [r.slug, r.id]))
        part.forEach((p, i) => {
          const id = bySlug.get(values[i].slug)!
          idByKey.set(p.nameKey, id)
        })
        await tx.insert(player_aliases).values(part.map((p) => ({ nameKey: p.nameKey, player: idByKey.get(p.nameKey)!, createdAt: stamp, updatedAt: stamp }))).onConflictDoNothing()
      }
      playersCreated = plan.newPlayers.length
    }
    const idOf = (key: string, known: number | null) => known ?? idByKey.get(key)!

    if (plan.kind === 'season-totals') {
      for (const op of (plan as ImportPlan<SeasonOp>).ops) {
        if (op.action === 'unchanged') continue
        const player = idOf(op.row.nameKey, op.playerId)
        const values = {
          player, seasonName: op.row.season, seasonOrder: op.seasonOrder, teamId: op.teamId, teamName: op.row.teamName, gradeName: op.row.gradeName,
          ...op.row.counts, source: 'import', importBatch: batch, seasonStartYear: op.row.seasonStartYear, updatedAt: stamp,
        }
        if (op.action === 'create') await tx.insert(player_seasons).values({ ...values, createdAt: stamp })
        else await tx.update(player_seasons).set(values).where(and(eq(player_seasons.player, player), eq(player_seasons.teamId, op.teamId)))
      }
    } else {
      const aliasRows: { nameKey: string; player: number }[] = await tx.select({ nameKey: player_aliases.nameKey, player: player_aliases.player }).from(player_aliases)
      const aliasMap = new Map(aliasRows.map((a) => [a.nameKey, Number(a.player)]))
      for (const op of (plan as ImportPlan<MatchOp>).ops) {
        if (op.action === 'unchanged') continue
        await writeBundle(tx, t, op.bundle, aliasMap, { source: 'import', importBatch: batch })
      }
    }
  })
  await revalidateStats(['/players', '/stats', '/records', '/honours', '/players/compare', '/stats/opposition', '/records/partnerships'])
  return { ok: true, batch, created: plan.summary.create, updated: plan.summary.update, unchanged: plan.summary.unchanged, playersCreated }
}

/** Deletes the rows one import brought in (confirmation happens in the UI). One transaction. */
export async function undoImportBatch(payload: Payload, batch: string): Promise<{ seasons: number; matches: number }> {
  if (!/^imp-[0-9a-f-]+$/i.test(batch)) throw new Error('That is not an import batch.')
  const t = matchTables(payload)
  const { player_seasons } = payload.db.tables as Record<string, Table>
  const out = await payload.db.drizzle.transaction(async (tx) => {
    const s: { id: number }[] = await tx.delete(player_seasons).where(and(eq(player_seasons.source, 'import'), eq(player_seasons.importBatch, batch))).returning({ id: player_seasons.id })
    // Children go with the match through ON DELETE cascade.
    const m: { id: number }[] = await tx.delete(t.matches).where(and(eq(t.matches.source, 'import'), eq(t.matches.importBatch, batch))).returning({ id: t.matches.id })
    return { seasons: s.length, matches: m.length }
  })
  await revalidateStats(['/players', '/stats', '/records', '/honours', '/players/compare', '/stats/opposition', '/records/partnerships'])
  return out
}

export type ImportBatchInfo = { batch: string; seasons: number; matches: number; at: string }

/** Imports still in the database, newest first (the import log; also feeds the notification centre). */
export async function listImportBatches(payload: Payload): Promise<ImportBatchInfo[]> {
  const res = await payload.db.drizzle.execute(
    sql.raw(
      `SELECT batch, SUM(seasons)::int AS seasons, SUM(matches)::int AS matches, MAX(at) AS at FROM (` +
        `SELECT "import_batch" AS batch, COUNT(*) AS seasons, 0 AS matches, MAX("updated_at") AS at FROM "${MATCH_SCHEMA}"."player_seasons" WHERE "source" = 'import' AND "import_batch" IS NOT NULL GROUP BY 1 ` +
        `UNION ALL SELECT "import_batch", 0, COUNT(*), MAX("updated_at") FROM "${MATCH_SCHEMA}"."matches" WHERE "source" = 'import' AND "import_batch" IS NOT NULL GROUP BY 1) x GROUP BY batch ORDER BY MAX(at) DESC`,
    ),
  )
  const rows = ((res as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[]
  return rows.map((r) => ({ batch: String(r.batch), seasons: num(r.seasons), matches: num(r.matches), at: new Date(String(r.at)).toISOString() }))
}

// ---------------------------------------------------------------- export

const yesNo = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : '')
const shortSeason = (name: string) => /\d{4}\/\d{2}/.exec(name)?.[0] ?? name

/** Every season row (PlayHQ and imported) in the import template layout, plus `source` and `hidden`. Admin only: hidden players are included. */
export async function exportSeasonTotals(payload: Payload): Promise<string> {
  const db = payload.db.drizzle
  const { players, player_seasons } = payload.db.tables as Record<string, Table>
  const [seasons, people] = await Promise.all([db.select().from(player_seasons), db.select({ id: players.id, firstName: players.firstName, lastName: players.lastName, hidden: players.hidden }).from(players)])
  const byId = new Map((people as { id: number; firstName: string; lastName: string; hidden: boolean | null }[]).map((p) => [Number(p.id), p]))
  const rows = (seasons as Record<string, unknown>[])
    .map((s) => ({ s, p: byId.get(num(s.player)) }))
    .filter((x) => x.p)
    .sort((a, b) => num(a.s.seasonOrder) - num(b.s.seasonOrder) || String(a.p!.lastName).localeCompare(String(b.p!.lastName)) || String(a.p!.firstName).localeCompare(String(b.p!.firstName)) || String(a.s.teamName).localeCompare(String(b.s.teamName)))
    .map(({ s, p }): CsvCell[] => {
      const unballed = num(s.batBalls) === 0 && num(s.batRunsUnballed) > 0
      return [
        shortSeason(String(s.seasonName)), String(s.teamName), (s.gradeName as string | null) ?? '', p!.firstName, p!.lastName ?? '',
        num(s.games), num(s.batInnings), num(s.batNotOuts), num(s.batRuns), num(s.batHighScore), yesNo(s.batHighScoreNotOut === true),
        unballed ? '' : num(s.batBalls), unballed ? '' : num(s.batFours), unballed ? '' : num(s.batSixes),
        ballsToOvers(num(s.bowlBalls)), num(s.bowlMaidens), num(s.bowlRuns), num(s.bowlWickets), num(s.bowlBestWickets), num(s.bowlBestRuns), num(s.catches),
        s.source === 'import' ? 'import' : 'playhq', p!.hidden === true ? 'yes' : '',
      ]
    })
  return toCsv([...SEASON_TOTALS_COLUMNS, ...SEASON_TOTALS_EXPORT_EXTRA], rows)
}

/** Every stored game, one row per club-side player (opposition players are never exported), in the import layout plus `source` and `hidden`. */
export async function exportMatchRows(payload: Payload): Promise<string> {
  const db = payload.db.drizzle
  const t = matchTables(payload)
  const { players } = payload.db.tables as Record<string, Table>
  const [matches, innings, apps, batting, bowling, people] = await Promise.all([
    db.select().from(t.matches), db.select().from(t.match_innings), db.select().from(t.match_appearances).where(eq(t.match_appearances.isClubSide, true)),
    db.select().from(t.match_batting), db.select().from(t.match_bowling), db.select({ id: players.id, hidden: players.hidden }).from(players),
  ])
  const hidden = new Set((people as { id: number; hidden: boolean | null }[]).filter((p) => p.hidden === true).map((p) => Number(p.id)))
  type R = Record<string, unknown>
  const by = <T extends R>(rows: T[], key: string) => {
    const m = new Map<number, T[]>()
    for (const r of rows) m.set(num(r[key]), [...(m.get(num(r[key])) ?? []), r])
    return m
  }
  const inn = by(innings as R[], 'match'), app = by(apps as R[], 'match')
  const bat = by(batting as R[], 'match'), bowl = by(bowling as R[], 'match')
  const out: CsvCell[][] = []
  const ordered = (matches as R[]).sort((a, b) => String(a.localDate ?? '').localeCompare(String(b.localDate ?? '')) || num(a.id) - num(b.id))
  for (const m of ordered) {
    const mid = num(m.id)
    const ins = (inn.get(mid) ?? []).sort((a, b) => num(a.sequenceNo) - num(b.sequenceNo))
    const club = ins.find((i) => i.isClubBatting === true), opp = ins.find((i) => i.isClubBatting !== true)
    const clubIds = new Map(ins.map((i) => [num(i.id), i.isClubBatting === true]))
    for (const a of (app.get(mid) ?? []).sort((x, y) => String(x.appearanceId).localeCompare(String(y.appearanceId), 'en', { numeric: true }))) {
      const [fk = '', lk = ''] = String(a.nameKey ?? '').split('|')
      const myBat = (bat.get(mid) ?? []).filter((b) => b.appearanceId === a.appearanceId && clubIds.get(num(b.innings)))
      const myBowl = (bowl.get(mid) ?? []).filter((b) => b.appearanceId === a.appearanceId)
      const batted = myBat.some((b) => b.battingStatus !== 'did_not_bat') ? true : myBat.length ? false : null
      const sumOrNull = (key: string) => (myBat.some((b) => b[key] === null || b[key] === undefined) ? null : myBat.reduce((s, b) => s + num(b[key]), 0))
      const lastOut = [...myBat].reverse().find((b) => b.battingStatus === 'out' || b.battingStatus === 'not_out')
      const howOut = lastOut ? (lastOut.battingStatus === 'not_out' ? 'not_out' : String(lastOut.dismissalType ?? '')) : ''
      const balls = myBowl.reduce((s, b) => s + num(b.balls), 0)
      const n = (v: unknown): CsvCell => (v === null || v === undefined ? '' : num(v))
      out.push([
        String(m.localDate ?? ''), String(m.gradeName ?? ''), String(m.clubTeamName ?? ''), String(m.opponentName ?? m.opponentOrgName ?? ''), String(m.roundName ?? ''),
        m.type === 'oneDay' ? 'one_day' : m.type === 'twoDay' ? 'two_day' : '', String(m.result ?? ''),
        n(club?.totalRuns), n(club?.totalWickets), n(opp?.totalRuns), n(opp?.totalWickets),
        titleCase(fk), titleCase(lk), batted === null ? '' : batted ? 'yes' : 'no',
        batted ? sumOrNull('runs') : '', batted ? sumOrNull('balls') : '', batted ? sumOrNull('fours') : '', batted ? sumOrNull('sixes') : '', batted ? howOut : '',
        balls ? ballsToOvers(balls) : '', balls ? myBowl.reduce((s, b) => s + num(b.maidens), 0) : '', balls ? myBowl.reduce((s, b) => s + num(b.runs), 0) : '', balls ? myBowl.reduce((s, b) => s + num(b.wickets), 0) : '',
        m.source === 'import' ? 'import' : 'playhq', a.player != null && hidden.has(num(a.player)) ? 'yes' : '',
      ])
    }
  }
  return toCsv([...MATCH_ROWS_COLUMNS, ...MATCH_ROWS_EXPORT_EXTRA], out)
}

