import { looksLikeCardNumber } from './card'
import { MAX_CENTS, parseMoney, splitEvenly } from './money'
import { isSeasonName } from './season'
import type { PaymentTarget } from './fees'

/**
 * Validation of what the Fees forms post (wave D spec section 4). Pure: each function takes the raw form values and gives either a
 * clean value or a short error code. Server actions call these and then derive everything else (who recorded it, the group id,
 * the totals) themselves; nothing here trusts a hidden field.
 */
export const PAYMENT_METHODS = ['cash', 'bank-transfer', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Cash', 'bank-transfer': 'Bank transfer', other: 'Other' }

export type FeeFormError = 'amount' | 'date' | 'method' | 'card' | 'target' | 'split' | 'payer' | 'note' | 'reason' | 'season' | 'tier' | 'member' | 'scope' | 'forbidden' | 'save' | 'unmatched' | 'closed' | 'not-found'

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const intId = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 && n < 2_000_000_000 ? n : null
}
export const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && Number(m[1]) >= 1990
}

export type RawPayment = {
  memberId: unknown
  amount: unknown
  receivedOn: unknown
  method: unknown
  reference: unknown
  note: unknown
  payerId: unknown
  target: unknown
  splitIds: unknown[]
  /** One share per entry of `splitIds`, same order, as typed amounts. Empty means an even split. */
  splitShares: unknown[]
}

export type CleanPayment = {
  memberId: number
  payerId: number
  amountCents: number
  receivedOn: string
  method: PaymentMethod
  reference: string | null
  note: string | null
  appliesTo: PaymentTarget | null
  /** One entry per member the money is for; a single entry (the member) when not split. */
  shares: { memberId: number; amountCents: number }[]
}

/** `target` is "" (general), `season:<name>`, `charge:<id>` or `match:<id>`. */
export function parseTarget(v: unknown): PaymentTarget | null | 'bad' {
  if (v === '' || v == null) return null
  if (typeof v !== 'string') return 'bad'
  const [kind, ...rest] = v.split(':')
  const value = rest.join(':')
  if (kind === 'season') return isSeasonName(value) ? { kind: 'season', season: value } : 'bad'
  if (kind === 'charge') return /^[A-Za-z0-9:_-]{1,80}$/.test(value) ? { kind: 'charge', chargeId: value } : 'bad'
  if (kind === 'match') return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? { kind: 'charge', matchId: value } : 'bad'
  return 'bad'
}

export function validatePayment(raw: RawPayment, today: string): { ok: true; value: CleanPayment } | { ok: false; code: FeeFormError } {
  const memberId = intId(raw.memberId)
  if (!memberId) return { ok: false, code: 'member' }
  const amountCents = parseMoney(raw.amount)
  if (amountCents === null) return { ok: false, code: 'amount' }
  const receivedOn = str(raw.receivedOn, 10) ?? today
  if (!isIsoDate(receivedOn) || receivedOn > today) return { ok: false, code: 'date' }
  const method = (PAYMENT_METHODS as readonly string[]).includes(raw.method as string) ? (raw.method as PaymentMethod) : null
  if (!method) return { ok: false, code: 'method' }
  const reference = str(raw.reference, 120)
  const note = str(raw.note, 500)
  if (looksLikeCardNumber(reference) || looksLikeCardNumber(note)) return { ok: false, code: 'card' }
  const payerId = raw.payerId === '' || raw.payerId == null ? memberId : intId(raw.payerId)
  if (!payerId) return { ok: false, code: 'payer' }
  const target = parseTarget(raw.target)
  if (target === 'bad') return { ok: false, code: 'target' }

  const ids = [...new Set(raw.splitIds.map(intId).filter((x): x is number => x !== null))]
  let shares: { memberId: number; amountCents: number }[]
  if (ids.length === 0) {
    shares = [{ memberId, amountCents }]
  } else {
    let parts: number[]
    const typed = raw.splitShares.filter((s) => typeof s === 'string' && s.trim() !== '')
    if (typed.length === 0) {
      parts = splitEvenly(amountCents, ids.length)
    } else {
      if (typed.length !== ids.length || raw.splitShares.length !== raw.splitIds.length) return { ok: false, code: 'split' }
      const parsed = raw.splitShares.map((s) => parseMoney(s))
      if (parsed.some((p) => p === null)) return { ok: false, code: 'split' }
      parts = parsed as number[]
    }
    if (parts.length !== ids.length || parts.reduce((a, b) => a + b, 0) !== amountCents || parts.some((p) => p <= 0)) return { ok: false, code: 'split' }
    shares = ids.map((id, i) => ({ memberId: id, amountCents: parts[i] }))
  }
  return { ok: true, value: { memberId, payerId, amountCents, receivedOn, method, reference, note, appliesTo: target, shares } }
}

export type CleanWaiver = { memberId: number; scope: 'game' | 'season' | 'amount'; matchId: string | null; season: string | null; amountCents: number | null; note: string }

export function validateWaiver(raw: { memberId: unknown; scope: unknown; matchId: unknown; season: unknown; amount: unknown; note: unknown }): { ok: true; value: CleanWaiver } | { ok: false; code: FeeFormError } {
  const memberId = intId(raw.memberId)
  if (!memberId) return { ok: false, code: 'member' }
  const note = str(raw.note, 500)
  if (!note) return { ok: false, code: 'note' }
  if (looksLikeCardNumber(note)) return { ok: false, code: 'card' }
  const season = typeof raw.season === 'string' && raw.season ? raw.season : null
  if (season && !isSeasonName(season)) return { ok: false, code: 'season' }
  if (raw.scope === 'game') {
    const matchId = str(raw.matchId, 80)
    if (!matchId || !/^[A-Za-z0-9_-]+$/.test(matchId)) return { ok: false, code: 'target' }
    return { ok: true, value: { memberId, scope: 'game', matchId, season: null, amountCents: null, note } }
  }
  if (raw.scope === 'season') {
    if (!season) return { ok: false, code: 'season' }
    return { ok: true, value: { memberId, scope: 'season', matchId: null, season, amountCents: null, note } }
  }
  if (raw.scope === 'amount') {
    const amountCents = parseMoney(raw.amount)
    if (amountCents === null) return { ok: false, code: 'amount' }
    return { ok: true, value: { memberId, scope: 'amount', matchId: null, season, amountCents, note } }
  }
  return { ok: false, code: 'scope' }
}

export function validateVoid(raw: { id: unknown; reason: unknown }): { ok: true; id: number; reason: string } | { ok: false; code: FeeFormError } {
  const id = intId(raw.id)
  if (!id) return { ok: false, code: 'not-found' }
  const reason = str(raw.reason, 300)
  if (!reason) return { ok: false, code: 'reason' }
  if (looksLikeCardNumber(reason)) return { ok: false, code: 'card' }
  return { ok: true, id, reason }
}

export function validateAdjustment(raw: { memberId: unknown; season: unknown; amount: unknown; note: unknown; date: unknown }, today: string): { ok: true; memberId: number; season: string; amountCents: number; note: string; date: string } | { ok: false; code: FeeFormError } {
  const memberId = intId(raw.memberId)
  if (!memberId) return { ok: false, code: 'member' }
  if (!isSeasonName(raw.season)) return { ok: false, code: 'season' }
  const amountCents = parseMoney(raw.amount)
  if (amountCents === null) return { ok: false, code: 'amount' }
  const note = str(raw.note, 300)
  if (!note) return { ok: false, code: 'note' }
  if (looksLikeCardNumber(note)) return { ok: false, code: 'card' }
  const date = str(raw.date, 10) ?? today
  if (!isIsoDate(date)) return { ok: false, code: 'date' }
  return { ok: true, memberId, season: raw.season as string, amountCents, note, date }
}

export const FEE_ERROR_TEXT: Record<FeeFormError, string> = {
  amount: 'Type an amount greater than zero, with at most two decimals (for example 20 or 12.50).',
  date: 'That date does not look right, or it is in the future.',
  method: 'Pick how it was paid.',
  card: 'That looks like a card number. Never type card details anywhere in the office.',
  target: 'That target is not valid. Pick one from the list, or leave it as general.',
  split: 'The shares must each be an amount and add up to the payment.',
  payer: 'That payer could not be found.',
  note: 'A note is needed so the committee can see why.',
  reason: 'Please give a short reason.',
  season: 'Pick a season.',
  tier: 'Pick a membership type.',
  member: 'That member could not be found.',
  scope: 'Pick what the waiver covers.',
  forbidden: 'Only admins can do that.',
  save: 'That could not be saved. Nothing was changed. Try again.',
  unmatched: 'Some games could not be matched to a member, so the season was not closed. Fix them, or tick "Close anyway".',
  closed: 'That season is closed, so its rates and memberships cannot change.',
  'not-found': 'That record could not be found.',
}
export const FEE_NOTICE_TEXT = {
  paid: 'Payment recorded.',
  voided: 'Voided. The figures have been worked out again.',
  waived: 'Waiver added.',
  closed: 'Season closed. Its figures are now frozen.',
  joined: 'Membership added.',
  copied: 'Last season’s membership types were copied.',
  adjusted: 'Adjustment added.',
} as const
export type FeeNotice = keyof typeof FEE_NOTICE_TEXT
export const isFeeNotice = (v: unknown): v is FeeNotice => typeof v === 'string' && v in FEE_NOTICE_TEXT
export const isFeeError = (v: unknown): v is FeeFormError => typeof v === 'string' && v in FEE_ERROR_TEXT
export { MAX_CENTS }
