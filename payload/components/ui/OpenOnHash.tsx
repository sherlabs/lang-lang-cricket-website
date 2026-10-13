'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from './cx'

/**
 * A `<details>` that opens itself when the page address points at an anchor inside it (a cold load of `/admin#system-health`, or a
 * hash change), then scrolls to the anchor once it has streamed in. `anchors` are ids without the `#`.
 */
export function OpenOnHash({ summary, anchors, className, children }: { summary: ReactNode; anchors: string[]; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const key = anchors.join('|')
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id || !key.split('|').includes(id) || !ref.current) return
      ref.current.open = true
      let tries = 0
      const scroll = () => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ block: 'start' })
        else if (tries++ < 20) timer = setTimeout(scroll, 150)
      }
      scroll()
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      if (timer) clearTimeout(timer)
    }
  }, [key])
  return (
    <details ref={ref} className={cx('ui-disclosure', className)}>
      <summary className="ui-disclosure__summary">{summary}</summary>
      <div className="ui-disclosure__body">{children}</div>
    </details>
  )
}
