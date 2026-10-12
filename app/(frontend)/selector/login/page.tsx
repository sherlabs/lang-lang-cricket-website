import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard, OrDivider } from '@/components/selector/auth-card'
import { FacebookButton } from '@/components/selector/facebook-button'
import { LoginForm } from '@/components/selector/forms'
import { facebookConfig, hostSupportsFacebook } from '@/lib/facebook-login'
import { getPayloadClient } from '@/lib/payload/client'
import { safeNext } from '@/lib/safe-next'
import { getSelectionUser } from '@/lib/selector-auth'
import { FAILURE_MESSAGES, isFailureCode } from '@/lib/selector-oauth'
import { loginAction } from '../actions'

export const metadata: Metadata = { title: 'Selector login', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ next?: string; e?: string }> }

export default async function SelectorLoginPage({ searchParams }: Props) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  if (await getSelectionUser()) redirect(next)
  const payload = await getPayloadClient()
  const host = (await headers()).get('host')
  // The Facebook button only appears when the club's Meta app is set AND this is the host registered with Meta.
  const facebook = Boolean(facebookConfig()) && hostSupportsFacebook(payload.config.serverURL, host)
  const failure = isFailureCode(sp.e) ? FAILURE_MESSAGES[sp.e] : null
  return (
    <AuthCard title="Selector login" intro="For the people who pick the teams. Your login comes from the committee.">
      {failure && <p role="alert" className="rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{failure}</p>}
      {facebook && (
        <>
          <FacebookButton next={next} />
          <OrDivider />
        </>
      )}
      <LoginForm action={loginAction} next={next} />
      <p className="text-xs leading-relaxed text-brand-grey">
        {facebook ? 'Facebook works once the committee has sent you an invite link and you have used it. ' : ''}
        No login yet? Ask the committee.
      </p>
    </AuthCard>
  )
}
