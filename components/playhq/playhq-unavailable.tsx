import { HugeiconsIcon } from '@hugeicons/react'
import { ExternalLinkIcon } from '@hugeicons/core-free-icons'
import { PLAYHQ_CLUB_URL } from '@/lib/playhq/format'

export function PlayHQUnavailable({ what }: { what: string }) {
  return (
    <div role="status" className="rounded-2xl bg-brand-stone p-8 text-center">
      <p className="text-base font-semibold text-brand-black">Live {what} are temporarily unavailable.</p>
      <p className="mt-2 text-sm text-brand-grey">
        Please try again shortly, or{' '}
        <a
          href={PLAYHQ_CLUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black"
        >
          view the club on PlayHQ
          <HugeiconsIcon icon={ExternalLinkIcon} className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        .
      </p>
    </div>
  )
}
