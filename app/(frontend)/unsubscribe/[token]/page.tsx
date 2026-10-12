import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { clientIp } from '@/lib/client-ip'
import { getClub } from '@/lib/club'
import { resolveUnsub } from '@/lib/email/unsubscribe'
import { resolveOfficeSettings } from '@/lib/office/settings'
import { getPayloadClient } from '@/lib/payload/client'
import { undoAction, unsubscribeAction } from './actions'

// The link is personal: keep it out of search results and referrers, and never cache it.
export const metadata: Metadata = { title: 'Email preferences', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string }> }

const btn = 'inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-black'

/**
 * `/unsubscribe/[token]`. Showing this page never changes anything (mail scanners open links); the buttons post to this same address.
 * A link that does not check shows one generic page, whatever the reason. It works even if email sending is later switched off: an opt-out is always honoured.
 */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { token } = await params
  const { r } = await searchParams
  const payload = await getPayloadClient()
  const [target, club, doc] = await Promise.all([
    resolveUnsub(payload, token, clientIp(await headers())),
    getClub(),
    payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null),
  ])
  const text = resolveOfficeSettings(doc).email.unsubscribeText

  if (!target) {
    return (
      <main className="container-site max-w-xl py-10 sm:py-16">
        <h1 className="display text-3xl text-brand-black">Link not recognised</h1>
        <p className="mt-3 text-brand-black">This link is not one we recognise, so nothing has been changed. Use the link in the most recent email from {club.name}, or contact the club.</p>
      </main>
    )
  }
  const who = target.masked ?? 'this address'
  const done = target.unsubscribed

  return (
    <main className="container-site max-w-xl py-10 sm:py-16">
      <div role="status" aria-live="polite">
        {r === 'busy' ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">Too many tries just now. Please wait a few minutes and try again.</p> : null}
      </div>
      {done ? (
        <>
          <h1 className="display text-3xl text-brand-black">You are unsubscribed</h1>
          <p className="mt-3 text-brand-black">{who} will not get any more emails from {club.name}.</p>
          <form action={undoAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={`${btn} bg-white text-brand-black ring-1 ring-brand-black/30`}>Undo, I changed my mind</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="display text-3xl text-brand-black">{r === 'undone' ? 'Welcome back' : 'Stop emails?'}</h1>
          <p className="mt-3 text-brand-black">{r === 'undone' ? `${who} will get emails from ${club.name} again.` : `Stop emails from ${club.name} to ${who}?`}</p>
          {text ? <p className="mt-2 text-sm text-brand-grey">{text}</p> : null}
          <form action={unsubscribeAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={`${btn} bg-brand-black text-white`}>Yes, unsubscribe</button>
          </form>
        </>
      )}
    </main>
  )
}
