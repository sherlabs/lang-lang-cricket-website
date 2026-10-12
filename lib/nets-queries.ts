import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, TypedUser, Where } from 'payload'
import { NETS, type NetState } from '@/lib/nets/constants'
import { guestKey, playerKey, sanitiseGuestName } from '@/lib/nets/guest'
import { addLatecomer, buildRotation, parsePlan, removeFromPlan, roundCount, type PlanPlayer, type RotationPlan } from '@/lib/nets/rotation'
import { validateSession, type SessionInput } from '@/lib/nets/session'
import type { NetSnapshot } from '@/lib/nets/snapshot'
import { netAttendanceSummary, type NetCardSummary } from '@/lib/nets/summary'
import { nextRoundWrite, pauseWrite, resumeWrite, startWrite, timerView, type TimerInput, type TimerWrite } from '@/lib/nets/timer'
import { clubToday } from '@/lib/selection-fixtures'
import { currentSquads, idOf, loadPlayers, membersBySquad, toPlayerLite } from '@/lib/selection/store'
import { getPayloadClient } from '@/lib/payload/client'
import { assertSelection } from '@/lib/selector-role'
import { isStaffUser } from '@/payload/access'

/**
 * Net sessions for the selector area (wave B spec 4): sessions, check-in, the rotation and the timer. The reviewed place where
 * these collections are written with `overrideAccess: true`; every exported function re-checks the caller's role first and derives
 * `createdBy` / `checkedInBy` from the user. Attendance means "turned up", never a rating. Nothing here is read by a public page.
 */
const CTX = { disableRevalidate: true } as const
const WRONG = 'Something went wrong. Please try again.'
const STALE = 'Someone else just changed this session. The latest is shown, please try again.'

type SessionRow = {
  id: number
  title: string
  date: string
  startTime?: string | null
  nets: number
  minutesPerTurn: number
  groupSize: number
  state: NetState
  round?: number | null
  roundStartedAt?: string | null
  pausedAt?: string | null
  revision?: number | null
  rotationPlan?: unknown
  finishedAt?: string | null
  notes?: string | null
  createdBy?: unknown
}
type AttendanceRow = { id: number; session: unknown; playerKey: string; player?: unknown; guestName?: string | null; checkedInAt?: string | null }

const ms = (v: string | null | undefined): number | null => (v ? new Date(v).getTime() : null)
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v != null && v !== '' ? Number(v) : fallback)

async function loadSession(payload: Payload, id: number): Promise<SessionRow | null> {
  if (!Number.isInteger(id) || id < 1) return null
  try {
    return (await payload.findByID({ collection: 'net-sessions', id, depth: 0, overrideAccess: true })) as unknown as SessionRow
  } catch {
    return null
  }
}

const attendanceOf = async (payload: Payload, sessionId: number): Promise<AttendanceRow[]> =>
  (await payload.find({ collection: 'net-attendance', where: { session: { equals: sessionId } }, limit: 500, pagination: false, depth: 0, sort: 'checkedInAt', overrideAccess: true })).docs as unknown as AttendanceRow[]

const planOf = (row: SessionRow): RotationPlan | null => parsePlan(row.rotationPlan)

const timerInput = (row: SessionRow, plan: RotationPlan | null): TimerInput => ({
  state: row.state,
  round: num(row.round, 0),
  roundStartedAt: ms(row.roundStartedAt),
  pausedAt: ms(row.pausedAt),
  minutes: row.minutesPerTurn,
  rounds: plan ? roundCount(plan) : 0,
})

function snapshotOf(row: SessionRow, now = Date.now()): NetSnapshot {
  const plan = planOf(row)
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    state: row.state,
    nets: row.nets,
    minutesPerTurn: row.minutesPerTurn,
    groupSize: row.groupSize,
    round: num(row.round, 0),
    roundStartedAt: ms(row.roundStartedAt),
    pausedAt: ms(row.pausedAt),
    revision: num(row.revision, 1),
    rounds: plan ? roundCount(plan) : 0,
    plan,
    serverNow: now,
  }
}

export type SnapshotResult = { ok: true; snapshot: NetSnapshot } | { ok: false; error: string }
export type ActionResult = { ok: true } | { ok: false; error: string }

/** The current round, for a session being edited live (-1 before the start). */
const currentRoundOf = (row: SessionRow, plan: RotationPlan | null, now: number): number => (row.state === 'planned' ? -1 : timerView(timerInput(row, plan), now).round)

// ---------------------------------------------------------------- sessions

export type SessionListRow = { id: number; title: string; date: string; startTime: string | null; state: NetState; turnedUp: number; held: boolean }
export type SessionList = { today: string; upcoming: SessionListRow[]; past: SessionListRow[] }

export async function listSessions(user: TypedUser): Promise<SessionList> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const today = clubToday()
  const rows = (await payload.find({ collection: 'net-sessions', limit: 80, pagination: false, depth: 0, sort: '-date', overrideAccess: true })).docs as unknown as SessionRow[]
  const counts = new Map<number, number>()
  if (rows.length) {
    const att = (await payload.find({ collection: 'net-attendance', where: { session: { in: rows.map((r) => r.id) } }, select: { session: true }, limit: 5000, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as { session: unknown }[]
    for (const a of att) {
      const sid = idOf(a.session)
      if (sid != null) counts.set(sid, (counts.get(sid) ?? 0) + 1)
    }
  }
  const view = (r: SessionRow): SessionListRow => ({ id: r.id, title: r.title, date: r.date, startTime: r.startTime ?? null, state: r.state, turnedUp: counts.get(r.id) ?? 0, held: r.state !== 'planned' || (counts.get(r.id) ?? 0) > 0 })
  const upcoming = rows.filter((r) => r.state !== 'finished' && r.date >= today).map(view).sort((a, b) => (a.date < b.date ? -1 : 1))
  const past = rows.filter((r) => !(r.state !== 'finished' && r.date >= today)).map(view)
  return { today, upcoming, past }
}

export async function createSession(user: TypedUser, input: SessionInput): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  assertSelection(user)
  const checked = validateSession(input)
  if (!checked.ok) return checked
  const payload = await getPayloadClient()
  const doc = await payload.create({ collection: 'net-sessions', data: { ...checked.value, state: 'planned', round: 0, revision: 1, createdBy: user.id } as never, overrideAccess: true, context: CTX })
  return { ok: true, id: doc.id }
}

/** Dates and numbers can change only before the first start; after that the rotation was built on them. */
export async function updateSession(user: TypedUser, id: number, input: SessionInput): Promise<ActionResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, id)
  if (!row) return { ok: false, error: WRONG }
  if (row.state !== 'planned') return { ok: false, error: 'A session that has started cannot be edited.' }
  const checked = validateSession(input)
  if (!checked.ok) return checked
  // The nets, minutes or group size may have changed, so the rotation built on the old values is dropped.
  await payload.update({ collection: 'net-sessions', id, data: { ...checked.value, rotationPlan: null, revision: num(row.revision, 1) + 1 } as never, overrideAccess: true, context: CTX })
  return { ok: true }
}

/** A selector deletes only a session they made that has not started; the committee (admin or editor) can delete any planned one. */
export async function deleteSession(user: TypedUser, id: number): Promise<ActionResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, id)
  if (!row) return { ok: false, error: WRONG }
  if (row.state !== 'planned') return { ok: false, error: 'Only a session that has not started can be deleted.' }
  if (!isStaffUser(user) && idOf(row.createdBy) !== user.id) return { ok: false, error: 'You can delete only sessions you made.' }
  await payload.delete({ collection: 'net-attendance', where: { session: { equals: id } }, overrideAccess: true, context: CTX })
  await payload.delete({ collection: 'net-sessions', id, overrideAccess: true, context: CTX })
  return { ok: true }
}

// ---------------------------------------------------------------- check-in

export type Attendee = { key: string; name: string; isGuest: boolean; playerId: number | null; checkedInAt: string | null }
export type RosterPlayer = { id: number; name: string; present: boolean }
export type NetDetail = {
  snapshot: NetSnapshot
  startTime: string | null
  notes: string | null
  /** This season's squad players, present or not (not present = not checked in). */
  squad: RosterPlayer[]
  /** Checked in but not in a squad: other players and guests. */
  others: Attendee[]
  attendees: Attendee[]
  guestsLeft: number
  /** The rotation was built before the latest check-ins or check-outs; build it again before the first start. */
  planStale: boolean
  canDelete: boolean
  finishedAt: string | null
}

export async function getNetDetail(user: TypedUser, id: number): Promise<NetDetail | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, id)
  if (!row) return null
  const att = await attendanceOf(payload, id)
  const playerIds = att.map((a) => idOf(a.player)).filter((n): n is number => n != null)
  const { squads } = await currentSquads(payload)
  const bySquad = await membersBySquad(payload, squads.map((s) => s.id))
  const squadIds = [...new Set([...bySquad.values()].flat())]
  const players = await loadPlayers(payload, [...new Set([...playerIds, ...squadIds])])
  const attendees: Attendee[] = att.map((a) => {
    const pid = idOf(a.player)
    return { key: a.playerKey, name: pid != null ? (players.get(pid)?.name ?? 'A player') : (a.guestName ?? 'Guest'), isGuest: pid == null, playerId: pid, checkedInAt: a.checkedInAt ?? null }
  })
  const present = new Set(playerIds)
  const squad = squadIds.flatMap((pid) => (players.get(pid) ? [{ id: pid, name: players.get(pid)!.name, present: present.has(pid) }] : [])).sort((a, b) => a.name.localeCompare(b.name))
  const squadSet = new Set(squadIds)
  const plan = planOf(row)
  const planKeys = new Set((plan?.groups ?? []).flatMap((g) => g.players.map((p) => p.key)))
  const attKeys = new Set(att.map((a) => a.playerKey))
  const planStale = row.state === 'planned' && plan !== null && (planKeys.size !== attKeys.size || [...attKeys].some((k) => !planKeys.has(k)))
  return {
    snapshot: snapshotOf(row),
    startTime: row.startTime ?? null,
    notes: row.notes ?? null,
    squad,
    others: attendees.filter((a) => a.isGuest || (a.playerId != null && !squadSet.has(a.playerId))),
    attendees,
    guestsLeft: Math.max(0, NETS.guestsPerSession - attendees.filter((a) => a.isGuest).length),
    planStale,
    canDelete: row.state === 'planned' && (isStaffUser(user) || idOf(row.createdBy) === user.id),
    finishedAt: row.finishedAt ?? null,
  }
}

/** The plan follows a check-in or check-out only once the session has started (before that the rotation is built again). */
async function syncPlan(payload: Payload, sessionId: number, change: { add?: PlanPlayer; removeKey?: string }): Promise<void> {
  // The write is guarded by the revision, so a timer action that lands in between makes it re-read and try again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await loadSession(payload, sessionId)
    if (!row || (row.state !== 'running' && row.state !== 'paused')) return
    const plan = planOf(row)
    if (!plan) return
    const cur = currentRoundOf(row, plan, Date.now())
    const next = change.add ? addLatecomer(plan, change.add, cur) : change.removeKey ? removeFromPlan(plan, change.removeKey, cur) : plan
    if (next === plan || JSON.stringify(next) === JSON.stringify(plan)) return
    if ((await write(payload, row, { rotationPlan: next })).ok) return
  }
}

async function insertAttendance(payload: Payload, user: TypedUser, sessionId: number, data: { playerKey: string; player?: number; guestName?: string }): Promise<void> {
  try {
    await payload.create({ collection: 'net-attendance', data: { session: sessionId, ...data, checkedInAt: new Date().toISOString(), checkedInBy: user.id } as never, overrideAccess: true, context: CTX })
  } catch (err) {
    // Two taps, or two selectors, checking in the same person: the unique (session, playerKey) row already exists, which is the goal.
    // Payload reports the unique index as a validation error, so the check is "is the row there now?", not the error text.
    const there = await payload.count({ collection: 'net-attendance', where: { and: [{ session: { equals: sessionId } }, { playerKey: { equals: data.playerKey } }] }, overrideAccess: true })
    if (there.totalDocs === 0) throw err
  }
}

export async function checkIn(user: TypedUser, sessionId: number, playerId: number): Promise<ActionResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, sessionId)
  const player = Number.isInteger(playerId) ? (await loadPlayers(payload, [playerId])).get(playerId) : undefined
  if (!row || !player) return { ok: false, error: WRONG }
  await insertAttendance(payload, user, sessionId, { playerKey: playerKey(playerId), player: playerId })
  await syncPlan(payload, sessionId, { add: { key: playerKey(playerId), name: player.name } })
  return { ok: true }
}

/** Removes a check-in, by key (`player:<id>` or `guest:<name>`), so guests can be removed too. */
export async function checkOut(user: TypedUser, sessionId: number, key: string): Promise<ActionResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, sessionId)
  if (!row || !/^(player:\d{1,9}|guest:.{1,120})$/.test(key)) return { ok: false, error: WRONG }
  await payload.delete({ collection: 'net-attendance', where: { and: [{ session: { equals: sessionId } }, { playerKey: { equals: key } }] }, overrideAccess: true, context: CTX })
  await syncPlan(payload, sessionId, { removeKey: key })
  return { ok: true }
}

export async function addGuest(user: TypedUser, sessionId: number, rawName: unknown): Promise<ActionResult> {
  assertSelection(user)
  const name = sanitiseGuestName(rawName)
  if (!name) return { ok: false, error: 'Type the guest’s name.' }
  const payload = await getPayloadClient()
  const row = await loadSession(payload, sessionId)
  if (!row) return { ok: false, error: WRONG }
  const key = guestKey(name)
  const att = await attendanceOf(payload, sessionId)
  if (att.some((a) => a.playerKey === key)) return { ok: true }
  if (att.filter((a) => a.player == null).length >= NETS.guestsPerSession) return { ok: false, error: `A session can have up to ${NETS.guestsPerSession} guests.` }
  await insertAttendance(payload, user, sessionId, { playerKey: key, guestName: name })
  await syncPlan(payload, sessionId, { add: { key, name } })
  return { ok: true }
}

export type FoundPlayer = { id: number; name: string }

/** Anyone on the club list, for "search for someone else" in the check-in. Capped at 20. */
export async function searchPlayers(user: TypedUser, query: string): Promise<FoundPlayer[]> {
  assertSelection(user)
  const q = query.trim().toLowerCase().slice(0, 60)
  if (q.length < 2) return []
  const payload = await getPayloadClient()
  const where: Where = { or: [{ firstName: { like: q } }, { lastName: { like: q } }, { displayName: { like: q } }] }
  const res = await payload.find({ collection: 'players', where, limit: 20, pagination: false, depth: 0, joins: false, sort: 'lastName', select: { slug: true, firstName: true, lastName: true, preferredName: true, displayName: true, hidden: true }, overrideAccess: true })
  return res.docs.map((p) => toPlayerLite(p as never)).map((p) => ({ id: p.id, name: p.name }))
}

// ---------------------------------------------------------------- rotation and timer

/** Builds (or rebuilds) the rotation from everyone checked in, in check-in order. Only before the first start. */
export async function buildSessionRotation(user: TypedUser, id: number): Promise<SnapshotResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, id)
  if (!row) return { ok: false, error: WRONG }
  if (row.state !== 'planned') return { ok: false, error: 'The rotation can be built again only before the session starts.' }
  const att = await attendanceOf(payload, id)
  if (!att.length) return { ok: false, error: 'Check some players in first.' }
  const players = await loadPlayers(payload, att.map((a) => idOf(a.player)).filter((n): n is number => n != null))
  const list: PlanPlayer[] = att.map((a) => {
    const pid = idOf(a.player)
    return { key: a.playerKey, name: pid != null ? (players.get(pid)?.name ?? 'A player') : (a.guestName ?? 'Guest') }
  })
  const plan = buildRotation({ players: list, nets: row.nets, groupSize: row.groupSize })
  return write(payload, row, { rotationPlan: plan })
}

/** Column and cast for each field the timer and the plan can write, so the whole change is one SQL statement. */
const WRITABLE: Record<string, { col: string; cast?: string }> = {
  state: { col: 'state', cast: '"payload"."enum_net_sessions_state"' },
  round: { col: 'round' },
  roundStartedAt: { col: 'round_started_at', cast: 'timestamptz' },
  pausedAt: { col: 'paused_at', cast: 'timestamptz' },
  finishedAt: { col: 'finished_at', cast: 'timestamptz' },
  rotationPlan: { col: 'rotation_plan', cast: 'jsonb' },
}

/**
 * One guarded write: a single `UPDATE ... WHERE revision = <the one we read>` changes the fields and moves `revision` forward in the
 * same statement, so of two selectors acting on the same state exactly one wins and the other is told to look again (no lost
 * update, no half-written state for a reader).
 */
async function write(payload: Payload, row: SessionRow, patch: Record<string, unknown>): Promise<SnapshotResult> {
  const rev = num(row.revision, 1)
  const sets = Object.entries(patch).map(([key, value]) => {
    const w = WRITABLE[key]
    if (!w) throw new Error(`net-sessions: ${key} is not writable here`)
    const v = value === null || value === undefined ? sql`NULL` : w.cast === 'jsonb' ? sql`${JSON.stringify(value)}::jsonb` : w.cast ? sql`${value}::${sql.raw(w.cast)}` : sql`${value}`
    return sql`${sql.raw(`"${w.col}"`)} = ${v}`
  })
  const res = await payload.db.drizzle.execute(sql`UPDATE "payload"."net_sessions" SET ${sql.join([...sets, sql`"revision" = ${rev + 1}`, sql`"updated_at" = now()`], sql`, `)} WHERE "id" = ${row.id} AND "revision" = ${rev} RETURNING "id"`)
  if (!res.rows.length) return { ok: false, error: STALE }
  const doc = await loadSession(payload, row.id)
  return doc ? { ok: true, snapshot: snapshotOf(doc) } : { ok: false, error: WRONG }
}

const timerPatch = (w: TimerWrite) => ({ state: w.state, round: w.round, roundStartedAt: w.roundStartedAt == null ? null : new Date(w.roundStartedAt).toISOString(), pausedAt: w.pausedAt == null ? null : new Date(w.pausedAt).toISOString() })

async function transition(user: TypedUser, id: number, step: (row: SessionRow, plan: RotationPlan | null, now: number) => Record<string, unknown> | string): Promise<SnapshotResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await loadSession(payload, id)
  if (!row) return { ok: false, error: WRONG }
  const out = step(row, planOf(row), Date.now())
  if (typeof out === 'string') return { ok: false, error: out }
  return write(payload, row, out)
}

export async function startSession(user: TypedUser, id: number): Promise<SnapshotResult> {
  assertSelection(user)
  return transition(user, id, (row, plan, now) => {
    if (row.state !== 'planned') return 'This session has already started.'
    if (!plan || !plan.groups.length) return 'Build the rotation first.'
    return timerPatch(startWrite(now))
  })
}

export async function pauseSession(user: TypedUser, id: number): Promise<SnapshotResult> {
  assertSelection(user)
  return transition(user, id, (row, plan, now) => (row.state !== 'running' ? 'The timer is not running.' : timerPatch(pauseWrite(timerInput(row, plan), now))))
}

export async function resumeSession(user: TypedUser, id: number): Promise<SnapshotResult> {
  assertSelection(user)
  return transition(user, id, (row, plan, now) => (row.state !== 'paused' ? 'The timer is not paused.' : timerPatch(resumeWrite(timerInput(row, plan), now))))
}

export async function nextRound(user: TypedUser, id: number): Promise<SnapshotResult> {
  assertSelection(user)
  return transition(user, id, (row, plan, now) => {
    if (row.state !== 'running' && row.state !== 'paused') return 'The session is not running.'
    const w = nextRoundWrite(timerInput(row, plan), now)
    return w ? timerPatch(w) : 'That was the last round. Finish the session.'
  })
}

export async function finishSession(user: TypedUser, id: number): Promise<SnapshotResult> {
  assertSelection(user)
  return transition(user, id, (row, _plan, now) => (row.state === 'finished' ? 'This session is already finished.' : { state: 'finished', finishedAt: new Date(now).toISOString(), pausedAt: null }))
}

/** The state route's read: the same snapshot, nothing else. */
export async function getNetSnapshot(user: TypedUser, id: number): Promise<NetSnapshot | null> {
  assertSelection(user)
  const row = await loadSession(await getPayloadClient(), id)
  return row ? snapshotOf(row) : null
}

// ---------------------------------------------------------------- the card and the Overview

/** The player card's "Nets" panel: turned up at N of M sessions in the window. Selector-only; never public. */
export async function playerNetsSummary(user: TypedUser, playerId: number): Promise<NetCardSummary> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const today = clubToday()
  const from = new Date(`${today}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - NETS.cardWindowWeeks * 7)
  const sessions = (await payload.find({ collection: 'net-sessions', where: { date: { greater_than_equal: from.toISOString().slice(0, 10) } }, limit: 200, pagination: false, depth: 0, sort: '-date', overrideAccess: true })).docs as unknown as SessionRow[]
  const att = sessions.length
    ? ((await payload.find({ collection: 'net-attendance', where: { session: { in: sessions.map((s) => s.id) } }, select: { session: true, player: true }, limit: 5000, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as { session: unknown; player?: unknown }[])
    : []
  const held = new Set(att.map((a) => idOf(a.session)))
  const mine = new Set(att.filter((a) => idOf(a.player) === playerId).map((a) => idOf(a.session)!))
  return netAttendanceSummary({
    sessions: sessions.map((s) => ({ id: s.id, localDate: s.date, held: s.state !== 'planned' || held.has(s.id) })),
    attendedIds: mine,
    today,
  })
}

export type NetsTonight = { id: number; title: string; startTime: string | null; state: NetState; turnedUp: number }

/** For the Overview: a session dated today that is not finished. */
export async function netsTonight(user: TypedUser): Promise<NetsTonight | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'net-sessions', where: { and: [{ date: { equals: clubToday() } }, { state: { not_equals: 'finished' } }] }, limit: 1, pagination: false, depth: 0, sort: 'createdAt', overrideAccess: true })
  const row = res.docs[0] as unknown as SessionRow | undefined
  if (!row) return null
  const turnedUp = (await payload.count({ collection: 'net-attendance', where: { session: { equals: row.id } }, overrideAccess: true })).totalDocs
  return { id: row.id, title: row.title, startTime: row.startTime ?? null, state: row.state, turnedUp }
}
