import { randomUUID } from 'crypto'

/** Unguessable secret used for a story's edit or view link. */
export function generateStoryToken(): string {
  return randomUUID()
}

/** Cookie holding the most recent submission's draft/view tokens, so a submitter can find their way back. */
export const DRAFT_COOKIE = 'llcc_story_draft'
