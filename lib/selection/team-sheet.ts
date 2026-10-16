/**
 * Pure team-sheet rules (announce-teams spec 5.1): slot and guest-name validation, size, the published snapshot and the diff
 * between two snapshots. No database, React or Next imports, so the server actions, the publish step and the unit tests share them.
 */
export const XI_SIZES = [11, 12, 13, 0] as const
export type XiSize = (typeof XI_SIZES)[number]
export const SIZE_LABEL: Record<XiSize, string> = { 11: '11 players', 12: '12 players', 13: '13 players', 0: 'Open (no limit)' }
export const isXiSize = (v: unknown): v is XiSize => typeof v === 'number' && (XI_SIZES as readonly number[]).includes(v)

/** A slot as stored: exactly one of `player` and `guestName`. `order` is 1-based. */
export type Slot = { player?: number | null; guestName?: string | null; order: number; isCaptain: boolean; isKeeper: boolean }

export const GUEST_NAME_MIN = 2
export const GUEST_NAME_MAX = 40
const GUEST_NAME_PATTERN = /^\p{L}[\p{L} '’-]*$/u

export type GuestNameResult = { ok: true; name: string } | { ok: false; error: string }

/**
 * A guest (a fill-in with no player record) is published to the public page, so the name is strict: 2 to 40 characters, letters,
 * spaces, apostrophes and hyphens; no digits, no `@`, nothing phone-like.
 */
export function validateGuestName(raw: unknown): GuestNameResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Type the guest’s name.' }
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < GUEST_NAME_MIN) return { ok: false, error: 'A guest’s name needs at least 2 letters.' }
  if (name.length > GUEST_NAME_MAX) return { ok: false, error: `Keep the guest’s name under ${GUEST_NAME_MAX + 1} characters.` }
  if (/\d/.test(name) || name.includes('@')) return { ok: false, error: 'A guest’s name has letters only (no numbers or @). It is shown on the public site.' }
  if (!GUEST_NAME_PATTERN.test(name)) return { ok: false, error: 'A guest’s name has letters, spaces, apostrophes and hyphens only.' }
  return { ok: true, name }
}

/** Slots in batting order, renumbered 1..n with the keeper and captain tags kept to one each (the first one wins). */
export function normaliseSlots(slots: readonly Slot[]): Slot[] {
  const sorted = [...slots].sort((a, b) => a.order - b.order)
  let captain = false
  let keeper = false
  return sorted.map((s, i) => {
    const isCaptain = Boolean(s.isCaptain) && !captain
    const isKeeper = Boolean(s.isKeeper) && !keeper
    captain ||= isCaptain
    keeper ||= isKeeper
    return {
      ...(s.player != null ? { player: s.player } : {}),
      ...(s.guestName != null && s.player == null ? { guestName: s.guestName } : {}),
      order: i + 1,
      isCaptain,
      isKeeper,
    }
  })
}

export type SlotProblem = { index: number; message: string }

/** The errors that stop a save: both or neither of player and guest, a bad guest name, a duplicate player, more slots than a fixed size. */
export function validateSlots(slots: readonly Slot[], size: XiSize): SlotProblem[] {
  const out: SlotProblem[] = []
  const seen = new Set<number>()
  slots.forEach((s, index) => {
    const hasPlayer = s.player != null
    const hasGuest = typeof s.guestName === 'string' && s.guestName !== ''
    if (hasPlayer === hasGuest) out.push({ index, message: 'Each place has a player or a guest name, not both.' })
    if (hasGuest) {
      const g = validateGuestName(s.guestName)
      if (!g.ok) out.push({ index, message: g.error })
    }
    if (hasPlayer) {
      if (seen.has(s.player!)) out.push({ index, message: 'That player is already in the team.' })
      seen.add(s.player!)
    }
  })
  if (size > 0 && slots.length > size) out.push({ index: -1, message: `A team of ${size} has at most ${size} places.` })
  return out
}

/** What a published team is, frozen at publish time. Names are resolved when it is shown (so a hidden player can be withheld). */
export type SnapshotSlot = { playerId?: number; guestName?: string; order: number; isCaptain: boolean; isKeeper: boolean }
export type Snapshot = { revision: number; publishedAt: string; size: XiSize; slots: SnapshotSlot[] }

export function buildSnapshot(sheet: { slots: readonly Slot[]; size: XiSize; revision: number }, publishedAt: string): Snapshot {
  return {
    revision: sheet.revision,
    publishedAt,
    size: sheet.size,
    slots: normaliseSlots(sheet.slots).map((s) => ({
      ...(s.player != null ? { playerId: s.player } : {}),
      ...(s.guestName != null && s.player == null ? { guestName: s.guestName } : {}),
      order: s.order,
      isCaptain: s.isCaptain,
      isKeeper: s.isKeeper,
    })),
  }
}

/** Reads a stored snapshot defensively (it is JSON written by code, but read as untrusted). Null when it is not a usable snapshot. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.slots) || typeof r.publishedAt !== 'string') return null
  const slots: SnapshotSlot[] = []
  for (const s of r.slots) {
    if (!s || typeof s !== 'object') return null
    const o = s as Record<string, unknown>
    const order = Number(o.order)
    if (!Number.isInteger(order) || order < 1) return null
    const playerId = typeof o.playerId === 'number' ? o.playerId : undefined
    const guestName = typeof o.guestName === 'string' ? o.guestName : undefined
    if (playerId == null && guestName == null) return null
    slots.push({ ...(playerId != null ? { playerId } : {}), ...(guestName != null && playerId == null ? { guestName } : {}), order, isCaptain: Boolean(o.isCaptain), isKeeper: Boolean(o.isKeeper) })
  }
  const size = isXiSize(r.size) ? r.size : 0
  return { revision: Number(r.revision) || 0, publishedAt: r.publishedAt, size, slots: slots.sort((a, b) => a.order - b.order) }
}

const keyOf = (s: { playerId?: number; guestName?: string }): string => (s.playerId != null ? `p:${s.playerId}` : `g:${(s.guestName ?? '').toLowerCase()}`)

/** True when the working sheet says exactly what the published snapshot says (so "Published" and not "changes not published"). */
export function sameAsSnapshot(sheet: { slots: readonly Slot[]; size: XiSize }, snap: Snapshot | null): boolean {
  if (!snap) return false
  const a = buildSnapshot({ ...sheet, revision: 0 }, '').slots
  if (a.length !== snap.slots.length || sheet.size !== snap.size) return false
  return a.every((s, i) => keyOf(s) === keyOf(snap.slots[i]) && s.isCaptain === snap.slots[i].isCaptain && s.isKeeper === snap.slots[i].isKeeper)
}

export type SnapshotDiff = {
  added: SnapshotSlot[]
  removed: SnapshotSlot[]
  moved: { slot: SnapshotSlot; from: number }[]
  tagged: { slot: SnapshotSlot; captain?: boolean; keeper?: boolean }[]
  changed: boolean
}

/** What changed between the published team and a new one: in, out, batting order moved, captain or keeper tag changed. */
export function diffSnapshots(prev: Snapshot | null, next: { slots: readonly SnapshotSlot[] }): SnapshotDiff {
  const before = new Map((prev?.slots ?? []).map((s) => [keyOf(s), s]))
  const after = new Map(next.slots.map((s) => [keyOf(s), s]))
  const added = next.slots.filter((s) => !before.has(keyOf(s)))
  const removed = (prev?.slots ?? []).filter((s) => !after.has(keyOf(s)))
  const moved: SnapshotDiff['moved'] = []
  const tagged: SnapshotDiff['tagged'] = []
  for (const s of next.slots) {
    const old = before.get(keyOf(s))
    if (!old) continue
    if (old.order !== s.order) moved.push({ slot: s, from: old.order })
    if (old.isCaptain !== s.isCaptain || old.isKeeper !== s.isKeeper) tagged.push({ slot: s, ...(old.isCaptain !== s.isCaptain ? { captain: s.isCaptain } : {}), ...(old.isKeeper !== s.isKeeper ? { keeper: s.isKeeper } : {}) })
  }
  return { added, removed, moved, tagged, changed: added.length + removed.length + moved.length + tagged.length > 0 }
}

/** The diff as short plain sentences (for the selector's "what changed" list and the announcement body). */
export function describeDiff(diff: SnapshotDiff, nameOf: (s: SnapshotSlot) => string): string[] {
  return [
    ...diff.added.map((s) => `${nameOf(s)} is in`),
    ...diff.removed.map((s) => `${nameOf(s)} is out`),
    ...diff.moved.map((m) => `${nameOf(m.slot)} moves from ${m.from} to ${m.slot.order}`),
    ...diff.tagged.map((t) => `${nameOf(t.slot)}: ${[t.captain != null ? (t.captain ? 'now captain' : 'no longer captain') : '', t.keeper != null ? (t.keeper ? 'now keeper' : 'no longer keeper') : ''].filter(Boolean).join(', ')}`),
  ]
}
