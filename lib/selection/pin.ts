import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { AVAILABILITY } from '@/config/site'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'

/**
 * PINs for the no-login availability link (announce-teams spec 4.2). scrypt (Node crypto, no new dependency) over
 * `pepper + pin`: the pepper is HKDF-derived from PAYLOAD_SECRET, so a stolen database without the secret cannot be
 * brute-forced, and each row has its own salt. The cost is kept near 30 to 60 ms because verification runs once per candidate
 * player on every attempt. Honest limit (stated in the docs): a 4-digit PIN has 10,000 values and the last four digits of a
 * phone are known to teammates and families, so the real controls are the throttles; a manual 6-digit PIN is stronger.
 */
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const
const KEY_LEN = 32

const DUMMY_SALT = Buffer.alloc(16, 7)

const pepper = (secret?: string): string => deriveKey(HKDF_LABELS.pepper, secret).toString('hex')

const derive = (secretText: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(secretText, salt, KEY_LEN, PARAMS, (err, key) => (err ? reject(err) : resolve(key))))

export type PinHash = { hash: string; salt: string }

export async function hashPin(pin: string, secret?: string): Promise<PinHash> {
  const salt = randomBytes(16)
  const key = await derive(pepper(secret) + pin, salt)
  return { hash: key.toString('hex'), salt: salt.toString('hex') }
}

/** Constant-time check of `pin` against a stored hash and salt. A missing or malformed hash never verifies (but still costs one derivation). */
export async function verifyPin(pin: string, stored: { hash?: string | null; salt?: string | null } | null | undefined, secret?: string): Promise<boolean> {
  const salt = stored?.salt && /^[0-9a-f]{32}$/.test(stored.salt) ? Buffer.from(stored.salt, 'hex') : DUMMY_SALT
  const key = await derive(pepper(secret) + pin, salt)
  const want = stored?.hash && /^[0-9a-f]{64}$/.test(stored.hash) ? Buffer.from(stored.hash, 'hex') : null
  if (!want || salt === DUMMY_SALT) return false
  return want.length === key.length && timingSafeEqual(want, key)
}

/** Burns the same time as a real check (for a name that matches nobody, so unknown and known names answer alike). */
export async function dummyVerify(pin: string, secret?: string): Promise<false> {
  await derive(pepper(secret) + pin, DUMMY_SALT)
  return false
}

/** A manual PIN: 4 to 6 digits, nothing else. Returns the PIN or null. */
export function validPin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return new RegExp(`^\\d{${AVAILABILITY.pinMin},${AVAILABILITY.pinMax}}$`).test(t) ? t : null
}

/** A PIN-shaped input (digits only). Anything else typed in the PIN box is read as a one-time code. */
export const looksLikePin = (raw: string): boolean => /^\d+$/.test(raw.trim())

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const LETTERS = 'abcdefghjkmnpqrstuvwxyz'

/** A one-time code a selector reads out to a player: 8 characters, no look-alikes (about 40 bits). */
export function newOneTimeCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  // An all-digit code would read as a PIN (and always fail), so make sure one character is a letter.
  if (/^\d+$/.test(out)) out = LETTERS[bytes[0] % LETTERS.length] + out.slice(1)
  return out
}

/** Codes are high entropy, so a keyed hash (the same pepper) is enough; lower-cased and trimmed so reading it aloud works. */
export function hashOneTimeCode(code: string, secret?: string): string {
  return createHmac('sha256', deriveKey(HKDF_LABELS.pepper, secret)).update(`otc:${code.trim().toLowerCase()}`).digest('hex')
}
