'use client'

import Link from 'next/link'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle01Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { Button, buttonVariants } from '@/components/ui/button'
import { RSVP_COOKIE, type RsvpCookie } from '@/lib/rsvp-cookie'
import { submitRsvp } from '@/app/events/actions'

type Props = {
  eventId: number
  eventTitle: string
  /** The exact `?date=` string from the URL — echoed back untouched so the server validates what was linked to. */
  occurrenceIso: string
  /** Already-formatted (UTC-anchored, server-side) date label for the confirmation copy. */
  occurrenceLabel: string
}

/** Same document.cookie read as app/history/submit's readDraftCookie, for the cookie submitRsvp sets. */
function readRsvpCookie(): RsvpCookie | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${RSVP_COOKIE}=([^;]*)`))
  if (!match) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]))
    return typeof parsed?.editToken === 'string' ? parsed : null
  } catch {
    return null
  }
}

const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-brand-black/10 bg-white px-4 text-base text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-brand-black">{label}</span>
      {hint && <span className="ml-1.5 text-xs font-normal text-brand-grey">{hint}</span>}
      {children}
    </label>
  )
}

/** Labeled read-only URL + copy button; the edit link is shown exactly once, so make it easy to grab. */
function CopyRow({ label, hint, path }: { label: string; hint: string; path: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — the link is still selectable below.
    }
  }

  return (
    <div className="rounded-xl border border-brand-black/10 bg-brand-stone/40 p-4">
      <p className="text-sm font-semibold text-brand-black">{label}</p>
      <p className="mt-0.5 text-xs text-brand-grey">{hint}</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label={label}
          onFocus={(e) => e.target.select()}
          className="h-10 min-w-0 flex-1 truncate rounded-lg border border-brand-black/10 bg-white px-3 text-sm text-brand-charcoal"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-black px-3 text-sm font-semibold text-white transition hover:bg-brand-charcoal"
        >
          <HugeiconsIcon icon={copied ? CheckmarkCircle01Icon : Copy01Icon} className="h-4 w-4" aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function RsvpForm({ eventId, eventTitle, occurrenceIso, occurrenceLabel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; editToken: string | null } | null>(null)

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await submitRsvp(formData)
    if (result?.error) {
      setError(result.error)
      setBusy(false)
      return
    }
    // submitRsvp returns normally on success; the edit token only exists in the cookie it just set.
    const cookie = readRsvpCookie()
    setDone({ name: String(formData.get('name') ?? '').trim(), editToken: cookie?.editToken ?? null })
    setBusy(false)
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30">
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="display mt-5 text-3xl text-brand-black sm:text-4xl">You&apos;re on the list</h2>
        <p className="mt-3 text-base leading-relaxed text-brand-grey">
          Thanks{done.name ? `, ${done.name}` : ''} — we&apos;ve got you down for{' '}
          <span className="font-semibold text-brand-black">{eventTitle}</span> on{' '}
          <span className="font-semibold text-brand-black">{occurrenceLabel}</span>. See you there.
        </p>

        <div className="mt-6 border-t border-brand-black/10 pt-6">
          {done.editToken ? (
            <CopyRow
              label="Your RSVP link"
              hint="Plans change? Use this link to update or cancel your RSVP. It's the only way back in, so keep it handy."
              path={`/events/rsvp/${done.editToken}`}
            />
          ) : (
            <p className="text-sm text-brand-grey">
              If your plans change, get in touch with the club and we&apos;ll update your RSVP for you.
            </p>
          )}
        </div>

        <div className="mt-6">
          <Link href="/events" className={buttonVariants({ variant: 'brand', size: 'xl' })}>
            Back to events
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form action={onSubmit} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="occurrenceDate" value={occurrenceIso} />

      <h2 className="display text-2xl text-brand-black">Your details</h2>
      <p className="mt-1.5 text-sm text-brand-grey">We only use these to plan numbers — nothing is published.</p>

      <div className="mt-6 flex flex-col gap-5">
        <Field label="Name">
          <input type="text" name="name" required autoComplete="name" placeholder="Your name" className={inputClass} />
        </Field>
        <Field label="Email" hint="(optional)">
          <input type="email" name="email" autoComplete="email" placeholder="you@example.com" className={inputClass} />
        </Field>
        <Field label="Anything we should know?" hint="(optional)">
          <textarea
            name="note"
            rows={3}
            placeholder="Bringing the kids, dietary needs, arriving late…"
            className="mt-2 w-full resize-y rounded-xl border border-brand-black/10 bg-white px-4 py-3 text-base leading-relaxed text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-brand-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-brand-grey-light">You&apos;ll get a link to change or cancel later.</p>
        <Button type="submit" size="xl" variant="brand" disabled={busy} className="w-full sm:w-auto sm:px-8">
          {busy ? 'Sending…' : 'Confirm RSVP'}
        </Button>
      </div>
    </form>
  )
}
