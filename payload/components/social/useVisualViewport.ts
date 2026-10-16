'use client'

import { useEffect, useState } from 'react'
import { actionBarVisible, isTextInputTag, keyboardInset, keyboardOpen } from '@/lib/social/viewport'

/**
 * Keeps a bottom bar above the on-screen keyboard (visual viewport) and hides it while a text field is focused with the keyboard up.
 * Returns how many pixels to lift the bar and whether to show it. On a desktop browser the inset is 0 and the bar is always shown.
 */
export function useVisualViewport(): { inset: number; visible: boolean } {
  const [state, setState] = useState({ inset: 0, visible: true })
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const facts = { innerHeight: window.innerHeight, visualHeight: vv.height, visualOffsetTop: vv.offsetTop }
      const el = document.activeElement as HTMLElement | null
      const typing = isTextInputTag(el?.tagName, (el as HTMLInputElement | null)?.type)
      setState({ inset: keyboardInset(facts), visible: actionBarVisible(keyboardOpen(facts), typing) })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  return state
}
