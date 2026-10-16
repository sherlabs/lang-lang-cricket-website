import { needsGuard } from '../stats/csv'
import { NETS } from './constants'

/**
 * A guest's name, as typed at the nets (wave B spec 4.2): control characters stripped, spaces collapsed, a leading spreadsheet
 * formula prefix removed (the same `needsGuard` rule the CSV exporter uses, so a name can never become a formula), at most
 * `NETS.guestNameMax` characters. Returns null for a name with nothing left. The name is plain text and is escaped on render.
 */
export function sanitiseGuestName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ').replace(/\s+/g, ' ').trim()
  // A formula prefix is removed, not escaped: a guest name has no reason to start with one.
  while (s && needsGuard(s)) s = s.replace(/^[\s=+\-@|'\uff1d\uff0b\uff0d\uff20]+/, '').trim()
  s = s.slice(0, NETS.guestNameMax).trim()
  return s || null
}

/** The stable key of a guest within a session: the same person typed twice is one row. */
export const guestKey = (name: string): string => `guest:${name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()}`
export const playerKey = (playerId: number): string => `player:${playerId}`
