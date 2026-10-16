/** Short codes the email forms redirect back with, and the sentences they mean. The address carries a code, never text. */
export const EMAIL_ERROR_TEXT = {
  forbidden: 'Only admins can do that.',
  'not-found': 'That email could not be found.',
  subject: 'Please give the email a subject.',
  body: 'Please write the message.',
  tag: 'The message uses a {tag} we do not know. You can use {firstName}, {firstName|there}, {clubName} and {volunteerLink}.',
  'not-draft': 'This email has already been sent or stopped, so it cannot be changed.',
  empty: 'Nobody would receive this email. Change who it goes to.',
  'over-cap': 'That is more people than this site is set to send to in one go. Narrow who it goes to.',
  changed: 'The list of people changed while you were looking. Please check the numbers and press send again.',
  address: 'That email address does not look right.',
  save: 'That could not be saved. Check the details and try again.',
  sending: 'This email could not be started. Is it already sending?',
} as const
export type EmailErrorCode = keyof typeof EMAIL_ERROR_TEXT

export const EMAIL_NOTICE_TEXT = {
  created: 'Draft saved.',
  saved: 'Draft saved.',
  'test-sent': 'A copy was sent to your own email address.',
  started: 'Sending has started. You can close this page; it will carry on.',
  stopped: 'Sending stopped. People who were already sent a copy keep it.',
  'suppression-added': 'That address will not get club emails.',
  'suppression-removed': 'That address can get club emails again.',
} as const
export type EmailNoticeCode = keyof typeof EMAIL_NOTICE_TEXT

export const isEmailError = (v: unknown): v is EmailErrorCode => typeof v === 'string' && v in EMAIL_ERROR_TEXT
export const isEmailNotice = (v: unknown): v is EmailNoticeCode => typeof v === 'string' && v in EMAIL_NOTICE_TEXT
