import { isMemberRole, MEMBER_STATUSES, type MemberRole, type MemberStatus } from '@/lib/office/members'
import type { MemberQuery } from '@/lib/office/member-filters'
import { normaliseAddress } from './unsub-token'

/**
 * Who a campaign goes to (wave D spec 9.3). The saved `audience` is this spec and nothing else: enumerated keys and values, never an
 * address, a name or a search term. `parseAudience` is the only way one is built from input, and it drops everything it does not know.
 */
export const SEGMENTS = ['owes-fees', 'volunteers'] as const
export type Segment = (typeof SEGMENTS)[number]
export const SEGMENT_LABELS: Record<Segment, string> = { 'owes-fees': 'Members who owe match fees', volunteers: 'Volunteers' }

export type AudienceSpec = { status: MemberStatus | null; role: MemberRole | null; juniors: boolean; segment: Segment | null }
export const DEFAULT_AUDIENCE: AudienceSpec = { status: 'active', role: null, juniors: false, segment: null }

const str = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')

/** Builds a spec from a form or stored JSON. Unknown keys and values are dropped; a missing status means "current members". */
export function parseAudience(input: unknown): AudienceSpec {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const status = str(o.status)
  const role = str(o.role)
  const segment = str(o.segment)
  return {
    status: status === 'any' ? null : (MEMBER_STATUSES as readonly string[]).includes(status) ? (status as MemberStatus) : 'active',
    role: isMemberRole(role) ? role : null,
    juniors: o.juniors === true || o.juniors === 'on' || o.juniors === 'true' || o.age === 'junior',
    segment: (SEGMENTS as readonly string[]).includes(segment) ? (segment as Segment) : null,
  }
}

/** The same shape the saved JSON takes (status `any` is stored as the word, so it survives a round trip). */
export const audienceJson = (a: AudienceSpec): Record<string, string | boolean> => ({ status: a.status ?? 'any', role: a.role ?? 'any', juniors: a.juniors, segment: a.segment ?? 'none' })

/** The member filter this audience means, so the chips and the builder are the ones the directory uses. */
export const audienceQuery = (a: AudienceSpec): MemberQuery => ({ q: '', status: a.status, role: a.role, juniors: a.juniors, missing: null, page: 1 })

export function describeAudience(a: AudienceSpec, roleLabel: (r: MemberRole) => string): string {
  const parts = [a.status === 'active' ? 'Current members' : a.status === 'past' ? 'Past members' : 'All members']
  if (a.role) parts.push(roleLabel(a.role))
  if (a.juniors) parts.push('juniors')
  if (a.segment) parts.push(SEGMENT_LABELS[a.segment])
  return parts.join(', ')
}

export type Contact = { id: number; email: string | null; firstName: string | null; doNotEmail: boolean; erased: boolean }
export type Candidate = Contact & { junior: boolean; guardians: Contact[] }

export type Recipient = { memberId: number; email: string; firstName: string | null }
export type AudienceCounts = {
  /** Members the filter matched. */
  match: number
  /** Distinct addresses that will get a copy. */
  willReceive: number
  /** Matched members with no usable address (including a junior whose guardians have none). */
  noEmail: number
  /** Matched members whose address is on the unsubscribed list (or whose guardians' are). */
  unsubscribed: number
  /** Matched members marked do-not-email. */
  doNotEmail: number
  /** Juniors without an address of their own who will go to a guardian. */
  viaGuardian: number
  /** Matched members who share an address already counted. */
  duplicates: number
}
export type ResolvedAudience = { recipients: Recipient[]; counts: AudienceCounts; overCap: boolean }

const usable = (c: Contact): boolean => !c.erased && !c.doNotEmail && Boolean(c.email)

/**
 * Turns matched members into distinct addresses (spec 9.3): `doNotEmail` and erased members are removed, a junior without an own
 * address goes to the guardians who have one, addresses deduplicate, unsubscribed addresses are removed. `isSuppressed` is the
 * caller's check against the suppression list. More than `cap` addresses sets `overCap` and the send is refused.
 */
export function resolveAudience(candidates: readonly Candidate[], isSuppressed: (email: string) => boolean, cap: number): ResolvedAudience {
  const counts: AudienceCounts = { match: candidates.length, willReceive: 0, noEmail: 0, unsubscribed: 0, doNotEmail: 0, viaGuardian: 0, duplicates: 0 }
  const seen = new Set<string>()
  const recipients: Recipient[] = []
  for (const m of candidates) {
    if (m.erased) {
      counts.noEmail += 1
      continue
    }
    if (m.doNotEmail) {
      counts.doNotEmail += 1
      continue
    }
    const targets: { id: number; email: string; firstName: string | null }[] = []
    let guardian = false
    if (m.email) targets.push({ id: m.id, email: m.email, firstName: m.firstName })
    else if (m.junior) {
      for (const g of m.guardians) if (usable(g)) targets.push({ id: g.id, email: g.email!, firstName: g.firstName })
      guardian = targets.length > 0
    }
    if (targets.length === 0) {
      counts.noEmail += 1
      continue
    }
    let added = false
    let blocked = false
    let dup = false
    for (const t of targets) {
      const address = normaliseAddress(t.email)
      if (isSuppressed(address)) {
        blocked = true
        continue
      }
      if (seen.has(address)) {
        dup = true
        continue
      }
      seen.add(address)
      recipients.push({ memberId: t.id, email: address, firstName: t.firstName })
      added = true
    }
    if (added) {
      if (guardian) counts.viaGuardian += 1
    } else if (blocked) counts.unsubscribed += 1
    else if (dup) counts.duplicates += 1
  }
  counts.willReceive = recipients.length
  return { recipients, counts, overCap: recipients.length > cap }
}

/** "412 match; 380 will receive; 20 have no email; 12 unsubscribed; 4 juniors will go to a guardian". */
export function previewSentence(c: AudienceCounts): string {
  const parts = [`${c.match} match`, `${c.willReceive} will receive this`, `${c.noEmail} ${c.noEmail === 1 ? 'has' : 'have'} no email`, `${c.unsubscribed} unsubscribed`]
  if (c.doNotEmail) parts.push(`${c.doNotEmail} marked do not email`)
  if (c.duplicates) parts.push(`${c.duplicates} share an address already counted`)
  parts.push(`${c.viaGuardian} ${c.viaGuardian === 1 ? 'junior goes' : 'juniors go'} to a guardian`)
  return parts.join('; ')
}
