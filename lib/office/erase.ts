import 'server-only'
import type { Payload, TypedUser } from 'payload'
import { isAdminUser } from '@/payload/access'
import { scrubMemberRecipients } from '@/lib/email/recipients'
import { writeAudit } from './audit-write'

/**
 * Removing a member's personal details (wave D spec section 1). Blanks every contact field and the typed name, drops the guardian
 * and committee-record links, stamps `erasedAt` (which also bumps the personal link version), keeps the roles, dates and the
 * player link, and writes an audit row. The player link stays so "Add members for players who have none" does not recreate the
 * row, and the player record itself is public site data that this action does not own. Every copy of the person's data held in
 * another table is scrubbed first through a `Scrubber`; if any scrubber cannot run, nothing is blanked.
 */
export type Scrubber = { name: string; run: (payload: Payload, memberId: number) => Promise<void> }

/**
 * Scrubbers for tables that hold copies of member data. A volunteer's availability notes are free text they typed about themselves,
 * so they are blanked (the answer, the week and the hours stay). The email recipient snapshots are registered here too.
 */
export const scrubbers: Scrubber[] = [
  {
    name: 'volunteer availability notes',
    run: async (payload, memberId) => {
      await payload.update({ collection: 'volunteer-availability', where: { member: { equals: memberId } }, data: { note: null }, overrideAccess: true, depth: 0 })
    },
  },
  // The address and first name copied onto each email the member was sent. The unsubscribe list is kept on purpose (spec 1).
  { name: 'email recipient snapshots', run: async (payload, memberId) => scrubMemberRecipients(payload, memberId) },
]

export const ERASED_FIELDS = {
  firstName: null,
  lastName: null,
  preferredName: null,
  email: null,
  phone: null,
  addressLine: null,
  locality: null,
  region: null,
  postalCode: null,
  dateOfBirth: null,
  notes: null,
  person: null,
  guardians: [],
  emergencyContact: { name: null, phone: null, relationship: null },
  status: 'past',
} as const

export type EraseResult = { ok: true } | { ok: false; error: 'forbidden' | 'not-found' | 'scrub-failed' }

export async function eraseMemberDetails(payload: Payload, user: unknown, memberId: number): Promise<EraseResult> {
  if (!isAdminUser(user as never)) return { ok: false, error: 'forbidden' }
  const found = await payload.findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!found) return { ok: false, error: 'not-found' }
  try {
    for (const s of scrubbers) await s.run(payload, memberId)
  } catch (err) {
    console.error('[office] erase refused, a copy of the data could not be scrubbed:', (err as Error).message)
    return { ok: false, error: 'scrub-failed' }
  }
  await payload.update({
    collection: 'members',
    id: memberId,
    data: { ...ERASED_FIELDS, guardians: [], erasedAt: new Date().toISOString() },
    overrideAccess: true,
    depth: 0,
    context: { bumpVolunteerLinks: true },
  })
  await writeAudit(payload, { userId: (user as TypedUser).id, action: 'erase', module: 'members', summary: { scrubbers: scrubbers.length }, rowCount: 1, includedSensitive: false })
  return { ok: true }
}
