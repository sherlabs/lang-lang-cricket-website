/**
 * Device memory for the RSVP poll — no logins, just one httpOnly cookie holding the
 * person's name/email and the edit token of every RSVP made from this device, keyed
 * by `<eventId>:<occurrenceISO>`. Written only by server actions, read only on the
 * server (next/headers cookies()) and passed down as props.
 *
 * Pure helpers live here (no `'use server'`) so they can be unit-tested and so a
 * `'use server'` module never has to export a non-async value.
 */
import { COOKIE_PREFIX } from '@/config/site'

export const RSVP_COOKIE = `${COOKIE_PREFIX}_rsvps`

/** Newest entries win — once past this many, the oldest are dropped. */
export const RSVP_COOKIE_MAX_ENTRIES = 30

export const RSVP_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type RsvpMemory = {
  name: string
  email: string
  /** `rsvpKey(...)` → editToken, in insertion order (oldest first). */
  rsvps: Record<string, string>
}

export const EMPTY_RSVP_MEMORY: RsvpMemory = { name: '', email: '', rsvps: {} }

/** Cookie attributes shared by every writer so the flags can't drift between actions. */
export function rsvpCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: RSVP_COOKIE_MAX_AGE,
  }
}

export function rsvpKey(eventId: number, occurrenceDate: Date): string {
  return `${eventId}:${occurrenceDate.toISOString()}`
}

/** Anything malformed — bad JSON, wrong shape, non-string values — is treated as an empty memory. */
export function parseRsvpCookie(raw: string | undefined | null): RsvpMemory {
  if (!raw) return { ...EMPTY_RSVP_MEMORY, rsvps: {} }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...EMPTY_RSVP_MEMORY, rsvps: {} }
    const obj = parsed as Record<string, unknown>
    const rsvps: Record<string, string> = {}
    if (obj.rsvps && typeof obj.rsvps === 'object' && !Array.isArray(obj.rsvps)) {
      for (const [key, token] of Object.entries(obj.rsvps as Record<string, unknown>)) {
        if (typeof token === 'string' && token) rsvps[key] = token
      }
    }
    return {
      name: typeof obj.name === 'string' ? obj.name : '',
      email: typeof obj.email === 'string' ? obj.email : '',
      rsvps,
    }
  } catch {
    return { ...EMPTY_RSVP_MEMORY, rsvps: {} }
  }
}

export function serializeRsvpCookie(memory: RsvpMemory): string {
  return JSON.stringify({ name: memory.name, email: memory.email, rsvps: memory.rsvps })
}

/**
 * Records (or re-records) the token for `key` as the newest entry and remembers the
 * name/email, dropping the oldest entries past the cap. Returns a new object.
 */
export function upsertRsvpMemory(
  memory: RsvpMemory,
  key: string,
  editToken: string,
  details: { name: string; email: string }
): RsvpMemory {
  // Delete first so a re-vote moves the key to the end (newest) instead of keeping its old slot.
  const rest = Object.entries(memory.rsvps).filter(([k]) => k !== key)
  rest.push([key, editToken])
  const kept = rest.slice(Math.max(0, rest.length - RSVP_COOKIE_MAX_ENTRIES))
  return { name: details.name, email: details.email, rsvps: Object.fromEntries(kept) }
}

/** Forgets every entry pointing at `editToken` (a cancelled RSVP). Returns a new object. */
export function removeRsvpToken(memory: RsvpMemory, editToken: string): RsvpMemory {
  return {
    ...memory,
    rsvps: Object.fromEntries(Object.entries(memory.rsvps).filter(([, token]) => token !== editToken)),
  }
}
