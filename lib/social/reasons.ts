/**
 * Plain-English reasons for a target that did not post (wave C spec 4.8). The code is kept in the database; the person reads the
 * sentence. A reason a network supplied is never shown raw: it is scrubbed and cut, and a known code wins over it.
 */
export const REASONS: Record<string, string> = {
  not_implemented: 'Posting straight to this network is not switched on yet. Download the picture and post it by hand.',
  rate_limited: 'The network asked us to slow down. It will try again soon.',
  auth: 'The network no longer accepts the connection. Whoever manages the website needs to renew it.',
  media_rejected: 'The network could not use the picture.',
  network: 'The network could not be reached.',
  unknown_outcome: 'Not sure it went out. Check the page.',
  content_changed: "A player's details changed since this was scheduled. Open it, check the picture and schedule it again.",
  approver_inactive: 'The person who approved this post is no longer on the committee. Review it and schedule it again.',
  render_failed: 'The picture could not be made. Open the post and check it.',
  run_stopped: 'The run stopped while posting; check the page before retrying.',
  checked_not_posted: 'Checked by hand: it did not go out.',
}

export function plainReason(code: string | null | undefined, stored: string | null | undefined): string {
  if (code && REASONS[code]) return REASONS[code]
  return stored?.trim() || 'It did not post.'
}

/** The unknown-outcome wording the queue shows, in the words of spec 3.5. */
export const UNKNOWN_TEXT = 'Not sure it went out. Check the page.'
