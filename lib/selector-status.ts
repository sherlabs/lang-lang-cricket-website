/**
 * Selector account status, derived (never stored): `disabled`, else `invited` (no sign-in yet, invite window open),
 * else `invite-expired` (no sign-in yet, window closed), else `active`. "Facebook linked" is a separate chip.
 */
export const MIN_PASSWORD_LENGTH = 10

export type SelectorStatus = 'disabled' | 'invited' | 'invite-expired' | 'active'

export type StatusInput = {
  disabled?: boolean | null
  lastLoginAt?: string | null
  inviteExpiresAt?: string | null
}

export function selectorStatus(input: StatusInput, now: Date = new Date()): SelectorStatus {
  if (input.disabled) return 'disabled'
  if (input.lastLoginAt) return 'active'
  const expires = input.inviteExpiresAt ? new Date(input.inviteExpiresAt).getTime() : NaN
  if (Number.isFinite(expires) && expires > now.getTime()) return 'invited'
  // Neither a sign-in nor an open window: an account made with a password set by the committee reads as active, one whose invite lapsed as expired.
  return input.inviteExpiresAt ? 'invite-expired' : 'active'
}

export const STATUS_LABEL: Record<SelectorStatus, string> = {
  disabled: 'Disabled',
  invited: 'Invited',
  'invite-expired': 'Invite expired',
  active: 'Active',
}
