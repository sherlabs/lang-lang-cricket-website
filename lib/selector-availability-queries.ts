import type { Payload, TypedUser, Where } from 'payload'
import { globalKey } from '@/lib/availability-throttle'
import { linkToken } from '@/lib/availability-link'
import { isStatus, tally, type Answer, type AvailabilityStatus, type Tally } from '@/lib/availability'
import { getPayloadClient } from '@/lib/payload/client'
import { clubToday, refreshSelectionFixtures, type RefreshResult } from '@/lib/selection-fixtures'
import { profilesForPlayers, type ProfileView } from '@/lib/selector-profile-queries'
import { assertSelection } from '@/lib/selector-role'
import { currentSquads, getSelectionSettings, idOf, loadPlayers, membersBySquad, upcomingFixtures, type FixtureRow, type SelectionSettingsValues } from '@/lib/selection/store'
import { hit, isLocked } from '@/lib/throttle'
import { upsertAnswer } from '@/lib/availability-public'

/**
 * Selector-side availability: the board (one fixture at a time on a phone, a players-by-fixtures matrix on a wide screen), setting
 * an answer for a player (phone calls), the link (show, switch off, rotate) and refreshing the fixtures. The reviewed place where the
 * selector area reads and writes availability with `overrideAccess: true`; every function re-checks the caller's role first.
 */
export type BoardPlayer = { id: number; slug: string; name: string; hidden: boolean; phone: string | null; role: ProfileView['role']; answers: Record<number, Answer>; notes: Record<number, string> }
export type AvailabilityBoard = {
  grades: { gradeId: string; gradeName: string; fixtureCount: number }[]
  gradeId: string | null
  fixtures: (FixtureRow & { tally: Tally })[]
  players: BoardPlayer[]
  /** Players of one name who share a PIN and need a manual one. */
  pinClashes: string[]
  /** Someone has been guessing PINs on the link (the whole-link pause is active). */
  guessing: boolean
  linkEnabled: boolean
}

export async function loadAvailabilityBoard(user: TypedUser, opts: { gradeId?: string | null } = {}): Promise<AvailabilityBoard> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const settings = await getSelectionSettings(payload)
  const { squads } = await currentSquads(payload)
  const all = await upcomingFixtures(payload, clubToday())
  const gradeIds = [...new Set(all.map((f) => f.gradeId))]
  const grades = gradeIds.map((gradeId) => ({ gradeId, gradeName: all.find((f) => f.gradeId === gradeId)!.gradeName, fixtureCount: all.filter((f) => f.gradeId === gradeId).length })).sort((a, b) => a.gradeName.localeCompare(b.gradeName))
  const gradeId = (opts.gradeId && gradeIds.includes(opts.gradeId) ? opts.gradeId : grades[0]?.gradeId) ?? null
  const fixtures = gradeId ? all.filter((f) => f.gradeId === gradeId).slice(0, 8) : []
  const squad = squads.find((s) => s.gradeId === gradeId)
  const memberIds = squad ? ((await membersBySquad(payload, [squad.id])).get(squad.id) ?? []) : []
  const [players, profiles] = await Promise.all([loadPlayers(payload, memberIds), profilesForPlayers(user, memberIds)])
  const rows = fixtures.length && memberIds.length
    ? (await payload.find({ collection: 'availability', where: { and: [{ player: { in: memberIds } }, { fixture: { in: fixtures.map((f) => f.id) } }] } as Where, limit: memberIds.length * fixtures.length + 1, pagination: false, depth: 0, overrideAccess: true })).docs
    : []
  const answers = new Map<string, { status: AvailabilityStatus; note: string }>()
  for (const r of rows) if (isStatus(r.status)) answers.set(`${idOf(r.player)}:${idOf(r.fixture)}`, { status: r.status, note: r.note ?? '' })
  const board: BoardPlayer[] = memberIds
    .map((id) => players.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      hidden: p.hidden,
      phone: profiles.get(p.id)?.phone ?? null,
      role: profiles.get(p.id)?.role ?? null,
      answers: Object.fromEntries(fixtures.map((f) => [f.id, answers.get(`${p.id}:${f.id}`)?.status ?? 'none'])) as Record<number, Answer>,
      notes: Object.fromEntries(fixtures.map((f) => [f.id, answers.get(`${p.id}:${f.id}`)?.note ?? ''])),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    grades,
    gradeId,
    fixtures: fixtures.map((f) => ({ ...f, tally: tally(board.map((p) => p.answers[f.id])) })),
    players: board,
    pinClashes: await pinClashNames(payload),
    guessing: !(await isLocked(payload, globalKey(settings.linkVersion))).allowed,
    linkEnabled: settings.linkEnabled,
  }
}

async function pinClashNames(payload: Payload): Promise<string[]> {
  const flagged = await payload.find({ collection: 'player-selection-profiles', where: { needsManualPin: { equals: true } }, limit: 50, pagination: false, depth: 0, select: { player: true }, overrideAccess: true })
  const ids = flagged.docs.map((d) => idOf(d.player)).filter((n): n is number => n != null)
  return [...(await loadPlayers(payload, ids)).values()].map((p) => p.name).sort()
}

export type SetAnswerResult = { ok: true } | { ok: false; error: string }

/** A selector records or clears one answer for a player. The row records them (`source: selector`, `setBy`) from `user`, never from input. */
export async function setAnswerFor(user: TypedUser, playerId: number, fixtureId: number, status: unknown): Promise<SetAnswerResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  if (!Number.isInteger(playerId) || !Number.isInteger(fixtureId)) return { ok: false, error: 'Something went wrong.' }
  const fixture = await payload.findByID({ collection: 'selection-fixtures', id: fixtureId, depth: 0, overrideAccess: true }).catch(() => null)
  const player = (await loadPlayers(payload, [playerId])).get(playerId)
  if (!fixture || !player) return { ok: false, error: 'That player or game was not found.' }
  if (status === 'none') {
    await payload.delete({ collection: 'availability', where: { and: [{ player: { equals: playerId } }, { fixture: { equals: fixtureId } }] }, overrideAccess: true, context: { disableRevalidate: true } })
    return { ok: true }
  }
  if (!isStatus(status)) return { ok: false, error: 'Something went wrong.' }
  await upsertAnswer(payload, playerId, fixtureId, status, '', user)
  return { ok: true }
}

export type LinkInfo = { enabled: boolean; version: number; token: string; path: string; guessing: boolean }

export async function getLinkInfo(user: TypedUser): Promise<LinkInfo> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const s = await getSelectionSettings(payload)
  const token = linkToken(s.linkVersion)
  return { enabled: s.linkEnabled, version: s.linkVersion, token, path: `/availability/${token}`, guessing: !(await isLocked(payload, globalKey(s.linkVersion))).allowed }
}

/** New link: the old one, every remembered phone and every lock stop working at once (all of them carry the version). */
export async function rotateLink(user: TypedUser): Promise<SelectionSettingsValues> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const s = await getSelectionSettings(payload)
  await payload.updateGlobal({ slug: 'selection-settings', data: { linkVersion: s.linkVersion + 1 }, overrideAccess: true, context: { disableRevalidate: true } })
  return getSelectionSettings(payload)
}

export async function setLinkEnabled(user: TypedUser, enabled: boolean): Promise<SelectionSettingsValues> {
  assertSelection(user)
  const payload = await getPayloadClient()
  await payload.updateGlobal({ slug: 'selection-settings', data: { linkEnabled: enabled }, overrideAccess: true, context: { disableRevalidate: true } })
  return getSelectionSettings(payload)
}

export type RefreshOutcome = { ok: true; result: RefreshResult } | { ok: false; error: string }

/** The "Refresh fixtures" button: one press per five minutes per selector. A PlayHQ failure is reported plainly, never thrown into the page. */
export async function refreshFixturesNow(user: TypedUser): Promise<RefreshOutcome> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const gate = await hit(payload, `fixtures:refresh:${user.id}`, { limit: 1, windowMs: 300_000, lockMs: 300_000 })
  if (!gate.allowed) return { ok: false, error: 'The fixtures were refreshed a moment ago. Please wait a few minutes.' }
  try {
    return { ok: true, result: await refreshSelectionFixtures(payload) }
  } catch (err) {
    console.error('[selection-fixtures] manual refresh failed', err instanceof Error ? err.message : err)
    return { ok: false, error: 'PlayHQ could not be reached. Try again later.' }
  }
}
