import { isEmailOrEmpty } from '@/payload/fields/validators'

/** RSVP text length caps (spec §3.9); the event-rsvps collection validators enforce the same limits. */
export const RSVP_CAPS = { name: 100, email: 200, note: 1000 } as const

/**
 * The first cap or email-format error for an RSVP's free-text fields, or null. Shared by
 * submitRsvp and updateRsvpByToken. The email rule is the collection validator's, checked
 * first so a value the browser's type="email" accepts (e.g. `sam@localhost`) returns a
 * message instead of throwing a ValidationError on write.
 */
export function rsvpTextError(fields: { name: string; email: string; note: string }): string | null {
  if (fields.name.length > RSVP_CAPS.name) return `Name must be ${RSVP_CAPS.name} characters or fewer.`
  if (fields.email.length > RSVP_CAPS.email) return `Email must be ${RSVP_CAPS.email} characters or fewer.`
  if (fields.note.length > RSVP_CAPS.note) return `Note must be ${RSVP_CAPS.note} characters or fewer.`
  if (!isEmailOrEmpty(fields.email)) return 'Enter a valid email address, or leave it empty.'
  return null
}
