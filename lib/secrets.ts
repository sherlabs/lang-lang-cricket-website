import { hkdfSync } from 'node:crypto'

/**
 * Every derived secret uses HKDF from `PAYLOAD_SECRET` with its own label, so one leaked derivation never exposes another and
 * the root secret is never used as a raw HMAC key. `tests/secrets.test.ts` asserts the labels are distinct.
 */
export const HKDF_LABELS = {
  oauth: 'selector-oauth',
  pepper: 'selector-pepper',
  throttle: 'throttle-key',
  availLink: 'avail-link',
  availCookie: 'avail-cookie',
  socialImage: 'social-image',
} as const

export type SecretLabel = (typeof HKDF_LABELS)[keyof typeof HKDF_LABELS]

export function deriveKey(label: SecretLabel, secret: string | undefined = process.env.PAYLOAD_SECRET): Buffer {
  if (!secret) throw new Error('[secrets] PAYLOAD_SECRET is required')
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), label, 32))
}
