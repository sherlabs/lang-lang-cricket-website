/**
 * Cookie holding the most recent RSVP's edit token so the submitter can find their
 * way back. Lives outside `app/events/actions.ts` because a `'use server'` module
 * may only export async functions.
 */
export const RSVP_COOKIE = 'llcc_event_rsvp'

export type RsvpCookie = { eventTitle: string; editToken: string }
