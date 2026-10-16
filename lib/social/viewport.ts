/**
 * Where a bottom action bar should sit on a phone (wave G spec WP-2a). With the on-screen keyboard open, the layout viewport keeps
 * its height but the visual viewport shrinks, so a bar fixed to the bottom would hide behind the keyboard. The bar is lifted by this
 * many pixels, and hidden while a text field has the keyboard up (it would cover the field).
 */
export type ViewportFacts = { innerHeight: number; visualHeight: number; visualOffsetTop: number }

export function keyboardInset(v: ViewportFacts): number {
  return Math.max(0, Math.round(v.innerHeight - v.visualHeight - v.visualOffsetTop))
}

/** A keyboard is "open" when the visual viewport lost more than this share of the window (browser chrome changes are small). */
export function keyboardOpen(v: ViewportFacts): boolean {
  return keyboardInset(v) > Math.max(120, v.innerHeight * 0.15)
}

/** The bar shows unless the keyboard is up and the focus is in something you type into. */
export function actionBarVisible(open: boolean, focusIsTextInput: boolean): boolean {
  return !(open && focusIsTextInput)
}

export const isTextInputTag = (tag: string | null | undefined, type?: string | null): boolean => {
  const t = (tag ?? '').toLowerCase()
  if (t === 'textarea') return true
  if (t !== 'input') return false
  return !['button', 'checkbox', 'radio', 'submit', 'range', 'file', 'color', 'image', 'reset'].includes((type ?? 'text').toLowerCase())
}
