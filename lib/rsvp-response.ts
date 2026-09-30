/** The two poll answers an RSVP row can hold (`event_rsvps.response`). */
export type RsvpResponse = 'yes' | 'no'

export function isRsvpResponse(value: unknown): value is RsvpResponse {
  return value === 'yes' || value === 'no'
}

/** Public-safe counts for one occurrence — never names, emails or notes. */
export type RsvpTally = { yes: number; no: number }
