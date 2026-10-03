import type { PayloadRequest } from 'payload'

/**
 * Custom validators (spec §3 conventions): each one short-circuits under `context.etl`,
 * so legacy rows import verbatim. Returned as `validate` functions for Payload fields.
 */
type Ctx = { req?: Partial<PayloadRequest> }

const isEtl = (ctx: Ctx | undefined) => ctx?.req?.context?.etl === true

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailOrEmpty(value: unknown): boolean {
  return value == null || value === '' || (typeof value === 'string' && EMAIL_RE.test(value.trim()))
}

export function isHttpUrlOrEmpty(value: unknown): boolean {
  if (value == null || value === '') return true
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export const emailOrEmpty = (value: unknown, ctx?: Ctx): true | string =>
  isEtl(ctx) || isEmailOrEmpty(value) ? true : 'Enter a valid email address, or leave it empty.'

export const httpUrlOrEmpty = (value: unknown, ctx?: Ctx): true | string =>
  isEtl(ctx) || isHttpUrlOrEmpty(value) ? true : 'Enter a full link starting with http:// or https://, or leave it empty.'

/** Required text with a length cap that the ETL can bypass (built-in maxLength cannot be). */
export const maxChars =
  (max: number, { required = false } = {}) =>
  (value: unknown, ctx?: Ctx): true | string => {
    if (isEtl(ctx)) return true
    const s = typeof value === 'string' ? value : ''
    if (required && !s.trim()) return 'This field is required.'
    return s.length <= max ? true : `Keep this to ${max} characters or fewer.`
  }
