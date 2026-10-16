import type { StyleKey } from './types'

/** A style is token choices (in `style.ts`) plus these structural switches. Shared by the renderer and the height budget. */
export type StyleKit = {
  /** `bar`: an accent bar across the top; `band`: a coloured band carrying the crest; `plain`: nothing. */
  frame: 'bar' | 'band' | 'plain'
  /** Where the crest and club name sit. */
  masthead: 'top-left' | 'band' | 'corner'
  headlineUpper: boolean
  align: 'left' | 'center'
  /** Accent underline beneath the headline. */
  headlineRule: boolean
}

export const STYLE_KITS: Record<StyleKey, StyleKit> = {
  bold: { frame: 'bar', masthead: 'top-left', headlineUpper: true, align: 'left', headlineRule: false },
  classic: { frame: 'band', masthead: 'band', headlineUpper: true, align: 'center', headlineRule: true },
  minimal: { frame: 'plain', masthead: 'corner', headlineUpper: false, align: 'left', headlineRule: true },
}
