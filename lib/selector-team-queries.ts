import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type TypedUser, type Where } from 'payload'
import { isStatus, tally, type Answer, type Tally } from '@/lib/availability'
import { getClub } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'
import { revalidatePaths } from '@/payload/hooks/revalidate'
import { announcementBody, announcementKey, announcementTitle } from '@/lib/selection/announce'
import { currentClubDate } from '@/lib/selection/club-date'
import { loadInsights, type PlayerInsight } from '@/lib/selection/insights'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { effectiveRole, type Role, type RoleOrUnknown } from '@/lib/selection/roles'
import { reminderText } from '@/lib/selection/reminder'
import { currentSquads, getSelectionSettings, idOf, loadPlayers, membersBySquad, type FixtureRow, type PlayerLite, type XiRules } from '@/lib/selection/store'
import { TEAMS_TAG } from '@/lib/selection/tags'
import { buildSnapshot, describeDiff, diffSnapshots, isXiSize, normaliseSlots, parseSnapshot, validateGuestName, validateSlots, type Slot, type XiSize } from '@/lib/selection/team-sheet'
import { blockingWarnings, teamWarnings, type Warning, type WarnSlot } from '@/lib/selection/warnings'
import { groupByWeekend, weekendKey } from '@/lib/selection/weekend'
import { linkToken } from '@/lib/availability-link'
import { availabilityPath } from '@/config/site'
import { profilesForPlayers, type ProfileView } from '@/lib/selector-profile-queries'
import { assertSelection } from '@/lib/selector-role'
import { deriveTeamStatus, publishChip, type PublishChip, type TeamStatus } from '@/lib/team-status'
import { readPublishedTeams, type PublicTeam } from '@/lib/teams-queries'

/**
 * Team selection for the selector area (announce-teams spec 5): the weekend board, the builder, saving a team, publishing and
 * withdrawing. The reviewed place where sheets are written with `overrideAccess: true`; every exported function starts by
 * re-checking the caller's role, validates with the pure functions in `lib/selection/`, and derives `updatedBy` and
 * `publishedBy` from `user`. A stale save is refused (revision claimed atomically), and nothing becomes public except through
 * `publishSheets`, which writes the frozen snapshot the public pages read.
 */
const CTX = { disableRevalidate: true } as const

/** `movedAt` is when PlayHQ last changed the game's day, time or venue (not any other change, such as the result). */
type FixtureStamped = FixtureRow & { movedAt?: string | null }
type SheetDoc = {
  id: number
  fixture: unknown
  slots?: { player?: unknown; guestName?: string | null; order: number; isCaptain?: boolean | null; isKeeper?: boolean | null }[] | null
  size?: number | null
  markedReady?: boolean | null
  notes?: string | null
  revision?: number | string | null
  updatedBy?: unknown
  updatedAt?: string | null
  publishedSnapshot?: unknown
  publishedAt?: string | null
  publishCount?: number | null
}

const slotsOf = (doc: SheetDoc | undefined): Slot[] =>
  (doc?.slots ?? []).map((s) => ({ ...(idOf(s.player) != null ? { player: idOf(s.player)! } : {}), ...(s.guestName ? { guestName: s.guestName } : {}), order: Number(s.order), isCaptain: Boolean(s.isCaptain), isKeeper: Boolean(s.isKeeper) })).sort((a, b) => a.order - b.order)
const sizeOf = (doc: SheetDoc | undefined, fallback: XiSize): XiSize => (doc && isXiSize(Number(doc.size)) && doc.size != null ? (Number(doc.size) as XiSize) : fallback)

export type SlotView = {
  key: string
  order: number
  playerId: number | null
  guestName: string | null
  name: string
  slug: string | null
  isCaptain: boolean
  isKeeper: boolean
  hidden: boolean
  missing: boolean
  role: RoleOrUnknown
  batting: string
  bowling: string
  answer: Answer
  /** Grade of another side this player is picked in the same day, if any. */
  alsoPickedIn: string | null
}

export type SheetView = {
  fixture: FixtureRow
  sheetId: number | null
  revision: number
  size: XiSize
  markedReady: boolean
  notes: string
  slots: SlotView[]
  warnings: Warning[]
  status: TeamStatus
  chip: PublishChip
  publishedAt: string | null
  publishCount: number
  /** What differs from the published team (empty unless "Published, changes not published"). */
  changes: string[]
  updatedByName: string | null
  updatedAt: string | null
}

/** Everything needed to judge many sheets at once: players, roles, availability, form and same-day double bookings. */
async function buildViews(payload: Payload, user: TypedUser, fixtures: readonly FixtureStamped[]): Promise<Map<number, SheetView>> {
  const settings = await getSelectionSettings(payload)
  const fixtureIds = fixtures.map((f) => f.id)
  const sheetRows = fixtureIds.length ? ((await payload.find({ collection: 'team-sheets', where: { fixture: { in: fixtureIds } } as Where, limit: 1000, pagination: false, depth: 0, showHiddenFields: true, overrideAccess: true })).docs as unknown as SheetDoc[]) : []
  const sheetByFixture = new Map(sheetRows.map((s) => [idOf(s.fixture)!, s]))

  // Same-day sheets in other grades (and other games on those dates) for the double-booking warning.
  const dates = [...new Set(fixtures.map((f) => f.localDate))]
  const sameDay = dates.length ? ((await payload.find({ collection: 'selection-fixtures', where: { and: [{ localDate: { in: dates } }, { status: { not_equals: 'removed' } }] } as Where, limit: 1000, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as FixtureRow[]) : []
  const sameDayIds = sameDay.map((f) => f.id)
  const daySheets = sameDayIds.length ? ((await payload.find({ collection: 'team-sheets', where: { fixture: { in: sameDayIds } } as Where, limit: 1000, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as SheetDoc[]) : []
  const fixtureById = new Map(sameDay.map((f) => [f.id, f]))
  const pickedOnDay = new Map<string, { fixtureId: number; gradeName: string }[]>() // `${date}:${playerId}`
  for (const s of daySheets) {
    const fx = fixtureById.get(idOf(s.fixture) ?? -1)
    if (!fx) continue
    for (const sl of s.slots ?? []) {
      const pid = idOf(sl.player)
      if (pid != null) pickedOnDay.set(`${fx.localDate}:${pid}`, [...(pickedOnDay.get(`${fx.localDate}:${pid}`) ?? []), { fixtureId: fx.id, gradeName: fx.gradeName }])
    }
  }

  const playerIds = [...new Set(sheetRows.flatMap((s) => slotsOf(s).map((x) => x.player).filter((n): n is number => n != null)))]
  const [players, profiles, insights] = await Promise.all([loadPlayers(payload, playerIds), profilesForPlayers(user, playerIds), loadInsights(payload, playerIds)])
  const answers = new Map<string, Answer>()
  if (playerIds.length && fixtureIds.length) {
    const rows = await payload.find({ collection: 'availability', where: { and: [{ player: { in: playerIds } }, { fixture: { in: fixtureIds } }] } as Where, limit: 20000, pagination: false, depth: 0, overrideAccess: true })
    for (const r of rows.docs) if (isStatus(r.status)) answers.set(`${idOf(r.player)}:${idOf(r.fixture)}`, r.status)
  }
  const updaterIds = [...new Set(sheetRows.map((s) => idOf(s.updatedBy)).filter((n): n is number => n != null))]
  const updaters = new Map<number, string>()
  if (updaterIds.length) {
    const res = await payload.find({ collection: 'users', where: { id: { in: updaterIds } } as Where, limit: updaterIds.length, pagination: false, depth: 0, select: { name: true, email: true }, overrideAccess: true })
    for (const u of res.docs) updaters.set(u.id, (u as { name?: string | null }).name?.trim() || 'A selector')
  }

  const out = new Map<number, SheetView>()
  for (const fx of fixtures) {
    const doc = sheetByFixture.get(fx.id)
    const slots = slotsOf(doc)
    const size = sizeOf(doc, settings.defaultXiSize)
    const snapshot = parseSnapshot(doc?.publishedSnapshot)
    const views: SlotView[] = slots.map((s) => viewSlot(s, fx.id, players, profiles, insights, answers))
    const warnSlots: WarnSlot[] = views.map((v) => ({
      name: v.name,
      kind: v.playerId == null ? 'guest' : 'player',
      role: v.role,
      isCaptain: v.isCaptain,
      isKeeper: v.isKeeper,
      hidden: v.hidden,
      missing: v.missing,
      badGuest: v.playerId == null && !validateGuestName(v.guestName).ok,
      answer: v.answer,
      alsoPickedIn: v.playerId != null ? (pickedOnDay.get(`${fx.localDate}:${v.playerId}`) ?? []).find((o) => o.fixtureId !== fx.id)?.gradeName ?? null : null,
    }))
    warnSlots.forEach((w, i) => {
      views[i].alsoPickedIn = w.alsoPickedIn ?? null
    })
    const moved = Boolean(doc && slots.length && (fx as FixtureStamped).movedAt && doc.updatedAt && new Date((fx as FixtureStamped).movedAt!).getTime() > new Date(doc.updatedAt).getTime())
    const warnings = teamWarnings({ slots: warnSlots, size, fixtureStatus: fx.status, fixtureMovedSinceSave: moved }, settings.xi)
    const markedReady = Boolean(doc?.markedReady)
    const chip = publishChip({ slots, size }, snapshot)
    const nameOf = (s: { playerId?: number; guestName?: string }) => (s.playerId != null ? players.get(s.playerId)?.name ?? 'A player' : s.guestName ?? '')
    out.set(fx.id, {
      fixture: fx,
      sheetId: doc?.id ?? null,
      revision: Number(doc?.revision ?? 0),
      size,
      markedReady,
      notes: doc?.notes ?? '',
      slots: views,
      warnings,
      status: deriveTeamStatus({ slotCount: slots.length, size, markedReady, warnings, slots: warnSlots }),
      chip,
      publishedAt: snapshot ? doc?.publishedAt ?? snapshot.publishedAt : null,
      publishCount: Number(doc?.publishCount ?? 0),
      changes: chip === 'published-changed' && snapshot ? describeDiff(diffSnapshots(snapshot, buildSnapshot({ slots, size, revision: 0 }, '')), nameOf) : [],
      updatedByName: doc ? updaters.get(idOf(doc.updatedBy) ?? -1) ?? null : null,
      updatedAt: doc?.updatedAt ?? null,
    })
  }
  return out
}

function viewSlot(s: Slot, fixtureId: number, players: Map<number, PlayerLite>, profiles: Map<number, ProfileView>, insights: Map<number, PlayerInsight>, answers: Map<string, Answer>): SlotView {
  if (s.player == null) return { key: `g:${s.guestName}`, order: s.order, playerId: null, guestName: s.guestName ?? '', name: s.guestName ?? '', slug: null, isCaptain: s.isCaptain, isKeeper: s.isKeeper, hidden: false, missing: false, role: 'unknown', batting: '', bowling: '', answer: 'none', alsoPickedIn: null }
  const p = players.get(s.player)
  const prof = profiles.get(s.player)
  const ins = insights.get(s.player)
  const suggested: RoleOrUnknown = prof?.canKeep ? 'keeper' : ins?.suggested ?? 'unknown'
  return {
    key: `p:${s.player}`,
    order: s.order,
    playerId: s.player,
    guestName: null,
    name: p?.name ?? 'Removed player',
    slug: p?.slug ?? null,
    isCaptain: s.isCaptain,
    isKeeper: s.isKeeper,
    hidden: Boolean(p?.hidden),
    missing: !p,
    role: effectiveRole((prof?.role ?? null) as Role | null, suggested),
    batting: ins?.batting ?? '',
    bowling: ins?.bowling ?? '',
    answer: answers.get(`${s.player}:${fixtureId}`) ?? 'none',
    alsoPickedIn: null,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The weekend board (all-teams view and the match-day overview)

export type BoardFixture = {
  fixture: FixtureRow
  view: SheetView
  availability: { tally: Tally; noReply: { id: number; name: string; slug: string; phone: string | null }[]; keeperAvailable: boolean; squadSize: number }
  reminder: string
}
export type WeekendBoard = {
  weekends: { key: string; firstDate: string }[]
  selected: string | null
  fixtures: BoardFixture[]
  notices: string[]
  today: string
}

export async function loadWeekendBoard(user: TypedUser, opts: { weekend?: string | null } = {}): Promise<WeekendBoard> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const upcoming = (await payload.find({ collection: 'selection-fixtures', where: { and: [{ status: { equals: 'upcoming' } }, { localDate: { greater_than_equal: today } }] } as Where, limit: 500, pagination: false, depth: 0, sort: ['localDate', 'localTime'], overrideAccess: true })).docs as unknown as FixtureStamped[]
  const groups = groupByWeekend(upcoming)
  const weekends = groups.map((g) => ({ key: g.key, firstDate: g.rows[0].localDate }))
  const picked = groups.find((g) => g.key === opts.weekend) ?? groups[0]
  if (!picked) return { weekends, selected: null, fixtures: [], notices: await noticesFor(payload), today }
  const fixtures = [...picked.rows].sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.gradeName.localeCompare(b.gradeName))
  const views = await buildViews(payload, user, fixtures)

  const { squads } = await currentSquads(payload)
  const byGrade = new Map(squads.map((s) => [s.gradeId, s]))
  const bySquad = await membersBySquad(payload, squads.map((s) => s.id))
  const memberIds = [...new Set(fixtures.flatMap((f) => bySquad.get(byGrade.get(f.gradeId)?.id ?? -1) ?? []))]
  const [players, profiles] = await Promise.all([loadPlayers(payload, memberIds), profilesForPlayers(user, memberIds)])
  const answers = new Map<string, Answer>()
  if (memberIds.length) {
    const rows = await payload.find({ collection: 'availability', where: { and: [{ player: { in: memberIds } }, { fixture: { in: fixtures.map((f) => f.id) } }] } as Where, limit: 20000, pagination: false, depth: 0, overrideAccess: true })
    for (const r of rows.docs) if (isStatus(r.status)) answers.set(`${idOf(r.player)}:${idOf(r.fixture)}`, r.status)
  }
  const club = await getClub()
  const link = `${club.siteUrl}${availabilityPath(linkToken((await getSelectionSettings(payload)).linkVersion))}`
  const board: BoardFixture[] = fixtures.map((fx) => {
    const ids = bySquad.get(byGrade.get(fx.gradeId)?.id ?? -1) ?? []
    const per = ids.map((id) => ({ id, answer: answers.get(`${id}:${fx.id}`) ?? ('none' as Answer), p: players.get(id), prof: profiles.get(id) })).filter((x) => x.p)
    const noReply = per.filter((x) => x.answer === 'none').map((x) => ({ id: x.id, name: x.p!.name, slug: x.p!.slug, phone: x.prof?.phone ?? null })).sort((a, b) => a.name.localeCompare(b.name))
    return {
      fixture: fx,
      view: views.get(fx.id)!,
      availability: { tally: tally(per.map((x) => x.answer)), noReply, keeperAvailable: per.some((x) => (x.answer === 'in' || x.answer === 'maybe') && (x.prof?.canKeep || x.prof?.role === 'keeper')), squadSize: per.length },
      reminder: reminderText({ gradeName: fx.gradeName, opponent: fx.opponentName, when: [formatMatchDay(fx.localDate, club.locale), formatMatchTime(fx.localTime)].filter(Boolean).join(' '), names: noReply.map((n) => n.name.split(' ')[0]), availabilityUrl: link }),
    }
  })
  return { weekends, selected: picked.key, fixtures: board, notices: await noticesFor(payload), today }
}

/** Notices the overview shows: PIN clashes and someone guessing PINs (the same signals the availability page shows). */
async function noticesFor(payload: Payload): Promise<string[]> {
  const out: string[] = []
  const flagged = await payload.find({ collection: 'player-selection-profiles', where: { needsManualPin: { equals: true } }, limit: 50, pagination: false, depth: 0, select: { player: true }, overrideAccess: true })
  const ids = flagged.docs.map((d) => idOf(d.player)).filter((n): n is number => n != null)
  if (ids.length) out.push(`PIN clash between players called ${[...(await loadPlayers(payload, ids)).values()].map((p) => p.name).sort().join(', ')}. Give one of each pair their own PIN on their player card.`)
  const { globalKey } = await import('@/lib/availability-throttle')
  const { isLocked } = await import('@/lib/throttle')
  const settings = await getSelectionSettings(payload)
  if (!(await isLocked(payload, globalKey(settings.linkVersion))).allowed) out.push('Someone is guessing PINs on the availability link. New sign-ins are paused for a while. Consider rotating the link.')
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// The builder

export type Candidate = { id: number; slug: string; name: string; hidden: boolean; role: RoleOrUnknown; batting: string; bowling: string; answer: Answer; note: string; inTeam: boolean }
export type Builder = { view: SheetView; candidates: Candidate[]; published: PublicTeam | null; weekendKey: string; showOrder: boolean; rules: XiRules }

export async function fixtureByGameId(payload: Payload, gameId: string): Promise<FixtureStamped | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(gameId)) return null
  const res = await payload.find({ collection: 'selection-fixtures', where: { gameId: { equals: gameId } }, limit: 1, depth: 0, overrideAccess: true })
  return (res.docs[0] as unknown as FixtureStamped | undefined) ?? null
}

export async function loadBuilder(user: TypedUser, gameId: string): Promise<Builder | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const fx = await fixtureByGameId(payload, gameId)
  if (!fx) return null
  const view = (await buildViews(payload, user, [fx])).get(fx.id)!
  const settings = await getSelectionSettings(payload)
  const { squads } = await currentSquads(payload)
  const squad = squads.find((s) => s.gradeId === fx.gradeId)
  const memberIds = squad ? ((await membersBySquad(payload, [squad.id])).get(squad.id) ?? []) : []
  const inTeam = new Set(view.slots.map((s) => s.playerId).filter((n): n is number => n != null))
  const [players, profiles, insights] = await Promise.all([loadPlayers(payload, memberIds), profilesForPlayers(user, memberIds), loadInsights(payload, memberIds)])
  const answers = new Map<number, { answer: Answer; note: string }>()
  if (memberIds.length) {
    const rows = await payload.find({ collection: 'availability', where: { and: [{ player: { in: memberIds } }, { fixture: { equals: fx.id } }] } as Where, limit: memberIds.length + 1, pagination: false, depth: 0, overrideAccess: true })
    for (const r of rows.docs) if (isStatus(r.status)) answers.set(idOf(r.player)!, { answer: r.status, note: r.note ?? '' })
  }
  const candidates: Candidate[] = memberIds
    .map((id) => players.get(id))
    .filter((p): p is PlayerLite => Boolean(p))
    .map((p) => {
      const prof = profiles.get(p.id)
      const ins = insights.get(p.id)
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        hidden: p.hidden,
        role: effectiveRole((prof?.role ?? null) as Role | null, prof?.canKeep ? 'keeper' : ins?.suggested ?? 'unknown'),
        batting: ins?.batting ?? '',
        bowling: ins?.bowling ?? '',
        answer: answers.get(p.id)?.answer ?? 'none',
        note: answers.get(p.id)?.note ?? '',
        inTeam: inTeam.has(p.id),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const published = view.chip ? (await readPublishedTeams(payload, { gameId: { equals: gameId } }))[0] ?? null : null
  return { view, candidates, published, weekendKey: weekendKey(fx.localDate), showOrder: settings.publishBattingOrder, rules: settings.xi }
}

/** The working team as the image and text would show it (names unredacted: only a signed-in selector ever sees this). */
export async function previewTeam(user: TypedUser, gameId: string): Promise<PublicTeam | null> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const fx = await fixtureByGameId(payload, gameId)
  if (!fx) return null
  const view = (await buildViews(payload, user, [fx])).get(fx.id)!
  if (!view.slots.length) return null
  const settings = await getSelectionSettings(payload)
  return {
    gameId: fx.gameId,
    gradeName: fx.gradeName,
    roundName: fx.roundName,
    opponentName: fx.opponentName,
    localDate: fx.localDate,
    localTime: fx.localTime,
    venueName: fx.venueName,
    venueSuburb: fx.venueSuburb,
    isHome: fx.isHome,
    publishedAt: new Date().toISOString(),
    updated: view.publishCount > 0,
    showOrder: settings.publishBattingOrder,
    slots: view.slots.map((s) => ({ order: s.order, name: s.name, slug: s.slug, isCaptain: s.isCaptain, isKeeper: s.isKeeper, withheld: false, guest: s.playerId == null })),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Saving

export type SaveInput = { gameId: string; expectedRevision: number; size: unknown; markedReady: boolean; slots: { playerId?: number | null; guestName?: string | null; isCaptain?: boolean; isKeeper?: boolean }[] }
export type SaveSheetResult = { ok: true; revision: number } | { ok: false; error: string; stale?: boolean }

const STALE = 'Someone else changed this team. Reload to see their changes.'
class StaleError extends Error {}
const MAX_SLOTS = 20

export async function saveSheet(user: TypedUser, input: SaveInput): Promise<SaveSheetResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const fx = await fixtureByGameId(payload, input.gameId)
  if (!fx) return { ok: false, error: 'That game was not found.' }
  const size = Number(input.size)
  if (!isXiSize(size)) return { ok: false, error: 'A team has 11, 12 or 13 players, or no limit.' }
  if (!Array.isArray(input.slots) || input.slots.length > MAX_SLOTS) return { ok: false, error: 'That is too many places for one team.' }
  const expected = Number(input.expectedRevision)
  if (!Number.isInteger(expected) || expected < 0) return { ok: false, error: 'Something went wrong. Reload and try again.' }

  const raw: Slot[] = input.slots.map((s, i) => {
    const guest = typeof s.guestName === 'string' && s.guestName.trim() !== '' ? validateGuestName(s.guestName) : null
    return { ...(s.playerId != null ? { player: Number(s.playerId) } : {}), ...(guest?.ok ? { guestName: guest.name } : s.playerId == null && typeof s.guestName === 'string' ? { guestName: s.guestName } : {}), order: i + 1, isCaptain: s.isCaptain === true, isKeeper: s.isKeeper === true }
  })
  if (raw.some((s) => s.player != null && !Number.isInteger(s.player))) return { ok: false, error: 'Something went wrong. Reload and try again.' }
  const problems = validateSlots(raw, size)
  if (problems.length) return { ok: false, error: problems[0].message }
  const slots = normaliseSlots(raw)
  const found = await loadPlayers(payload, slots.map((s) => s.player).filter((n): n is number => n != null))
  if (slots.some((s) => s.player != null && !found.has(s.player))) return { ok: false, error: 'One of those players was not found. Reload and try again.' }

  const existing = (await payload.find({ collection: 'team-sheets', where: { fixture: { equals: fx.id } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as SheetDoc | undefined
  const data = {
    slots: slots.map((s) => ({ player: s.player ?? null, guestName: s.player == null ? s.guestName ?? null : null, order: s.order, isCaptain: s.isCaptain, isKeeper: s.isKeeper })),
    size,
    markedReady: input.markedReady === true,
  }
  if (!existing) {
    if (expected !== 0) return { ok: false, error: STALE, stale: true }
    try {
      const made = await payload.create({ collection: 'team-sheets', data: { fixture: fx.id, ...data, revision: 1 } as never, user: user as never, overrideAccess: true, context: CTX })
      return { ok: true, revision: Number((made as unknown as SheetDoc).revision ?? 1) }
    } catch {
      // the unique index on `fixture`: another selector created the sheet first
      return { ok: false, error: STALE, stale: true }
    }
  }
  // Claim the next revision and write the slots in ONE transaction: the claim takes the row lock, so of two saves that started from
  // the same revision exactly one gets the row, and a publish reading meanwhile sees the old revision with the old slots or the new
  // revision with the new slots, never a mix.
  const req = await createLocalReq({ user: user as never }, payload)
  try {
    await initTransaction(req)
    const session = (payload.db as unknown as { sessions?: Record<string, { db: typeof payload.db.drizzle }> }).sessions?.[String(await req.transactionID)]
    const claimed = await (session?.db ?? payload.db.drizzle).execute(sql`UPDATE "payload"."team_sheets" SET "revision" = "revision" + 1 WHERE "id" = ${existing.id} AND "revision" = ${expected} RETURNING "revision"`)
    if (!claimed.rows.length) {
      await killTransaction(req)
      return { ok: false, error: STALE, stale: true }
    }
    await payload.update({ collection: 'team-sheets', id: existing.id, data: data as never, user: user as never, overrideAccess: true, context: CTX, req })
    await commitTransaction(req)
    return { ok: true, revision: Number((claimed.rows[0] as { revision: string | number }).revision) }
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Publishing and withdrawing

export type PublishInput = { gameIds: string[]; announce: boolean; acknowledged: boolean; expectedRevisions?: Record<string, number>; requireReady?: boolean }
export type PublishResult =
  | { ok: true; published: string[]; announcementId: number | null }
  | { ok: false; error: string; needsAcknowledgement?: { gradeName: string; text: string }[] }

const weekRange = (key: string): { from: string; to: string } => {
  const d = new Date(`${key}T00:00:00Z`).getTime()
  return { from: new Date(d - 5 * 86_400_000).toISOString().slice(0, 10), to: new Date(d + 86_400_000).toISOString().slice(0, 10) }
}

export async function publishSheets(user: TypedUser, input: PublishInput): Promise<PublishResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const gameIds = [...new Set(input.gameIds)].slice(0, 30)
  if (!gameIds.length) return { ok: false, error: 'Pick at least one team to publish.' }
  const fixtures: FixtureStamped[] = []
  for (const g of gameIds) {
    const fx = await fixtureByGameId(payload, g)
    if (!fx) return { ok: false, error: 'That game was not found.' }
    fixtures.push(fx)
  }
  const views = await buildViews(payload, user, fixtures)

  // Validate everything first: nothing is published unless every chosen team can be.
  const warned: { gradeName: string; text: string }[] = []
  for (const fx of fixtures) {
    const v = views.get(fx.id)!
    const expected = input.expectedRevisions?.[fx.gameId]
    if (expected != null && expected !== v.revision) return { ok: false, error: STALE }
    if (v.sheetId == null || v.slots.length === 0) return { ok: false, error: `${fx.gradeName} has nobody picked yet.` }
    if (input.requireReady && !v.markedReady) return { ok: false, error: `${fx.gradeName} is not marked Ready. Reload to see the current teams.` }
    const blocking = blockingWarnings(v.warnings)
    if (blocking.length) return { ok: false, error: `${fx.gradeName}: ${blocking[0].text}` }
    for (const w of v.warnings) warned.push({ gradeName: fx.gradeName, text: w.text })
  }
  if (warned.length && !input.acknowledged) return { ok: false, error: 'Check the warnings and publish anyway if you are sure.', needsAcknowledgement: warned }

  const req = await createLocalReq({ user: user as never }, payload)
  const publishedAt = new Date().toISOString()
  try {
    await initTransaction(req)
    for (const fx of fixtures) {
      const v = views.get(fx.id)!
      // Re-check inside the transaction: a save that landed after the read above must not be published unseen.
      const current = (await payload.findByID({ collection: 'team-sheets', id: v.sheetId!, depth: 0, req, overrideAccess: true })) as unknown as SheetDoc
      if (Number(current.revision ?? 0) !== v.revision) throw new StaleError()
      const snapshot = buildSnapshot({ slots: v.slots.map((s) => ({ ...(s.playerId != null ? { player: s.playerId } : { guestName: s.guestName ?? '' }), order: s.order, isCaptain: s.isCaptain, isKeeper: s.isKeeper })), size: v.size, revision: v.revision }, publishedAt)
      await payload.update({ collection: 'team-sheets', id: v.sheetId!, data: { publishedSnapshot: snapshot, publishedAt, publishedBy: user.id, publishCount: v.publishCount + 1 } as never, req, overrideAccess: true, context: CTX })
    }
    await commitTransaction(req)
  } catch (err) {
    await killTransaction(req)
    if (err instanceof StaleError) return { ok: false, error: STALE }
    console.error('[teams] publish failed', err instanceof Error ? err.message : err)
    return { ok: false, error: 'Something went wrong. Nothing was published. Please try again.' }
  }

  let announcementId: number | null = null
  try {
    const settings = await getSelectionSettings(payload)
    if (input.announce && settings.announceOnPublish) {
    const keys = [...new Set(fixtures.map((f) => weekendKey(f.localDate)))]
    for (const key of keys) {
      const changes = fixtures.filter((f) => weekendKey(f.localDate) === key && views.get(f.id)!.changes.length > 0).map((f) => f.gradeName)
      const wasRepublish = fixtures.some((f) => weekendKey(f.localDate) === key && views.get(f.id)!.publishCount > 0)
      announcementId = (await upsertWeekendAnnouncement(payload, key, { updated: wasRepublish && changes.length > 0, changes })) ?? announcementId
    }
    }
  } catch (err) {
    // The teams are already public: a failed announcement must not stop the caches being refreshed or turn this into an error.
    console.error('[teams] announcement failed', err instanceof Error ? err.message : err)
  }
  await revalidateTeams(gameIds)
  return { ok: true, published: gameIds, announcementId }
}

/** One announcement per weekend, found by its hidden `autoKey`; built from the published snapshots (read uncached). */
async function upsertWeekendAnnouncement(payload: Payload, key: string, opts: { updated: boolean; changes: string[] }): Promise<number | null> {
  const { from, to } = weekRange(key)
  const teams = (await readPublishedTeams(payload, { and: [{ localDate: { greater_than_equal: from } }, { localDate: { less_than_equal: to } }] } as Where)).sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.gradeName.localeCompare(b.gradeName))
  const autoKey = announcementKey(key)
  const found = (await payload.find({ collection: 'announcements', where: { autoKey: { equals: autoKey } }, limit: 1, depth: 0, showHiddenFields: true, overrideAccess: true })).docs[0] as { id: number } | undefined
  if (!teams.length) {
    if (found) await payload.update({ collection: 'announcements', id: found.id, data: { published: false }, overrideAccess: true, context: CTX })
    return found?.id ?? null
  }
  const club = await getClub()
  const label = await matchdayLabel(payload)
  const data = {
    title: announcementTitle({ label, firstLocalDate: teams[0].localDate, locale: club.locale, updated: opts.updated && Boolean(found) }),
    body: announcementBody(teams.map((t) => ({ gradeName: t.gradeName, opponent: t.opponentName, localDate: t.localDate, localTime: t.localTime, })), club.locale, opts.updated ? opts.changes : []),
    published: true,
    link: '/teams',
    linkLabel: 'See the teams',
    autoKey,
  }
  if (found) {
    await payload.update({ collection: 'announcements', id: found.id, data: data as never, overrideAccess: true, context: CTX })
    return found.id
  }
  try {
    return ((await payload.create({ collection: 'announcements', data: data as never, overrideAccess: true, context: CTX })) as { id: number }).id
  } catch {
    // the unique `autoKey`: a parallel publish created it a moment ago; update that one
    const again = (await payload.find({ collection: 'announcements', where: { autoKey: { equals: autoKey } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as { id: number } | undefined
    if (again) await payload.update({ collection: 'announcements', id: again.id, data: data as never, overrideAccess: true, context: CTX })
    return again?.id ?? null
  }
}

async function matchdayLabel(payload: Payload): Promise<string> {
  const { DEFAULT_MATCHDAY_LABEL } = await import('@/lib/site-settings-core')
  const g = await payload.findGlobal({ slug: 'site-settings', depth: 0 }).catch(() => null)
  const v = (g as { matchdayLabel?: string | null } | null)?.matchdayLabel?.trim()
  return v || DEFAULT_MATCHDAY_LABEL
}

async function revalidateTeams(gameIds: readonly string[]): Promise<void> {
  await revalidatePaths(['/', '/teams', ...gameIds.flatMap((g) => [`/teams/${g}`, `/teams/${g}/lineup-image`]), '/announcements', '/sitemap.xml'], undefined, [TEAMS_TAG])
}

export type WithdrawResult = { ok: true } | { ok: false; error: string }

/** Takes a team off the public site: the snapshot is cleared (page and image 404) and the weekend's announcement is updated or switched off. */
export async function withdrawSheet(user: TypedUser, gameId: string): Promise<WithdrawResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const fx = await fixtureByGameId(payload, gameId)
  if (!fx) return { ok: false, error: 'That game was not found.' }
  const sheet = (await payload.find({ collection: 'team-sheets', where: { fixture: { equals: fx.id } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as SheetDoc | undefined
  if (!sheet) return { ok: false, error: 'There is no team for that game.' }
  await payload.update({ collection: 'team-sheets', id: sheet.id, data: { publishedSnapshot: null, publishedAt: null, publishedBy: null, publishCount: 0 } as never, overrideAccess: true, context: CTX })
  await upsertWeekendAnnouncement(payload, weekendKey(fx.localDate), { updated: false, changes: [] })
  await revalidateTeams([gameId])
  return { ok: true }
}

// ---------------------------------------------------------------------------------------------------------------------
// The player card extras (last five scores and the next month's availability)

export type PlayerExtras = { batting: string; bowling: string; suggested: RoleOrUnknown; upcoming: { fixtureId: number; gradeName: string; opponentName: string; localDate: string; answer: Answer; note: string }[] }

export async function loadPlayerExtras(user: TypedUser, playerId: number): Promise<PlayerExtras> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const horizon = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10)
  const insights = (await loadInsights(payload, [playerId])).get(playerId)
  const { squads } = await currentSquads(payload)
  const memberships = await payload.find({ collection: 'squad-members', where: { player: { equals: playerId } }, limit: 50, pagination: false, depth: 0, overrideAccess: true })
  const mySquads = new Set(memberships.docs.map((m) => idOf(m.squad)))
  const grades = squads.filter((s) => mySquads.has(s.id)).map((s) => s.gradeId)
  const fixtures = grades.length
    ? ((await payload.find({ collection: 'selection-fixtures', where: { and: [{ gradeId: { in: grades } }, { status: { equals: 'upcoming' } }, { localDate: { greater_than_equal: today } }, { localDate: { less_than_equal: horizon } }] } as Where, limit: 100, pagination: false, depth: 0, sort: ['localDate', 'localTime'], overrideAccess: true })).docs as unknown as FixtureRow[])
    : []
  const rows = fixtures.length ? (await payload.find({ collection: 'availability', where: { and: [{ player: { equals: playerId } }, { fixture: { in: fixtures.map((f) => f.id) } }] } as Where, limit: 200, pagination: false, depth: 0, overrideAccess: true })).docs : []
  const byFixture = new Map(rows.map((r) => [idOf(r.fixture)!, r]))
  return {
    batting: insights?.batting ?? 'No data',
    bowling: insights?.bowling ?? 'No data',
    suggested: insights?.suggested ?? 'unknown',
    upcoming: fixtures.map((f) => {
      const r = byFixture.get(f.id)
      return { fixtureId: f.id, gradeName: f.gradeName, opponentName: f.opponentName, localDate: f.localDate, answer: r && isStatus(r.status) ? r.status : 'none', note: r?.note ?? '' }
    }),
  }
}
