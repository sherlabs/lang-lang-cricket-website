import type { Metadata } from 'next'
import Link from 'next/link'
import { AvailabilitySectionNav } from '@/components/selector/section-nav'
import { btnPrimary, btnQuiet } from '@/components/selector/styles'
import { CopyButton } from '@/components/selector/ui'
import { selectorPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { getLinkInfo } from '@/lib/selector-availability-queries'
import { rotateLinkAction, setLinkEnabledAction } from '../../board-actions'

export const metadata: Metadata = { title: 'Player link', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ rotated?: string }> }

export default async function LinkPage({ searchParams }: Props) {
  const user = await requireSelection(selectorPaths.link)
  const sp = await searchParams
  const info = await getLinkInfo(user)
  const club = await getClub()
  const url = `${club.siteUrl.replace(/\/$/, '')}${info.path}`
  return (
    <main className="container-site max-w-xl py-6 sm:py-10">
      <AvailabilitySectionNav current="link" />
      <h1 className="display text-3xl text-brand-black">Player link</h1>
      <p className="mt-2 text-sm leading-relaxed text-brand-grey">
        One link for the whole club. Players open it, type their name and PIN, and tell you if they are in, maybe or out for each game. It shows each player only their own answers.
      </p>
      {sp.rotated && <p role="status" className="mt-4 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">New link made. The old one has stopped working.</p>}

      <section aria-labelledby="share" className="mt-6">
        <h2 id="share" className="text-lg font-bold text-brand-black">The link</h2>
        {info.enabled ? (
          <>
            <p className="mt-2 break-all rounded-lg bg-white p-3 text-sm text-brand-black ring-1 ring-brand-black/10">{url}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <CopyButton text={url} label="Copy link" className={btnPrimary} />
              <a className={btnQuiet} href={`sms:?&body=${encodeURIComponent(`Please tell the selectors if you are available: ${url}`)}`}>Share by text</a>
              <a className={btnQuiet} href={`https://wa.me/?text=${encodeURIComponent(`Please tell the selectors if you are available: ${url}`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-brand-grey">The link is switched off, so anyone who opens it sees &quot;page not found&quot;.</p>
        )}
        {info.guessing && <p role="alert" className="mt-3 text-sm text-red-800">Someone is guessing PINs on this link. Consider making a new one.</p>}
      </section>

      <section aria-labelledby="switch" className="mt-8">
        <h2 id="switch" className="text-lg font-bold text-brand-black">Switch the link {info.enabled ? 'off' : 'on'}</h2>
        <form action={setLinkEnabledAction} className="mt-3">
          <input type="hidden" name="enabled" value={info.enabled ? 'false' : 'true'} />
          <button type="submit" className={btnQuiet}>{info.enabled ? 'Switch off' : 'Switch on'}</button>
        </form>
      </section>

      <section aria-labelledby="rotate" className="mt-8">
        <h2 id="rotate" className="text-lg font-bold text-brand-black">Make a new link</h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-grey">Everyone must then use the new link. The old link stops working at once, and every phone that was remembered has to type its PIN again.</p>
        <form action={rotateLinkAction} className="mt-3">
          <RotateConfirm />
        </form>
      </section>
      <p className="mt-8"><Link href={selectorPaths.availability} className="font-semibold text-brand-black underline underline-offset-4">Back to availability</Link></p>
    </main>
  )
}

function RotateConfirm() {
  return (
    <details className="rounded-lg border border-brand-black/20 p-3">
      <summary className="min-h-11 cursor-pointer text-base font-semibold text-brand-black">Make a new link...</summary>
      <p className="mt-2 text-sm text-brand-grey">Are you sure? Players with the old link will see &quot;page not found&quot; until you send them the new one.</p>
      <button type="submit" className={`${btnPrimary} mt-3`}>Yes, make a new link</button>
    </details>
  )
}
