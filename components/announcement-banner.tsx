'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, Cancel01Icon, Megaphone01Icon } from '@hugeicons/core-free-icons'
import { ANNOUNCEMENT_DISMISS_COOKIE } from '@/lib/announcements-format'

type Props = {
  id: number
  title: string
  excerpt: string
}

/**
 * Slim gold band at the very top of the home page for the latest published
 * announcement. Dismissing sets a cookie holding this announcement's id, so
 * the server skips rendering it on the next request (no flash) while a newer
 * announcement will still show.
 */
export function AnnouncementBanner({ id, title, excerpt }: Props) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  const dismiss = () => {
    document.cookie = `${ANNOUNCEMENT_DISMISS_COOKIE}=${id}; max-age=31536000; path=/; SameSite=Lax`
    setHidden(true)
  }

  return (
    <aside
      aria-label="Club announcement"
      className="border-b border-brand-black/10 bg-brand-gold text-brand-black"
    >
      <div className="container-site flex items-start gap-3 py-3 sm:items-center sm:gap-5">
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-black text-brand-gold sm:mt-0"
        >
          <HugeiconsIcon icon={Megaphone01Icon} className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-black/70">
              Announcement
            </span>
            <span className="text-sm font-bold tracking-tight sm:text-[15px]">{title}</span>
          </p>
          {excerpt && (
            <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-brand-black/80 sm:mt-0 sm:line-clamp-none sm:min-w-0 sm:flex-1 sm:truncate">
              {excerpt}
            </p>
          )}
          <Link
            href={`/announcements#announcement-${id}`}
            className="mt-1.5 inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold underline decoration-brand-black/40 underline-offset-4 transition hover:decoration-brand-black focus-visible:outline-brand-black sm:mt-0"
          >
            Read more
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-brand-black/70 transition hover:bg-brand-black/10 hover:text-brand-black focus-visible:outline-brand-black sm:mt-0"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </aside>
  )
}
