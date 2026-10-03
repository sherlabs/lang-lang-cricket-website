/** The two poll answers an RSVP row can hold (`event_rsvps.response`). */
export type RsvpResponse = 'yes' | 'no'

export function isRsvpResponse(value: unknown): value is RsvpResponse {
  return value === 'yes' || value === 'no'
}

/** Public-safe counts for one occurrence — never names, emails or notes. */
export type RsvpTally = { yes: number; no: number }

/** Select options for the `event-rsvps.response` field (admin labels). */
export const RSVP_RESPONSE_OPTIONS: { label: string; value: RsvpResponse }[] = [
  { label: 'Going', value: 'yes' },
  { label: 'Not going', value: 'no' },
]
