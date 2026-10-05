import { timingSafeEqual } from 'node:crypto'
import type { Payload, Where } from 'payload'
import { AVAILABILITY } from '@/config/site'
import { changesClosed, cleanNote, isStatus, type Answer, type AvailabilityStatus } from '@/lib/availability'
import { CODE_RULE, codeKey, globalKey, GLOBAL_RULE, LOCKED_MESSAGE, NAME_RULE, nameKey, NO_MATCH_MESSAGE } from '@/lib/availability-throttle'
import { tokenMatches, verifyAvailCookie } from '@/lib/availability-link'
import { clubToday } from '@/lib/selection-fixtures'
import { matchPlayers } from '@/lib/selection/name-match'
import { dummyVerify, hashOneTimeCode, looksLikePin, verifyPin } from '@/lib/selection/pin'
import { currentSquads, getSelectionSettings, idOf, loadPlayers, membersBySquad, toPlayerLite, upcomingFixtures, type FixtureRow, type PlayerLite, type SelectionSettingsValues } from '@/lib/selection/store'
import { clear, hit, ipHit, isLocked } from '@/lib/throttle'
import { normaliseName } from '@/lib/identity'

/**
 * The public side of the availability link (announce-teams spec 4.5). Everything here is reached with no login: the URL token
 * proves the caller was given the link, a name plus PIN (or a selector's one-time code) proves who they are, and from then on a
 * signed cookie holds only the player id. Queries state their own filters: they run with the Local API's access override.
 * Nothing here ever returns another player's data, a roster, a count of matches or a phone number.
 */

/** The settings when `token` is the live link, else null (the page is then a plain 404: wrong, rotated and switched-off links look the same). */
export async function resolveLink(payload: Payload, token: string): Promise<SelectionSettingsValues | null> {
  const settings = await getSelectionSettings(payload)
  if (!settings.linkEnabled || !tokenMatches(token, settings.linkVersion)) return null
  return settings
}

/** The player a remembered-device cookie names, or null (bad cookie, old link version, or the player no longer exists). */
export async function rememberedPlayer(payload: Payload, cookieValue: string | undefined, settings: SelectionSettingsValues): Promise<PlayerLite | null> {
  const c = verifyAvailCookie(cookieValue)
  if (!c || c.linkVersion !== settings.linkVersion) return null
  const found = await loadPlayers(payload, [c.playerId])
  return found.get(c.playerId) ?? null
}

type Profile = { id: number; player: number; pinHash?: string | null; pinSalt?: string | null; otcHash?: string | null; otcExpiresAt?: string | null }

/** Who may identify themselves: members of a current squad and anyone with a profile (a selector has dealt with them). */
async function roster(payload: Payload): Promise<PlayerLite[]> {
  const { squads } = await currentSquads(payload)
  const bySquad = await membersBySquad(payload, squads.map((s) => s.id))
  const ids = new Set<number>([...bySquad.values()].flat())
  const profiles = await payload.find({ collection: 'player-selection-profiles', limit: 5000, pagination: false, depth: 0, select: { player: true }, overrideAccess: true })
  for (const p of profiles.docs) {
    const id = idOf(p.player)
    if (id != null) ids.add(id)
  }
  return [...(await loadPlayers(payload, [...ids])).values()]
}

async function profilesFor(payload: Payload, playerIds: readonly number[]): Promise<Map<number, Profile>> {
  const out = new Map<number, Profile>()
  if (!playerIds.length) return out
  const res = await payload.find({ collection: 'player-selection-profiles', where: { player: { in: [...playerIds] } }, limit: playerIds.length, pagination: false, depth: 0, showHiddenFields: true, overrideAccess: true })
  for (const p of res.docs) out.set(idOf(p.player)!, { id: p.id, player: idOf(p.player)!, pinHash: (p as Profile).pinHash, pinSalt: (p as Profile).pinSalt, otcHash: (p as Profile).otcHash, otcExpiresAt: (p as Profile).otcExpiresAt })
  return out
}

const safeEqualHex = (a: string, b: string): boolean => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type IdentifyResult = { ok: true; playerId: number } | { ok: false; message: string }

const FAIL: IdentifyResult = { ok: false, message: NO_MATCH_MESSAGE }
const LOCKED: IdentifyResult = { ok: false, message: LOCKED_MESSAGE }

/**
 * Name plus PIN (or one-time code). Every failure (wrong name, wrong PIN, no PIN set, a name that matches too many players, two
 * players with the same name and PIN) returns the same message; a lock returns the lock message. Known and unknown names cost the
 * same (a dummy hash) and use the same kinds of throttle keys. A remembered device never comes through here, so it is never locked.
 */
export async function identify(payload: Payload, ctx: { linkVersion: number; ip: string | null }, nameInput: string, secretInput: string): Promise<IdentifyResult> {
  const typedName = typeof nameInput === 'string' ? nameInput.trim() : ''
  const secret = typeof secretInput === 'string' ? secretInput.trim() : ''
  const normName = normaliseName(typedName)
  const bounded = Boolean(normName) && typedName.length <= 80 && secret.length > 0 && secret.length <= 40
  if (!(await ipHit(payload, 'avail', ctx.ip)).allowed) return LOCKED

  const isPin = looksLikePin(secret)
  const candidates = bounded ? matchPlayers(typedName, await roster(payload)) : []
  const known = candidates.length > 0
  const keyName = nameKey(ctx.linkVersion, normName || '-', known)

  // Take the throttle slot BEFORE checking the secret, in one atomic statement: a parallel burst cannot test more guesses than the
  // limit allows, and a correct guess in the burst is refused once the key is locked. A PIN is also stopped by a whole-link pause;
  // a one-time code (issued by a selector) counts on its own key and is not blocked by a lock somebody else caused.
  if (isPin && (await isLocked(payload, globalKey(ctx.linkVersion))).allowed === false) return LOCKED
  const attemptKey = isPin ? keyName : codeKey(ctx.linkVersion, normName || '-', known)
  if (!(await hit(payload, attemptKey, isPin ? NAME_RULE : CODE_RULE)).allowed) return LOCKED

  let matched: PlayerLite[] = []
  if (bounded && candidates.length <= AVAILABILITY.maxCandidates) {
    const profiles = await profilesFor(payload, candidates.map((c) => c.id))
    if (isPin) {
      // One derivation per candidate, or one dummy for nobody: the same work either way.
      const checks = candidates.length ? candidates : [null]
      const results = await Promise.all(checks.map((c) => (c ? verifyPin(secret, { hash: profiles.get(c.id)?.pinHash, salt: profiles.get(c.id)?.pinSalt }) : dummyVerify(secret))))
      matched = candidates.filter((_, i) => results[i])
    } else {
      const want = hashOneTimeCode(secret)
      const now = Date.now()
      matched = candidates.filter((c) => {
        const p = profiles.get(c.id)
        return Boolean(p?.otcHash && p.otcExpiresAt && new Date(p.otcExpiresAt).getTime() > now && safeEqualHex(p.otcHash, want))
      })
    }
    if (matched.length > 1) {
      // Two players of one name share this PIN: tell the selectors (they set one a manual PIN), and refuse both.
      for (const m of matched) {
        const p = profiles.get(m.id)
        if (p) await payload.update({ collection: 'player-selection-profiles', id: p.id, data: { needsManualPin: true }, overrideAccess: true, context: { disableRevalidate: true } })
      }
      matched = []
    }
  } else if (isPin && bounded) {
    await dummyVerify(secret)
  }

  if (matched.length === 1) {
    const player = matched[0]
    if (isPin) await clear(payload, keyName)
    else {
      await clear(payload, attemptKey)
      const p = (await profilesFor(payload, [player.id])).get(player.id)
      if (p) await payload.update({ collection: 'player-selection-profiles', id: p.id, data: { otcHash: null, otcExpiresAt: null } as never, overrideAccess: true, context: { disableRevalidate: true } })
    }
    return { ok: true, playerId: player.id }
  }

  if (isPin || !bounded) {
    // The name key was already counted above; a failed PIN (or unusable input) also counts against the whole link.
    if (!(await hit(payload, globalKey(ctx.linkVersion), GLOBAL_RULE)).allowed) return LOCKED
  }
  return FAIL
}

export type PlayerFixtureView = {
  id: number
  gradeName: string
  roundName: string | null
  localDate: string
  localTime: string | null
  venue: string | null
  opponentName: string
  isHome: boolean
  answer: Answer
  note: string
  closed: boolean
}
export type PlayerAvailabilityView = { player: { id: number; name: string }; inSquad: boolean; fixtures: PlayerFixtureView[]; lockHours: number }

/** What an identified player sees: only their own answers, and the club's upcoming games for their squad grades. */
export async function playerView(payload: Payload, playerId: number, settings: SelectionSettingsValues, now: Date = new Date()): Promise<PlayerAvailabilityView | null> {
  const player = (await loadPlayers(payload, [playerId])).get(playerId)
  if (!player) return null
  const grades = await playerGrades(payload, playerId)
  const fixtures = grades.length ? await upcomingFixtures(payload, clubToday(now), grades.map((g) => g.gradeId)) : []
  const answers = fixtures.length
    ? (await payload.find({ collection: 'availability', where: { and: [{ player: { equals: playerId } }, { fixture: { in: fixtures.map((f) => f.id) } }] } as Where, limit: fixtures.length, pagination: false, depth: 0, overrideAccess: true })).docs
    : []
  const byFixture = new Map(answers.map((a) => [idOf(a.fixture), a]))
  return {
    player: { id: player.id, name: player.name },
    inSquad: grades.length > 0,
    lockHours: settings.availabilityLockHours,
    fixtures: fixtures.map((f) => {
      const a = byFixture.get(f.id)
      return {
        id: f.id,
        gradeName: f.gradeName,
        roundName: f.roundName,
        localDate: f.localDate,
        localTime: f.localTime,
        venue: [f.venueName, f.venueSuburb].filter(Boolean).join(', ') || null,
        opponentName: f.opponentName,
        isHome: f.isHome,
        answer: a && isStatus(a.status) ? a.status : 'none',
        note: a?.note ?? '',
        closed: changesClosed(f.startsAt, settings.availabilityLockHours, now),
      }
    }),
  }
}

/** The grades (of the current season) a player is in a squad for. */
export async function playerGrades(payload: Payload, playerId: number): Promise<{ squadId: number; gradeId: string; gradeName: string }[]> {
  const { squads } = await currentSquads(payload)
  if (!squads.length) return []
  const mine = await payload.find({ collection: 'squad-members', where: { and: [{ player: { equals: playerId } }, { squad: { in: squads.map((s) => s.id) } }] } as Where, limit: 50, pagination: false, depth: 0, overrideAccess: true })
  const ids = new Set(mine.docs.map((m) => idOf(m.squad)))
  return squads.filter((s) => ids.has(s.id)).map((s) => ({ squadId: s.id, gradeId: s.gradeId, gradeName: s.gradeName }))
}

export type RespondResult = { ok: true } | { ok: false; message: string }

/**
 * Records one answer for `playerId` (taken from the signed cookie by the caller, never from the form). The game must be one of
 * the player's own grades and still open. A repeat answer replaces the earlier one.
 */
export async function respond(payload: Payload, playerId: number, input: { fixtureId: unknown; status: unknown; note?: unknown }, settings: SelectionSettingsValues, now: Date = new Date()): Promise<RespondResult> {
  const fixtureId = Number(input.fixtureId)
  if (!Number.isInteger(fixtureId) || !isStatus(input.status)) return { ok: false, message: 'Something went wrong. Please try again.' }
  const grades = await playerGrades(payload, playerId)
  const fixtures: FixtureRow[] = grades.length ? await upcomingFixtures(payload, clubToday(now), grades.map((g) => g.gradeId)) : []
  const fixture = fixtures.find((f) => f.id === fixtureId)
  if (!fixture) return { ok: false, message: 'That game is not open for your answer any more.' }
  if (changesClosed(fixture.startsAt, settings.availabilityLockHours, now)) return { ok: false, message: 'Selection has started; call a selector.' }
  await upsertAnswer(payload, playerId, fixtureId, input.status as AvailabilityStatus, cleanNote(input.note, AVAILABILITY.noteMax))
  return { ok: true }
}

/** Upsert by (player, fixture). The unique index settles a race: the loser updates instead. */
export async function upsertAnswer(payload: Payload, playerId: number, fixtureId: number, status: AvailabilityStatus, note: string, user?: { id: number }): Promise<void> {
  const where: Where = { and: [{ player: { equals: playerId } }, { fixture: { equals: fixtureId } }] }
  const existing = (await payload.find({ collection: 'availability', where, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const base = { status, note: note || null }
  const opts = { overrideAccess: true, context: { disableRevalidate: true }, ...(user ? { user: user as never } : {}) }
  if (existing) {
    await payload.update({ collection: 'availability', id: existing.id, data: base, ...opts })
    return
  }
  try {
    await payload.create({ collection: 'availability', data: { player: playerId, fixture: fixtureId, ...base } as never, ...opts })
  } catch {
    const again = (await payload.find({ collection: 'availability', where, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    if (!again) throw new Error('could not record the answer')
    await payload.update({ collection: 'availability', id: again.id, data: base, ...opts })
  }
}

export { toPlayerLite }
