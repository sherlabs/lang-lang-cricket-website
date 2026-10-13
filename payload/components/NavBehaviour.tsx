'use client'

import { useNav } from '@payloadcms/ui'
import { useEffect } from 'react'

/** First focusable thing in the page: jumps to the page content (our views mark it `#admin-main`; Payload's own pages use the template wrap). */
export function SkipLink() {
  return (
    <a
      className="ui-skip"
      href="#admin-main"
      onClick={(event) => {
        const target = document.getElementById('admin-main') ?? document.querySelector<HTMLElement>('.template-default__wrap')
        if (!target) return
        event.preventDefault()
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
        target.focus()
      }}
    >
      Skip to main content
    </a>
  )
}

const NARROW = '(max-width: 1024px)'
const FOCUSABLE = 'a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Behaviour for the phone menu, which Payload opens as a slide-over: Escape closes it and returns focus to the menu button, and Tab
 * stays inside it while it is open (the page behind is not reachable). Renders nothing; does nothing on a wide screen, where the
 * sidebar is part of the page.
 */
export function NavSlideOver() {
  const { navOpen, setNavOpen } = useNav()
  useEffect(() => {
    if (!navOpen || !window.matchMedia(NARROW).matches) return
    const menu = document.querySelector<HTMLElement>('aside.nav')
    if (!menu) return
    const toggler = document.querySelector<HTMLElement>('.app-header__mobile-nav-toggler, .template-default__nav-toggler')
    const first = menu.querySelector<HTMLElement>('.club-nav a[href]') ?? menu.querySelector<HTMLElement>(FOCUSABLE) // the first menu link, not the skip link
    first?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavOpen(false)
        toggler?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const head = items[0]
      const tail = items[items.length - 1]
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      } else if (!menu.contains(document.activeElement)) {
        event.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen, setNavOpen])
  return null
}
