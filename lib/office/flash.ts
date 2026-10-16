import type { MemberFormError } from './member-input'

/**
 * Messages shown after a form post redirects back. The address carries a short code, never text, so a crafted link cannot put
 * words of its own on the page.
 */
export const ERROR_TEXT: Record<MemberFormError, string> = {
  name: 'Please type a first name and a last name.',
  'name-long': 'That name is too long.',
  roles: 'Pick at least one role.',
  email: 'That email address does not look right.',
  phone: 'That phone number does not look right.',
  save: 'That member could not be saved. Check the details and try again.',
  forbidden: 'Only admins can do that.',
  'bad-id': 'That member could not be found.',
}

export const NOTICE_TEXT = {
  added: 'Member added.',
  linked: 'Done. Players without a member now have one.',
  erased: 'Personal details removed.',
} as const
export type NoticeCode = keyof typeof NOTICE_TEXT

export const isNotice = (v: unknown): v is NoticeCode => typeof v === 'string' && v in NOTICE_TEXT
export const isFormError = (v: unknown): v is MemberFormError => typeof v === 'string' && v in ERROR_TEXT
