import { createHmac, randomInt } from 'node:crypto'
import { FANTASY } from '@/config/site'
import { deriveKey, HKDF_LABELS } from '@/lib/secrets'

/**
 * PINs and one-time device codes for fantasy managers (wave F spec 4.4). Exactly six digits, chosen by the manager, and never
 * on the banned list. The honest limit is stated in the documentation: about a million values, so the throttles are the control.
 */
const SIX = new RegExp(`^\\d{${FANTASY.pinLength}}$`)

/** All one digit, straight runs up or down, a repeated pair or triple (121212, 123123), and the usual favourites. */
const COMMON = new Set(['123456', '654321', '012345', '543210', '112233', '121212', '123321', '696969', '159753', '147258', '102030', '123123', '456456', '789789', '654654', '131313', '252525', '202020', '101010', '246810', '135791', '111222', '000111', '123000', '123654', '098765', '987654', '456789', '345678', '234567', '567890'])

export function isBannedPin(pin: string): boolean {
  if (!SIX.test(pin)) return true
  if (/^(\d)\1+$/.test(pin)) return true
  if (COMMON.has(pin)) return true
  const d = [...pin].map(Number)
  const step = d.slice(1).map((x, i) => x - d[i])
  if (step.every((s) => s === 1) || step.every((s) => s === -1)) return true
  const half = FANTASY.pinLength / 2
  if (pin.slice(0, half) === pin.slice(half)) return true
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) return true
  return false
}

export type PinCheck = { ok: true; pin: string } | { ok: false; message: string }

/** A new PIN from a form: six digits, typed twice, not on the banned list. */
export function checkNewPin(pin: unknown, again: unknown): PinCheck {
  if (typeof pin !== 'string' || !SIX.test(pin.trim())) return { ok: false, message: `Your PIN must be ${FANTASY.pinLength} digits.` }
  if (typeof again !== 'string' || again.trim() !== pin.trim()) return { ok: false, message: 'The two PINs do not match.' }
  if (isBannedPin(pin.trim())) return { ok: false, message: 'Choose a PIN that is hard to guess.' }
  return { ok: true, pin: pin.trim() }
}

/** A PIN typed to sign in (only the shape is checked; whether it is a good PIN is decided when it was chosen). */
export const looksLikeFantasyPin = (raw: unknown): raw is string => typeof raw === 'string' && SIX.test(raw.trim())

/** A temporary PIN for a committee reset: six random digits that are not banned. Shown once to the person who pressed the button. */
export function temporaryPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(FANTASY.pinLength, '0')
    if (!isBannedPin(pin)) return pin
  }
}

/** A one-time "add this device" code: six digits, valid ten minutes, stored only as a keyed hash. */
export function newDeviceCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export const hashDeviceCode = (code: string, secret?: string): string =>
  createHmac('sha256', deriveKey(HKDF_LABELS.pepper, secret)).update(`fantasy-device:${code.trim()}`).digest('hex')

export const deviceCodeExpiry = (now: Date): Date => new Date(now.getTime() + FANTASY.deviceCodeMinutes * 60_000)
