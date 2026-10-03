'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { ExternalLinkIcon } from '@hugeicons/core-free-icons'
import { Button, buttonVariants } from '@/components/ui/button'
import { submitRsvp } from '@/app/(frontend)/events/actions'
import { ChoiceGroup } from '@/components/events/choice-group'
import { cn } from '@/lib/utils'
import { submitKeepingInput } from '@/lib/form-submit'

type Props = {
  eventId: number
  /** Exact ISO string for the occurrence — echoed back as the hidden field so the server validates it. */
  occurrenceIso: string
  /** 'yes' = coming (dinner + payment shown); 'no' = can't make it (name/email/note only, "Send"). */
  mode: 'yes' | 'no'
  mealOptions: string[]
  /** '' when the event has no payment link. Rendered only as an external link, never trusted otherwise. */
  paymentUrl: string
  /** This device already has an RSVP for this occurrence — copy says "update", server updates in place. */
  existing: boolean
  initial: { name: string; email: string; meal: string; note: string }
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

export function RsvpForm({ eventId, occurrenceIso, mode, mealOptions, paymentUrl, existing, initial }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasDinner = mode === 'yes' && mealOptions.length > 0
  // Editing an existing RSVP: dinner yes/no is implied by whether a meal is stored.
  const [dinner, setDinner] = useState<'yes' | 'no' | ''>(existing && hasDinner ? (initial.meal ? 'yes' : 'no') : '')
  const [meal, setMeal] = useState(initial.meal)

  const canPay = mode === 'yes' && !!paymentUrl && (!hasDinner || dinner === 'yes')

  async function save(formData: FormData): Promise<boolean> {
    setBusy(true)
    setError(null)
    const result = await submitRsvp(formData)
    if ('error' in result) {
      setError(result.error)
      setBusy(false)
      return false
    }
    return true
  }

  function done(pay: boolean) {
    const params = new URLSearchParams({ rsvp: mode })
    if (pay) params.set('pay', '1')
    router.push(`/events/${eventId}?${params.toString()}#rsvp`)
  }

  async function onSubmit(formData: FormData) {
    if (await save(formData)) done(false)
  }

  /**
   * "Pay for dinner" is a real link so the payment page opens under the user's
   * click (popup blockers stay quiet); the RSVP saves in this tab meanwhile and
   * then we go back to the event page. Client-side validity is checked first so an
   * obviously incomplete form doesn't open the payment tab for nothing.
   */
  async function onPayClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const form = formRef.current
    if (!form || busy) {
      e.preventDefault()
      return
    }
    if (!form.reportValidity()) {
      e.preventDefault()
      return
    }
    const formData = new FormData(form)
    if (await save(formData)) done(true)
  }

  const submitLabel = mode === 'no' ? 'Send' : existing ? 'Update RSVP' : 'RSVP now'

  return (
    <form ref={formRef} onSubmit={submitKeepingInput(onSubmit)} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="occurrenceDate" value={occurrenceIso} />
      <input type="hidden" name="response" value={mode} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="display text-2xl text-brand-black">{mode === 'no' ? 'Can’t make it' : existing ? 'Update your RSVP' : 'Your details'}</h2>
          <p className="mt-1.5 text-sm text-brand-grey">We only use these to plan numbers — nothing is published.</p>
        </div>
        <Link
          href={`/events/${eventId}/rsvp?date=${encodeURIComponent(occurrenceIso)}${mode === 'yes' ? '&response=no' : ''}`}
          className="text-sm font-semibold text-brand-gold-deep underline-offset-4 hover:underline"
        >
          {mode === 'yes' ? 'Can’t make it?' : 'Actually, I can come'}
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <Field label="Name">
          <input type="text" name="name" required autoComplete="name" defaultValue={initial.name} placeholder="Your name" className={inputClass} />
        </Field>
        <Field label="Email" hint="(optional)">
          <input type="email" name="email" autoComplete="email" defaultValue={initial.email} placeholder="you@example.com" className={inputClass} />
        </Field>

        {hasDinner && (
          <>
            <ChoiceGroup
              legend="Do you want dinner?"
              name="dinner"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              value={dinner}
              onChange={(v) => setDinner(v as 'yes' | 'no')}
            />
            {dinner === 'yes' && (
              <ChoiceGroup
                legend="What type of dinner?"
                name="meal"
                options={mealOptions.map((o) => ({ value: o, label: o }))}
                value={meal}
                onChange={setMeal}
                columns={3}
              />
            )}
          </>
        )}

        <Field label="Anything we should know?" hint="(optional)">
          <textarea
            name="note"
            rows={3}
            defaultValue={initial.note}
            placeholder={mode === 'no' ? 'Leave a note for the club…' : 'Bringing the kids, dietary needs, arriving late…'}
            className="mt-2 w-full resize-y rounded-xl border border-brand-black/10 bg-white px-4 py-3 text-base leading-relaxed text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 border-t border-brand-black/10 pt-6 sm:flex-row sm:items-center sm:justify-end">
        <Button type="submit" size="xl" variant="brand" disabled={busy} className="w-full sm:w-auto sm:px-8">
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {canPay && (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onPayClick}
            aria-disabled={busy || undefined}
            className={buttonVariants({ variant: 'gold', size: 'xl', className: cn('w-full sm:w-auto sm:px-8', busy && 'pointer-events-none opacity-50') })}
          >
            Pay for dinner
            <HugeiconsIcon icon={ExternalLinkIcon} className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
      {canPay && (
        <p className="mt-3 text-xs leading-relaxed text-brand-grey-light sm:text-right">
          &ldquo;Pay for dinner&rdquo; saves your RSVP and opens the club&apos;s payment page in a new tab.
        </p>
      )}
    </form>
  )
}
