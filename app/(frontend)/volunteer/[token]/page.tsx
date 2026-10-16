import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { getPayloadClient } from '@/lib/payload/client'
import { currentClubDate } from '@/lib/selection/club-date'
import { ANSWER_TEXT, resolveVolunteerCounted, volunteerView, type AnswerCode } from '@/lib/volunteer-public'
import { AVAILABILITY_LABEL, type AvailabilityState } from '@/lib/office/volunteers'
import { answerAction } from './actions'

// The token is in the address: keep it out of referrers and search results (also set in next.config headers: no-store, no-referrer).
export const metadata: Metadata = { title: 'Your volunteering', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string; w?: string }> }

const dayFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' })
const when = (date: string): string => dayFormat.format(new Date(`${date}T12:00:00Z`))
/** Left to right, as the question reads. */
const ORDER: AvailabilityState[] = ['yes', 'maybe', 'no']
const ON: Record<string, string> = { yes: 'bg-status-ok text-white', maybe: 'bg-status-warn text-brand-black', no: 'bg-status-bad text-white' }
const isCode = (v: unknown): v is AnswerCode => typeof v === 'string' && v in ANSWER_TEXT

export default async function VolunteerPage({ params, searchParams }: Props) {
  const { token } = await params
  const sp = await searchParams
  const payload = await getPayloadClient()
  // Only a link that fails to check counts against the address (guessing is slow, shared wifi is safe); a wrong or rotated link is a plain 404.
  const who = await resolveVolunteerCounted(payload, token, clientIp(await headers()))
  if (!who) notFound()
  const view = await volunteerView(payload, who.id, currentClubDate())
  const message = isCode(sp.r) ? ANSWER_TEXT[sp.r] : null

  return (
    <main className="container-site max-w-xl py-8 sm:py-12">
      <h1 className="display text-3xl text-brand-black">Hi {who.firstName}</h1>
      <p className="mt-2 text-sm text-brand-grey">Tell the committee which game days you can help. Only you can see your answers here.</p>
      <div role="status" aria-live="polite">
        {message ? <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${sp.r === 'saved' ? 'bg-brand-stone text-brand-black' : 'bg-status-bad-soft text-status-bad-ink'}`}>{message}</p> : null}
      </div>

      {view.shifts.length > 0 && (
        <section aria-labelledby="mine" className="mt-6 rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
          <h2 id="mine" className="text-lg font-bold text-brand-black">Your shifts</h2>
          <ul className="mt-3 space-y-2">
            {view.shifts.map((s, i) => (
              <li key={i} className="text-sm text-brand-black">
                <span className="font-semibold">{s.job}</span>, {when(s.date)} ({s.hours} {s.hours === 1 ? 'hour' : 'hours'}){s.state === 'confirmed' ? ', confirmed' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.weeks.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-sm text-brand-black ring-1 ring-brand-black/10">There are no game days open for answers right now. Check back soon.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {view.weeks.map((w) => (
            <li key={w.id} className="rounded-2xl bg-white p-4 ring-1 ring-brand-black/10">
              <h2 className="text-lg font-bold text-brand-black">{when(w.date)}</h2>
              {w.label ? <p className="text-sm text-brand-grey">{w.label}</p> : null}
              <form action={answerAction} className="mt-3">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="weekId" value={w.id} />
                <div role="group" aria-label={`Can you help on ${when(w.date)}?`} className="grid grid-cols-3 gap-2">
                  {ORDER.map((s) => (
                    <button key={s} type="submit" name="state" value={s} aria-pressed={w.answer === s} className={`min-h-14 rounded-xl px-2 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-black ${w.answer === s ? ON[s] : 'bg-white text-brand-black ring-1 ring-brand-black/25'}`}>
                      {AVAILABILITY_LABEL[s]}
                    </button>
                  ))}
                </div>
                {view.jobs.length > 0 && (
                  <fieldset className="mt-3">
                    <legend className="text-sm font-medium text-brand-black">Jobs you would prefer (optional)</legend>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {view.jobs.map((j) => (
                        <label key={j.key} className="flex min-h-11 items-center gap-2 text-sm text-brand-black">
                          <input type="checkbox" name="preferred" value={j.key} defaultChecked={w.preferred.includes(j.key)} className="h-5 w-5" />
                          {j.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <label className="mt-3 block text-sm font-medium text-brand-black">
                  A note for the committee (optional)
                  <input name="note" defaultValue={w.note} maxLength={view.noteMax} className="mt-1 block h-12 w-full rounded-lg border border-brand-black/20 bg-white px-3 text-base text-brand-black focus:border-brand-gold-deep focus:outline-none focus:ring-2 focus:ring-brand-gold/50" />
                </label>
                <p className="mt-2 text-xs text-brand-grey">Tap Yes, Maybe or No to save your answer and note together.</p>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
