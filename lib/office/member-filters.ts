import type { Where } from 'payload'
import { isMemberRole, MEMBER_STATUSES, type MemberRole, type MemberStatus } from './members'

export const PAGE_SIZE = 50
export const MISSING_KEYS = ['email', 'phone', 'both', 'guardian'] as const
export type MissingKey = (typeof MISSING_KEYS)[number]

export type MemberQuery = {
  q: string
  status: MemberStatus | null
  role: MemberRole | null
  juniors: boolean
  missing: MissingKey | null
  page: number
}

type Params = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** Parse the address into a safe query. Unknown keys and unknown values are dropped; nothing from the address reaches a `Where` unchecked. */
export function parseMemberQuery(params: Params): MemberQuery {
  const q = first(params.q).replace(/\s+/g, ' ').trim().slice(0, 80)
  const status = first(params.status)
  const role = first(params.role)
  const missing = first(params.missing)
  const page = Number(first(params.page))
  return {
    q,
    status: (MEMBER_STATUSES as readonly string[]).includes(status) ? (status as MemberStatus) : null,
    role: isMemberRole(role) ? role : null,
    juniors: first(params.age) === 'junior',
    missing: (MISSING_KEYS as readonly string[]).includes(missing) ? (missing as MissingKey) : null,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  }
}

/** `YYYY-MM-DD` eighteen years before `today` (a date of birth after this is a junior). */
export function juniorCutoff(today: string): string {
  const m = /^(\d{4})(-\d{2}-\d{2})$/.exec(today)
  return m ? `${Number(m[1]) - 18}${m[2]}` : today
}

/** The query as a `Where`. `today` is the club date, so "junior" matches `isJunior` from the socials rule. */
export function memberWhere(query: MemberQuery, today: string): Where {
  const and: Where[] = []
  if (query.status) and.push({ status: { equals: query.status } })
  if (query.role) and.push({ roles: { equals: query.role } })
  const junior: Where = { or: [{ dateOfBirth: { greater_than: juniorCutoff(today) } }, { 'player.isJunior': { equals: true } }] }
  if (query.juniors || query.missing === 'guardian') and.push(junior)
  if (query.missing === 'email') and.push({ email: { exists: false } })
  if (query.missing === 'phone') and.push({ phone: { exists: false } })
  if (query.missing === 'both') and.push({ email: { exists: false } }, { phone: { exists: false } })
  if (query.missing === 'guardian') and.push({ guardians: { exists: false } })
  if (query.q) {
    and.push({ or: [{ displayName: { contains: query.q } }, { firstName: { contains: query.q } }, { lastName: { contains: query.q } }, { email: { contains: query.q } }] })
  }
  return and.length ? { and } : {}
}

/** The query as an address (only values that differ from the defaults), used by chips, paging and the export form. */
export function queryString(query: Partial<MemberQuery>): string {
  const p = new URLSearchParams()
  if (query.q) p.set('q', query.q)
  if (query.status) p.set('status', query.status)
  if (query.role) p.set('role', query.role)
  if (query.juniors) p.set('age', 'junior')
  if (query.missing) p.set('missing', query.missing)
  if (query.page && query.page > 1) p.set('page', String(query.page))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Filter keys that go in an audit summary: enumerated values only, never the search text. */
export function auditFilterSummary(query: MemberQuery): Record<string, string | boolean> {
  return { status: query.status ?? 'any', role: query.role ?? 'any', juniors: query.juniors, missing: query.missing ?? 'none', hasSearch: query.q !== '' }
}
