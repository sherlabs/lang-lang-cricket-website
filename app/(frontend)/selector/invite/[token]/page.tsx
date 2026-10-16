import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { AuthCard, OrDivider } from '@/components/selector/auth-card'
import { FacebookButton } from '@/components/selector/facebook-button'
import { ChoosePasswordForm } from '@/components/selector/forms'
import { SELECTOR_INVITE_DAYS } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { looksLikeInAppBrowser } from '@/lib/facebook-login'
import { resolveSignIn } from '@/lib/signin/mode'
import { getPayloadClient } from '@/lib/payload/client'
import { findInvitee } from '@/lib/selector-invite'
import { FAILURE_MESSAGES, isFailureCode } from '@/lib/selector-oauth'
import { ipHit } from '@/lib/throttle'
import { chooseInvitePassword } from '../../actions'

// The invite token is in the address: keep it out of referrers, caches and search results (also set in next.config headers).
export const metadata: Metadata = { title: 'Your selector invite', robots: { index: false, follow: false }, referrer: 'no-referrer' }

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }

const GENERIC = 'This link has expired. Ask the committee for a new one.'

export default async function InvitePage({ params, searchParams }: Props) {
  const { token } = await params
  const sp = await searchParams
  const payload = await getPayloadClient()
  const h = await headers()
  // A soft per-IP signal (skipped when there is no trusted address); one generic page for every bad token.
  const throttled = !(await ipHit(payload, 'sel-invite', clientIp(h))).allowed
  const invitee = throttled ? null : await findInvitee(payload, token)
  if (!invitee) {
    return (
      <AuthCard title="Selector invite">
        <p className="text-sm leading-relaxed text-brand-black">{throttled ? FAILURE_MESSAGES.busy : GENERIC}</p>
      </AuthCard>
    )
  }
  const first = (invitee.name ?? '').trim().split(/\s+/)[0] || 'there'
  const facebook = (await resolveSignIn(payload, { host: h.get('host') })).kind !== 'off'
  const inApp = looksLikeInAppBrowser(h.get('user-agent'))
  const failure = isFailureCode(sp.e) ? FAILURE_MESSAGES[sp.e] : null
  return (
    <AuthCard title={`Hi ${first}`} intro={`You have been asked to help pick the teams. This link works once and for ${SELECTOR_INVITE_DAYS} days from when it was made. Choose how you want to sign in.`}>
      {failure && <p role="alert" className="rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{failure}</p>}
      {facebook && (
        <>
          {inApp && (
            <p className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">
              Facebook sign-in can fail inside Messenger, Facebook or WhatsApp. If it does, open this page in Safari or Chrome (copy the link, or use the share button), or choose a password below.
            </p>
          )}
          <FacebookButton invite={token} next="/selector" />
          <OrDivider />
        </>
      )}
      <ChoosePasswordForm action={chooseInvitePassword} token={token} />
    </AuthCard>
  )
}
