import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, CheckmarkCircle01Icon, ExternalLinkIcon } from '@hugeicons/core-free-icons'
import { buttonVariants } from '@/components/ui/button'
import { RsvpTallyBar } from '@/components/events/rsvp-tally'
import { formatLongDate } from '@/lib/events-format'
import type { RsvpResponse, RsvpTally } from '@/lib/rsvp-response'

type Confirmation = { response: RsvpResponse; pay: boolean } | null

type Props = {
  eventId: number
  occurrenceDate: Date
  tally: RsvpTally
  /** What this device already answered (counts only otherwise — never anyone's name). */
  mine: RsvpResponse | null
  /** Past occurrence: read-only final tally. */
  closed: boolean
  /** Just came back from the RSVP form (`?rsvp=yes|no&pay=1`). */
  confirmation: Confirmation
  paymentUrl: string
  paymentLabel: string
}

/**
 * Server-rendered RSVP block on the event page: tally, this device's status, and
 * the buttons into the RSVP form. Public sees counts only. The token behind
 * `mine` never leaves the server — the form re-derives it from the cookie.
 */
export function RsvpPanel({ eventId, occurrenceDate, tally, mine, closed, confirmation, paymentUrl, paymentLabel }: Props) {
  const iso = encodeURIComponent(occurrenceDate.toISOString())
  const yesHref = `/events/${eventId}/rsvp?date=${iso}`
  const noHref = `${yesHref}&response=no`

  return (
    <section id="rsvp" aria-labelledby="rsvp-heading" className="mt-5 border-t border-brand-black/5 pt-5">
      <h2 id="rsvp-heading" className="font-heading text-lg font-bold leading-tight tracking-tight text-brand-black">
        {closed ? 'Who came' : 'Are you coming?'}
      </h2>
      <p className="mt-0.5 text-sm text-brand-grey">{formatLongDate(occurrenceDate, true)}</p>

      {confirmation && (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-xl bg-brand-gold-pale px-4 py-3 text-sm leading-relaxed text-brand-black ring-1 ring-brand-gold/30"
        >
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold-deep" aria-hidden />
          <div>
            <p className="font-semibold">{confirmation.response === 'yes' ? 'Thanks — you’re on the list.' : 'Thanks for letting us know.'}</p>
            {confirmation.pay && paymentUrl && (
              <p className="mt-1 text-brand-charcoal">
                Dinner payment is handled by the club through its payment page. If it didn&apos;t open,{' '}
                <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
                  {paymentLabel || 'pay for dinner here'}
                </a>
                .
              </p>
            )}
          </div>
        </div>
      )}

      <RsvpTallyBar tally={tally} className="mt-4" muted={closed} />

      {closed ? (
        <p className="mt-3 text-xs text-brand-grey-light">RSVPs are closed for this date.</p>
      ) : mine ? (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-stone/70 px-4 py-3 ring-1 ring-brand-black/5">
          <p className="text-sm font-semibold text-brand-black">
            {mine === 'yes' ? (
              <>
                You&apos;re going{' '}
                <HugeiconsIcon icon={CheckmarkCircle01Icon} className="-mt-0.5 inline h-4 w-4 text-brand-gold-deep" aria-label="confirmed" />
              </>
            ) : (
              'You can’t make it'
            )}
          </p>
          <Link
            href={mine === 'yes' ? yesHref : noHref}
            className="text-sm font-semibold text-brand-gold-deep underline-offset-4 hover:underline"
          >
            Change
          </Link>
        </div>
      ) : (
        <div className="mt-4">
          <Link href={yesHref} className={buttonVariants({ variant: 'brand', size: 'xl', className: 'w-full gap-2' })}>
            RSVP
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
          </Link>
          <p className="mt-2.5 text-center text-sm text-brand-grey">
            <Link href={noHref} className="font-semibold text-brand-grey underline-offset-4 hover:text-brand-black hover:underline">
              Can&apos;t make it
            </Link>
          </p>
        </div>
      )}

      {!closed && paymentUrl && paymentLabel && !confirmation?.pay && (
        <a
          href={paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'gold', size: 'xl', className: 'mt-3 w-full gap-2' })}
        >
          {paymentLabel}
          <HugeiconsIcon icon={ExternalLinkIcon} className="h-4 w-4" aria-hidden />
        </a>
      )}
    </section>
  )
}
