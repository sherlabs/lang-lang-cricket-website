import { looksLikeCardNumber } from './card'

/** Fields normalised the same way on every write path (admin form, quick add, link-players). Pure. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const trimOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export const normaliseEmail = (v: unknown): string | null => {
  const t = trimOrNull(v)
  return t === null ? null : t.toLowerCase()
}

export const isValidEmail = (v: string): boolean => v.length <= 254 && EMAIL.test(v)

/** Phone: trimmed, inner runs of spaces collapsed. Validity is deliberately loose (clubs record all kinds of numbers). */
export const normalisePhone = (v: unknown): string | null => {
  const t = trimOrNull(v)
  return t === null ? null : t.replace(/\s+/g, ' ')
}

export type NewMemberInput = { firstName: string; lastName: string; roles: string[]; email: string | null; phone: string | null }

export type NewMemberResult = { ok: true; value: NewMemberInput } | { ok: false; code: MemberFormError }

export const MEMBER_FORM_ERRORS = ['name', 'name-long', 'roles', 'email', 'phone', 'save', 'forbidden', 'bad-id'] as const
export type MemberFormError = (typeof MEMBER_FORM_ERRORS)[number]

/** The quick-add form (name, roles, email, phone and nothing else). Server-side validation; the form's own checks are a convenience. */
export function validateQuickAdd(raw: { firstName?: unknown; lastName?: unknown; roles?: unknown; email?: unknown; phone?: unknown }, allowedRoles: readonly string[]): NewMemberResult {
  const firstName = trimOrNull(raw.firstName)
  const lastName = trimOrNull(raw.lastName)
  if (!firstName || !lastName) return { ok: false, code: 'name' }
  if (firstName.length > 100 || lastName.length > 100) return { ok: false, code: 'name-long' }
  const list = Array.isArray(raw.roles) ? raw.roles : typeof raw.roles === 'string' ? [raw.roles] : []
  const roles = [...new Set(list.filter((r): r is string => typeof r === 'string' && allowedRoles.includes(r)))]
  if (roles.length === 0) return { ok: false, code: 'roles' }
  const email = normaliseEmail(raw.email)
  if (email !== null && !isValidEmail(email)) return { ok: false, code: 'email' }
  const phone = normalisePhone(raw.phone)
  if (phone !== null && (phone.length > 40 || looksLikeCardNumber(phone))) return { ok: false, code: 'phone' }
  return { ok: true, value: { firstName, lastName, roles, email, phone } }
}
