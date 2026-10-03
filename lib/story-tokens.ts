import { randomUUID } from 'crypto'
import { COOKIE_PREFIX } from '@/config/site'

/** Unguessable secret used for a story's edit or view link. */
export function generateStoryToken(): string {
  return randomUUID()
}

/** Cookie holding the most recent submission's draft/view tokens, so a submitter can find their way back. */
export const DRAFT_COOKIE = `${COOKIE_PREFIX}_story_draft`

/**
 * Tokens are `randomUUID()` (36 chars; legacy `min(length(edit_token))` is 36 too). Every
 * token-keyed action checks this before looking anything up (spec §6), so an empty or
 * `undefined` token can never turn an overrideAccess lookup into a multi-row match.
 */
export const MIN_TOKEN_LENGTH = 32

export function isTokenShaped(token: unknown): token is string {
  return typeof token === 'string' && token.length >= MIN_TOKEN_LENGTH && token.length <= 200
}
