import 'server-only'
import type { Payload } from 'payload'
import { NO_SEASON_LABEL, SCOUTING } from '@/config/site'
import { normaliseClubName, oppositionKey, oppositionLabel } from '@/lib/stats/match/opposition-key'
import type { OpponentOption } from '@/lib/scouting/resolve-opponent'
import { newestFirst, type ScoutBat, type ScoutBatStatus, type ScoutBowl, type ScoutInnings, type ScoutMatch, type ScoutPerson, type ScoutResult } from '@/lib/scouting/types'

/**
 * The only reader of opposition people (wave E spec 3.2). It is for the selector area alone: it states no visibility filter on club
 * players because it never loads one (`isClubSide: false` rows only), and its output is never placed in `unstable_cache` or any tag shared
 * with a public page, because it holds opposition players' names. `lib/selector-scouting-queries.ts` is its only caller and starts with
 * `assertSelection`. Local API with `overrideAccess: true`, `depth: 0`, one batched query per collection (never one per match).
 */

export type OpponentSummary = OpponentOption & { played: number; lastDate: string | null }

const RESULTS = new Set(['won', 'lost', 'draw', 'tie', 'no_result', 'abandoned'])
const STATUSES = new Set(['out', 'not_out', 'did_not_bat', 'unknown'])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
/** A stored string "null" counts as missing, as in lib/stats/match/facts.ts. */
const seasonOf = (v: unknown): string => { const n = str(v); return n && n !== 'null' ? n : NO_SEASON_LABEL }
const numOrNull = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

type OppRef = { id: number; localDate: string | null; opponentOrgId: string | null; opponentOrgName: string | null; opponentName: string | null }

/** Every FINAL game's opposition fields, matches table only. */
async function loadOppRefs(payload: Payload): Promise<OppRef[]> {
  const { docs } = await payload.find({
    collection: 'matches', where: { status: { equals: 'FINAL' } }, pagination: false, depth: 0, sort: 'id', overrideAccess: true,
    select: { localDate: true, opponentOrgId: true, opponentOrgName: true, opponentName: true },
  })
  return docs.map((d) => ({ id: d.id, localDate: str(d.localDate), opponentOrgId: str(d.opponentOrgId), opponentOrgName: str(d.opponentOrgName), opponentName: str(d.opponentName) }))
}

/** The opponent list: one aggregate over `matches` only, no appearance, batting or bowling rows. */
export async function listOpponents(payload: Payload): Promise<OpponentSummary[]> {
  const refs = await loadOppRefs(payload)
  const by = new Map<string, OpponentSummary & { labelDate: string }>()
  for (const r of [...refs].sort((a, b) => (a.localDate ?? '').localeCompare(b.localDate ?? '') || a.id - b.id)) {
    const key = oppositionKey(r)
    const label = oppositionLabel(r)
    const names = [r.opponentOrgName, r.opponentName].map((n) => normaliseClubName(n)).filter(Boolean)
    const cur = by.get(key)
    if (!cur) by.set(key, { key, label, names: [...new Set(names)], played: 1, lastDate: r.localDate, labelDate: r.localDate ?? '' })
    else {
      cur.played++
      cur.names = [...new Set([...cur.names, ...names])]
      // The label follows the most recent meeting.
      if ((r.localDate ?? '') >= cur.labelDate) { cur.label = label; cur.labelDate = r.localDate ?? '' }
      if (r.localDate && (cur.lastDate === null || r.localDate > cur.lastDate)) cur.lastDate = r.localDate
    }
  }
  return [...by.values()].map((o) => ({ key: o.key, label: o.label, names: o.names, played: o.played, lastDate: o.lastDate })).sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
}

export type ScoutingLoad = { label: string; total: number; capped: boolean; matches: ScoutMatch[] }

/** The newest `SCOUTING.maxMatches` FINAL games against one opposition, with that opposition's people. Null when the key matches nothing. */
export async function loadScoutingMatches(payload: Payload, key: string): Promise<ScoutingLoad | null> {
  const refs = (await loadOppRefs(payload)).filter((r) => oppositionKey(r) === key)
  if (refs.length === 0) return null
  const newest = [...refs].sort((a, b) => (b.localDate ?? '').localeCompare(a.localDate ?? '') || b.id - a.id)
  const label = oppositionLabel(newest[0])
  const chosen = newest.slice(0, SCOUTING.maxMatches)
  const ids = chosen.map((r) => r.id)

  const [matchDocs, inningsDocs, people, batting, bowling] = await Promise.all([
    payload.find({
      collection: 'matches', where: { id: { in: ids } }, pagination: false, depth: 0, overrideAccess: true,
      select: { gameId: true, localDate: true, seasonName: true, seasonStartYear: true, gradeName: true, venueName: true, isHome: true, result: true, byForfeit: true, source: true, tossChoice: true, clubWonToss: true },
    }),
    payload.find({
      collection: 'match-innings', where: { match: { in: ids } }, pagination: false, depth: 0, overrideAccess: true, sort: 'sequenceNo',
      select: { match: true, sequenceNo: true, isClubBatting: true, played: true, totalRuns: true, totalWickets: true, allOut: true, declared: true, hasFallOfWickets: true },
    }),
    // Opposition people only: a club-side row is never read.
    payload.find({
      collection: 'match-appearances', where: { and: [{ match: { in: ids } }, { isClubSide: { equals: false } }] }, pagination: false, depth: 0, overrideAccess: true,
      select: { match: true, appearanceId: true, nameKey: true, displayName: true },
    }),
    payload.find({
      collection: 'match-batting', where: { match: { in: ids } }, pagination: false, depth: 0, overrideAccess: true,
      select: { match: true, innings: true, appearanceId: true, position: true, battingStatus: true, runs: true, balls: true, fowWicket: true, fowRuns: true },
    }),
    payload.find({
      collection: 'match-bowling', where: { match: { in: ids } }, pagination: false, depth: 0, overrideAccess: true,
      select: { match: true, innings: true, appearanceId: true, order: true, balls: true, runs: true, wickets: true },
    }),
  ])

  const seqOfInnings = new Map<number, number>(inningsDocs.docs.map((i) => [Number(i.id), Number(i.sequenceNo)]))
  const idOf = (v: unknown) => (typeof v === 'object' && v !== null ? Number((v as { id: unknown }).id) : Number(v))
  const peopleByMatch = new Map<number, ScoutPerson[]>()
  const oppAppearance = new Set<string>()
  for (const p of people.docs) {
    const m = idOf(p.match)
    const list = peopleByMatch.get(m) ?? []
    // PlayHQ gives no stable opposition player id, and the store keeps `nameKey` for the club side only, so identity is the normalised name.
    list.push({ appearanceId: String(p.appearanceId), nameKey: str(p.nameKey) ?? (normaliseClubName(str(p.displayName)) || null), displayName: str(p.displayName) })
    peopleByMatch.set(m, list)
    oppAppearance.add(`${m}:${p.appearanceId}`)
  }
  const group = <T,>(rows: { match: unknown }[], map: (r: never) => T | null): Map<number, T[]> => {
    const out = new Map<number, T[]>()
    for (const r of rows) {
      const v = map(r as never)
      if (v === null) continue
      const m = idOf(r.match)
      out.set(m, [...(out.get(m) ?? []), v])
    }
    return out
  }
  const inningsBy = group<ScoutInnings>(inningsDocs.docs, (i: (typeof inningsDocs.docs)[number]) => ({
    seq: Number(i.sequenceNo), clubBatting: i.isClubBatting === true, played: i.played === true, runs: numOrNull(i.totalRuns), wickets: numOrNull(i.totalWickets),
    allOut: i.allOut === true, declared: i.declared === true, hasFow: i.hasFallOfWickets === true,
  }))
  const batBy = group<ScoutBat>(batting.docs, (b: (typeof batting.docs)[number]) => {
    if (!oppAppearance.has(`${idOf(b.match)}:${b.appearanceId}`)) return null
    const st = str(b.battingStatus)
    return {
      inningsSeq: seqOfInnings.get(idOf(b.innings)) ?? -1, appearanceId: String(b.appearanceId), position: Number(b.position ?? 0),
      status: st && STATUSES.has(st) ? (st as ScoutBatStatus) : null, runs: Number(b.runs ?? 0), balls: numOrNull(b.balls), fowWicket: numOrNull(b.fowWicket), fowRuns: numOrNull(b.fowRuns),
    }
  })
  const bowlBy = group<ScoutBowl>(bowling.docs, (w: (typeof bowling.docs)[number]) => {
    if (!oppAppearance.has(`${idOf(w.match)}:${w.appearanceId}`)) return null
    return { inningsSeq: seqOfInnings.get(idOf(w.innings)) ?? -1, appearanceId: String(w.appearanceId), order: Number(w.order ?? 0), balls: Number(w.balls ?? 0), runs: Number(w.runs ?? 0), wickets: Number(w.wickets ?? 0) }
  })

  const matches = matchDocs.docs.map<ScoutMatch>((m) => {
    const result = str(m.result)
    return {
      id: m.id, gameId: String(m.gameId), date: str(m.localDate), season: seasonOf(m.seasonName), seasonYear: numOrNull(m.seasonStartYear),
      grade: str(m.gradeName), venue: str(m.venueName), isHome: m.isHome === true, result: result && RESULTS.has(result) ? (result as ScoutResult) : null,
      forfeit: m.byForfeit === true, source: m.source === 'import' ? 'import' : 'playhq', tossChoice: m.tossChoice === 'bat' || m.tossChoice === 'bowl' ? m.tossChoice : null,
      clubWonToss: typeof m.clubWonToss === 'boolean' ? m.clubWonToss : null,
      innings: inningsBy.get(m.id) ?? [], people: peopleByMatch.get(m.id) ?? [], bat: batBy.get(m.id) ?? [], bowl: bowlBy.get(m.id) ?? [],
    }
  })
  return { label, total: refs.length, capped: refs.length > chosen.length, matches: matches.sort(newestFirst) }
}
