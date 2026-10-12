import type { GraphicType } from './types'

/** The graphics with one line of words the person can change, and what to call it on screen. Everything else is drawn from data. */
export const TEXT_FIELDS: Partial<Record<GraphicType, { label: string; hint: string }>> = {
  potm: { label: 'Stat line', hint: 'Filled in from the game. Change it if you like (80 characters).' },
  milestone: { label: 'Line under the number', hint: 'Optional. Replaces the standard wording (80 characters).' },
  'sponsor-thanks': { label: 'Thank-you line', hint: 'Optional, for example "Thank you for backing the club this season" (80 characters).' },
}
