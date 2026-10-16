/**
 * Messages for the volunteer pages. A form post redirects back with a short code, never text, so a crafted address cannot put words
 * of its own on the page (same rule as the Fees pages).
 */
export type VolunteerError =
  | 'forbidden'
  | 'not-found'
  | 'frozen'
  | 'date'
  | 'label'
  | 'duplicate'
  | 'shift'
  | 'member'
  | 'hours'
  | 'kind'
  | 'note'
  | 'reason'
  | 'season'
  | 'state'
  | 'has-people'
  | 'already-confirmed'
  | 'not-confirmed'
  | 'save'

export const VOLUNTEER_ERROR_TEXT: Record<VolunteerError, string> = {
  forbidden: 'You are not allowed to do that.',
  'not-found': 'That could not be found. It may have been removed.',
  frozen: 'This week is confirmed, so the roster is locked. Reopen the week first, or mark someone as not turning up.',
  date: 'Please pick a valid date.',
  label: 'That label is too long or does not look right.',
  duplicate: 'There is already a week on that date.',
  shift: 'Please pick one of the volunteer jobs from the list.',
  member: 'Please pick a person from the list.',
  hours: 'Hours must be more than 0 and no more than 24.',
  kind: 'Please choose paid or volunteer.',
  note: 'That note is too long or does not look right.',
  reason: 'Please say why, in a few words.',
  season: 'That is not a season name.',
  state: 'That change is not possible right now.',
  'has-people': 'Someone is still rostered here. Remove them first.',
  'already-confirmed': 'This week is already confirmed.',
  'not-confirmed': 'This week is not confirmed.',
  save: 'That could not be saved. Check the details and try again.',
}

export const VOLUNTEER_NOTICE_TEXT = {
  weeks: 'Weeks created.',
  'week-added': 'Week added.',
  'week-open': 'The week is open: volunteers can now answer for it.',
  'week-draft': 'The week is back to a draft: volunteers can no longer answer for it.',
  'week-deleted': 'Week removed.',
  'shift-added': 'Job added.',
  'shift-removed': 'Job removed.',
  assigned: 'Added to the roster.',
  unassigned: 'Removed from the roster.',
  kind: 'Changed.',
  state: 'Updated.',
  confirmed: 'Week confirmed. The hours are now in the ledger.',
  reopened: 'Week reopened. Its hours were voided and can be posted again when you confirm.',
  rotated: 'New link made. The old one no longer works.',
  hours: 'Hours added.',
  voided: 'Voided.',
} as const
export type VolunteerNotice = keyof typeof VOLUNTEER_NOTICE_TEXT
export const isVolunteerNotice = (v: unknown): v is VolunteerNotice => typeof v === 'string' && v in VOLUNTEER_NOTICE_TEXT
export const isVolunteerError = (v: unknown): v is VolunteerError => typeof v === 'string' && v in VOLUNTEER_ERROR_TEXT
