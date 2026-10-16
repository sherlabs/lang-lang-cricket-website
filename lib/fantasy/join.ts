import type { Payload } from 'payload'
import { FANTASY } from '@/config/site'
import { dummyVerify, hashPin, verifyPin } from '@/lib/selection/pin'
import { clear, hit, ipHit, isLocked } from '@/lib/throttle'
import { cookieStillValid, verifyFantasyCookie, type FantasyCookie } from './link'
import { checkNameShape, isBlockedName, nameKeyOf, NAME_UNAVAILABLE } from './names'
import { checkNewPin, deviceCodeExpiry, hashDeviceCode, looksLikeFantasyPin, newDeviceCode } from './pin'
import { FANTASY_TAG, idOf, toEntryPublic, type EntryPublic, type FantasySeason } from './store'
import { bucketKey, CODE_RULE, ENTRY_RULE, entryKey, LINK_RULE, linkKey, LOCKED_MESSAGE, NO_MATCH_MESSAGE } from './throttle'
import { timingSafeEqual } from 'node:crypto'
import { revalidatePaths } from '../../payload/hooks/revalidate'

/**
 * Joining and signing in to the fantasy game (wave F spec 4.4). The link proves the caller was given it; a team name plus PIN (or a
 * one-time add-a-device code) proves who they are; from then on a signed cookie holds only the manager id. Nothing here returns a
 * PIN, a hash or another manager's data. Unknown and known names cost the same (a dummy hash) and share one failure message.
 */
export type JoinCtx = { linkVersion: number; ip: string | null }
export type AuthResult = { ok: true; entry: EntryPublic; /** Set when the cookie must be issued with an issue time at or after this instant. */ issuedAt: number } | { ok: false; message: string }

const CTX = { disableRevalidate: true }
const LOCKED: AuthResult = { ok: false, message: LOCKED_MESSAGE }
const FAIL: AuthResult = { ok: false, message: NO_MATCH_MESSAGE }

type EntrySecrets = { id: number; season: unknown; teamName: string; createdAt: string; disabled?: boolean | null; mustChangePin?: boolean | null; pinSetAt?: string | null; pinHash?: string | null; pinSalt?: string | null; deviceCodeHash?: string | null; deviceCodeExpires?: string | null }

async function entryByKey(payload: Payload, seasonId: number, key: string): Promise<EntrySecrets | null> {
  const res = await payload.find({ collection: 'fantasy-entries', where: { and: [{ season: { equals: seasonId } }, { nameKey: { equals: key } }] }, limit: 1, depth: 0, overrideAccess: true })
  return (res.docs[0] as unknown as EntrySecrets | undefined) ?? null
}

/** Create a manager. A taken name and a blocked name give the identical message after the identical work. */
export async function registerEntry(
  payload: Payload,
  ctx: JoinCtx,
  season: FantasySeason,
  input: { teamName: unknown; pin: unknown; again: unknown },
): Promise<AuthResult> {
  if (!(await ipHit(payload, 'fantasy', ctx.ip)).allowed) return LOCKED
  const shape = checkNameShape(input.teamName)
  if (!shape.ok) return { ok: false, message: shape.message }
  const pin = checkNewPin(input.pin, input.again)
  if (!pin.ok) return { ok: false, message: pin.message }
  // Always look the name up and always compare against the blocklist, then decide: one path, one message.
  const taken = await entryByKey(payload, season.id, shape.key)
  const blocked = isBlockedName(shape.key, season.blockedWords)
  if (taken || blocked) return { ok: false, message: NAME_UNAVAILABLE }
  const count = await payload.count({ collection: 'fantasy-entries', where: { season: { equals: season.id } }, overrideAccess: true })
  if (count.totalDocs >= season.rules.maxEntries) return { ok: false, message: 'This competition is full.' }
  const { hash, salt } = await hashPin(pin.pin)
  const now = Date.now()
  try {
    const doc = await payload.create({
      collection: 'fantasy-entries',
      data: { season: season.id, teamName: shape.name, nameKey: shape.key, pinHash: hash, pinSalt: salt, pinSetAt: new Date(now).toISOString(), mustChangePin: false, disabled: false },
      overrideAccess: true, context: CTX,
    })
    await revalidatePaths([], undefined, [FANTASY_TAG])
    return { ok: true, entry: toEntryPublic(doc as unknown as EntrySecrets), issuedAt: now }
  } catch {
    // The unique (season, nameKey) index caught a parallel join of the same name: same message as any other taken name.
    return { ok: false, message: NAME_UNAVAILABLE }
  }
}

const safeEqualHex = (a: string, b: string): boolean => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Team name plus PIN, or team name plus a one-time add-a-device code (`kind: 'code'`). Every failure (unknown name, wrong PIN, wrong
 * code, disabled team) returns the same message; a lock returns the lock message. The throttle slot is taken BEFORE the secret is
 * checked, so a parallel burst cannot test more guesses than the limit allows. A remembered device never comes through here.
 */
export async function identifyEntry(payload: Payload, ctx: JoinCtx, season: FantasySeason, input: { teamName: unknown; secret: unknown; kind: 'pin' | 'code' }): Promise<AuthResult> {
  const typed = typeof input.teamName === 'string' ? input.teamName : ''
  const secret = typeof input.secret === 'string' ? input.secret.trim() : ''
  const shape = typed.length <= 80 ? checkNameShape(typed) : ({ ok: false } as const)
  const shaped = shape.ok && looksLikeFantasyPin(secret)
  if (!(await ipHit(payload, 'fantasy', ctx.ip)).allowed) return LOCKED
  if ((await isLocked(payload, linkKey(ctx.linkVersion))).allowed === false) return LOCKED

  const entry = shape.ok ? await entryByKey(payload, season.id, shape.key) : null
  const live = entry && !entry.disabled ? entry : null
  const base = live ? entryKey(ctx.linkVersion, live.id) : bucketKey(ctx.linkVersion, shape.ok ? shape.key : '-')
  const key = input.kind === 'code' ? `${base}:code` : base
  if (!(await hit(payload, key, input.kind === 'code' ? CODE_RULE : ENTRY_RULE)).allowed) return LOCKED

  let ok = false
  if (shaped && live) {
    if (input.kind === 'pin') ok = await verifyPin(secret, { hash: live.pinHash, salt: live.pinSalt })
    else {
      // The code is checked with the same cost as a PIN so the two look alike.
      await dummyVerify(secret)
      const fresh = live.deviceCodeHash && live.deviceCodeExpires && new Date(live.deviceCodeExpires).getTime() > Date.now()
      ok = Boolean(fresh && safeEqualHex(live.deviceCodeHash!, hashDeviceCode(secret)))
    }
  } else {
    await dummyVerify(secret || '000000')
  }

  if (ok && live) {
    await clear(payload, key)
    const now = Date.now()
    if (input.kind === 'code') await payload.update({ collection: 'fantasy-entries', id: live.id, data: { deviceCodeHash: null, deviceCodeExpires: null }, overrideAccess: true, context: CTX })
    return { ok: true, entry: toEntryPublic(live), issuedAt: now }
  }
  // A failure also counts against the whole link.
  if (!(await hit(payload, linkKey(ctx.linkVersion), LINK_RULE)).allowed) return LOCKED
  return FAIL
}

/** The manager behind a remembered-device cookie, or null (tampered, rotated link, disabled, removed, PIN changed since). */
export async function rememberedEntry(payload: Payload, raw: string | undefined | null, season: FantasySeason, linkVersion: number, now: number = Date.now()): Promise<{ entry: EntryPublic; cookie: FantasyCookie } | null> {
  const cookie = verifyFantasyCookie(raw, now)
  if (!cookie || cookie.linkVersion !== linkVersion) return null
  const d = await payload.findByID({ collection: 'fantasy-entries', id: cookie.entryId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!d || idOf((d as unknown as EntrySecrets).season) !== season.id) return null
  const row = d as unknown as EntrySecrets
  if (!cookieStillValid(cookie, row, linkVersion)) return null
  return { entry: toEntryPublic(row), cookie }
}

/** Change PIN from a signed-in device: the current PIN is re-entered and counts against the same per-manager throttle. */
export async function changePin(payload: Payload, ctx: JoinCtx, season: FantasySeason, entryId: number, input: { current: unknown; pin: unknown; again: unknown }): Promise<AuthResult> {
  if (!(await ipHit(payload, 'fantasy', ctx.ip)).allowed) return LOCKED
  const next = checkNewPin(input.pin, input.again)
  const d = await payload.findByID({ collection: 'fantasy-entries', id: entryId, depth: 0, overrideAccess: true }).catch(() => null)
  const row = d as unknown as EntrySecrets | null
  if (!row || idOf(row.season) !== season.id || row.disabled) return FAIL
  const key = entryKey(ctx.linkVersion, row.id)
  if (!(await hit(payload, key, ENTRY_RULE)).allowed) return LOCKED
  const current = typeof input.current === 'string' ? input.current.trim() : ''
  const good = looksLikeFantasyPin(current) ? await verifyPin(current, { hash: row.pinHash, salt: row.pinSalt }) : await dummyVerify('000000')
  if (!good) {
    if (!(await hit(payload, linkKey(ctx.linkVersion), LINK_RULE)).allowed) return LOCKED
    return { ok: false, message: 'Your current PIN is not right.' }
  }
  if (!next.ok) return { ok: false, message: next.message }
  await clear(payload, key)
  const { hash, salt } = await hashPin(next.pin)
  const now = Date.now()
  const doc = await payload.update({ collection: 'fantasy-entries', id: row.id, data: { pinHash: hash, pinSalt: salt, pinSetAt: new Date(now).toISOString(), mustChangePin: false, deviceCodeHash: null, deviceCodeExpires: null }, overrideAccess: true, context: CTX })
  return { ok: true, entry: toEntryPublic(doc as unknown as EntrySecrets), issuedAt: now }
}

/** A forced change after a committee reset: the temporary PIN was just used to sign in on this device, so it is the "current" PIN. Same checks as `changePin`. */
export const replaceTemporaryPin = changePin

/** Generate a one-time code for adding another device. The old code is voided. Returns the code once; only a hash is stored. */
export async function issueDeviceCode(payload: Payload, season: FantasySeason, entryId: number, now: Date = new Date()): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; message: string }> {
  const d = await payload.findByID({ collection: 'fantasy-entries', id: entryId, depth: 0, overrideAccess: true }).catch(() => null)
  const row = d as unknown as EntrySecrets | null
  if (!row || idOf(row.season) !== season.id || row.disabled) return { ok: false, message: 'Please sign in again.' }
  const code = newDeviceCode()
  const expires = deviceCodeExpiry(now)
  await payload.update({ collection: 'fantasy-entries', id: row.id, data: { deviceCodeHash: hashDeviceCode(code), deviceCodeExpires: expires.toISOString() }, overrideAccess: true, context: CTX })
  return { ok: true, code, expiresAt: expires.toISOString() }
}

export const TEAM_NAME_HELP = `${FANTASY.teamNameMin} to ${FANTASY.teamNameMax} characters. Do not use a surname or a child's name. The team name can appear on the leaderboard.`
export { nameKeyOf }
