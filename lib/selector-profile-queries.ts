import type { Payload, TypedUser } from 'payload'
import { AVAILABILITY, CLUB_COUNTRY } from '@/config/site'
import { getPayloadClient } from '@/lib/payload/client'
import { assertSelection } from '@/lib/selector-role'
import { normalisePhone, lastFour } from '@/lib/selection/phone'
import { hashOneTimeCode, hashPin, newOneTimeCode, validPin } from '@/lib/selection/pin'
import { idOf } from '@/lib/selection/store'
import { validateCard, type BattingStyle, type BowlingStyle, type CardInput } from '@/lib/selection/card'
import { isStaffUser } from '@/payload/access'

/**
 * Selector-side reads and writes of a player's private details: phone, PIN, one-time code, and the selectors' own role and notes
 * (announce-teams spec 4.2). The one reviewed place where these use `overrideAccess: true`; each function first re-checks that the
 * caller is a selection user. A phone is never logged, and the PIN hash, salt and one-time code never leave this file.
 */
const CTX = { disableRevalidate: true } as const

export type ProfileView = {
  playerId: number
  phone: string | null
  pinSource: 'phone' | 'manual' | null
  hasPin: boolean
  needsManualPin: boolean
  oneTimeCodeActive: boolean
  role: 'batter' | 'bowler' | 'all-rounder' | 'keeper' | null
  canKeep: boolean
  battingStyle: BattingStyle | null
  bowlingStyle: BowlingStyle | null
  /** Empty when the note is for the committee only and the caller is not (see `hasStaffNote`). */
  notes: string
  notesStaffOnly: boolean
  /** A note exists that this caller may not read ("A committee note exists"). */
  hasStaffNote: boolean
}

type Row = { id: number; player: unknown; phone?: string | null; pinHash?: string | null; pinSource?: 'phone' | 'manual' | null; needsManualPin?: boolean | null; otcHash?: string | null; otcExpiresAt?: string | null; role?: ProfileView['role']; canKeep?: boolean | null; battingStyle?: BattingStyle | null; bowlingStyle?: BowlingStyle | null; notes?: string | null; notesStaffOnly?: boolean | null }

async function findRow(payload: Payload, playerId: number): Promise<Row | null> {
  const res = await payload.find({ collection: 'player-selection-profiles', where: { player: { equals: playerId } }, limit: 1, depth: 0, showHiddenFields: true, overrideAccess: true })
  return (res.docs[0] as unknown as Row | undefined) ?? null
}

async function ensureRow(payload: Payload, playerId: number): Promise<Row> {
  const found = await findRow(payload, playerId)
  if (found) return found
  try {
    return (await payload.create({ collection: 'player-selection-profiles', data: { player: playerId } as never, overrideAccess: true, context: CTX })) as unknown as Row
  } catch (err) {
    const again = await findRow(payload, playerId)
    if (again) return again
    throw err
  }
}

/**
 * The server reads with the access override, so field access does not protect a staff-only note here: it is stripped for anyone who
 * is not an admin or editor (wave B spec 4.2). Every read below passes the caller.
 */
const toView = (playerId: number, r: Row | null, staff: boolean): ProfileView => ({
  playerId,
  phone: r?.phone ?? null,
  pinSource: r?.pinHash ? (r.pinSource ?? null) : null,
  hasPin: Boolean(r?.pinHash),
  needsManualPin: Boolean(r?.needsManualPin),
  oneTimeCodeActive: Boolean(r?.otcHash && r.otcExpiresAt && new Date(r.otcExpiresAt).getTime() > Date.now()),
  role: r?.role ?? null,
  canKeep: Boolean(r?.canKeep),
  battingStyle: r?.battingStyle ?? null,
  bowlingStyle: r?.bowlingStyle ?? null,
  notes: r?.notesStaffOnly && !staff ? '' : (r?.notes ?? ''),
  notesStaffOnly: Boolean(r?.notesStaffOnly),
  hasStaffNote: Boolean(r?.notesStaffOnly && !staff && r?.notes),
})

export async function getProfile(user: TypedUser, playerId: number): Promise<ProfileView> {
  assertSelection(user)
  return toView(playerId, await findRow(await getPayloadClient(), playerId), isStaffUser(user))
}

/** Profiles for many players (phones for tap-to-call, role chips). Phones only; nothing secret. */
export async function profilesForPlayers(user: TypedUser, playerIds: readonly number[]): Promise<Map<number, ProfileView>> {
  assertSelection(user)
  const out = new Map<number, ProfileView>()
  if (!playerIds.length) return out
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'player-selection-profiles', where: { player: { in: [...playerIds] } }, limit: playerIds.length, pagination: false, depth: 0, showHiddenFields: true, overrideAccess: true })
  for (const r of res.docs as unknown as Row[]) {
    const id = idOf(r.player)
    if (id != null) out.set(id, toView(id, r, isStaffUser(user)))
  }
  return out
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/**
 * Sets (or clears) the phone. A phone gives the default PIN (its last four digits) unless a selector has set a manual one.
 * Clearing a phone also clears a phone-derived PIN.
 */
export async function savePhone(user: TypedUser, playerId: number, raw: string): Promise<SaveResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await ensureRow(payload, playerId)
  const trimmed = raw.trim()
  if (!trimmed) {
    const data: Record<string, unknown> = { phone: null }
    if (row.pinSource !== 'manual') Object.assign(data, { pinHash: null, pinSalt: null, pinSource: null, pinSetAt: new Date().toISOString() })
    await payload.update({ collection: 'player-selection-profiles', id: row.id, data: data as never, overrideAccess: true, context: CTX })
    return { ok: true }
  }
  const digits = normalisePhone(trimmed, CLUB_COUNTRY)
  if (!digits) return { ok: false, error: 'That phone number does not look right.' }
  const data: Record<string, unknown> = { phone: digits }
  if (row.pinSource !== 'manual' || !row.pinHash) {
    const pin = lastFour(digits)
    if (pin) {
      const { hash, salt } = await hashPin(pin)
      Object.assign(data, { pinHash: hash, pinSalt: salt, pinSource: 'phone', pinSetAt: new Date().toISOString(), needsManualPin: false })
    }
  }
  await payload.update({ collection: 'player-selection-profiles', id: row.id, data: data as never, overrideAccess: true, context: CTX })
  return { ok: true }
}

/** A selector gives a player their own 4 to 6 digit PIN (for a player with no phone, or to settle a clash). */
export async function setManualPin(user: TypedUser, playerId: number, rawPin: string): Promise<SaveResult> {
  assertSelection(user)
  const pin = validPin(rawPin)
  if (!pin) return { ok: false, error: `A PIN is ${AVAILABILITY.pinMin} to ${AVAILABILITY.pinMax} digits.` }
  const payload = await getPayloadClient()
  const row = await ensureRow(payload, playerId)
  const { hash, salt } = await hashPin(pin)
  await payload.update({ collection: 'player-selection-profiles', id: row.id, data: { pinHash: hash, pinSalt: salt, pinSource: 'manual', pinSetAt: new Date().toISOString(), needsManualPin: false } as never, overrideAccess: true, context: CTX })
  return { ok: true }
}

/** Back to the default: the last four digits of the phone, or no PIN when there is no phone. */
export async function clearManualPin(user: TypedUser, playerId: number): Promise<SaveResult> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await findRow(payload, playerId)
  if (!row) return { ok: true }
  const pin = lastFour(row.phone)
  if (pin) {
    const { hash, salt } = await hashPin(pin)
    await payload.update({ collection: 'player-selection-profiles', id: row.id, data: { pinHash: hash, pinSalt: salt, pinSource: 'phone', pinSetAt: new Date().toISOString() } as never, overrideAccess: true, context: CTX })
  } else {
    await payload.update({ collection: 'player-selection-profiles', id: row.id, data: { pinHash: null, pinSalt: null, pinSource: null, pinSetAt: new Date().toISOString() } as never, overrideAccess: true, context: CTX })
  }
  return { ok: true }
}

/** A single-use code, valid 24 hours, that identifies the player without their PIN. Returned once; only its hash is kept. */
export async function issueOneTimeCode(user: TypedUser, playerId: number): Promise<string> {
  assertSelection(user)
  const payload = await getPayloadClient()
  const row = await ensureRow(payload, playerId)
  const code = newOneTimeCode()
  const expires = new Date(Date.now() + AVAILABILITY.oneTimeCodeHours * 3_600_000).toISOString()
  await payload.update({ collection: 'player-selection-profiles', id: row.id, data: { otcHash: hashOneTimeCode(code), otcExpiresAt: expires, pinSetAt: new Date().toISOString() } as never, overrideAccess: true, context: CTX })
  return code
}

/**
 * Saves the card's selector fields (role, can keep, styles, notes), only the keys sent (a form for one section sends only its own).
 * Everything goes through the allowlist in `lib/selection/card.ts`. The staff-only tick is set only by an admin or editor, and a
 * note a selector may not read is never edited or overwritten by one; both are refused, whatever the form posted.
 */
export async function saveSelectorFields(user: TypedUser, playerId: number, input: CardInput): Promise<SaveResult> {
  assertSelection(user)
  const staff = isStaffUser(user)
  const checked = validateCard(input)
  if (!checked.ok) return checked
  const patch: Record<string, unknown> = { ...checked.patch }
  const payload = await getPayloadClient()
  const row = await ensureRow(payload, playerId)
  if (!staff) {
    if ('notesStaffOnly' in patch) return { ok: false, error: 'Only the committee can mark a note as committee only.' }
    if (row.notesStaffOnly && 'notes' in patch) return { ok: false, error: 'A committee note exists on this card. Only the committee can change it.' }
  }
  if (!Object.keys(patch).length) return { ok: true }
  await payload.update({ collection: 'player-selection-profiles', id: row.id, data: patch as never, overrideAccess: true, context: CTX })
  return { ok: true }
}

/** The player card: the player (hidden players included, they are only ever seen inside `/selector`) and their private details. */
export async function getPlayerCard(user: TypedUser, slug: string): Promise<{ player: import('@/lib/selection/store').PlayerLite; profile: ProfileView } | null> {
  assertSelection(user)
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'players', where: { slug: { equals: slug } }, limit: 1, depth: 0, joins: false, overrideAccess: true })
  const doc = res.docs[0]
  if (!doc) return null
  const { toPlayerLite } = await import('@/lib/selection/store')
  const player = toPlayerLite(doc as never)
  return { player, profile: toView(player.id, await findRow(payload, player.id), isStaffUser(user)) }
}
