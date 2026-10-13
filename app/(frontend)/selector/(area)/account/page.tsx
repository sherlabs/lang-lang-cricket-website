import type { Metadata } from 'next'
import { ChangePasswordForm } from '@/components/selector/forms'
import { FacebookButton } from '@/components/selector/facebook-button'
import { resolveSignIn } from '@/lib/signin/mode'
import { getPayloadClient } from '@/lib/payload/client'
import { headers } from 'next/headers'
import { requireSelection } from '@/lib/selector-auth'
import { getOwnAccount } from '@/lib/selector-queries'
import { changePasswordAction, unlinkFacebookAction } from '../../actions'

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } }

export default async function AccountPage() {
  const user = await requireSelection('/selector/account')
  const account = await getOwnAccount(user)
  const isSelector = account?.role === 'selector'
  const facebook = isSelector && (await resolveSignIn(await getPayloadClient(), { host: (await headers()).get('host') })).kind !== 'off'
  return (
    <main className="container-site max-w-xl py-8 sm:py-12">
      <h1 className="display text-3xl text-brand-black">My account</h1>
      <p className="mt-2 text-sm text-brand-grey">{account?.name ? `${account.name} · ` : ''}{account?.email}</p>

      <section aria-labelledby="pw" className="mt-8">
        <h2 id="pw" className="text-lg font-bold text-brand-black">{account?.hasPassword ? 'Password' : 'Choose a password'}</h2>
        {account && !account.hasPassword && <p className="mt-2 text-sm text-brand-grey">You signed up with Facebook, so you have no password yet. Choose one to have a way in if Facebook is not working.</p>}
        <div className="mt-3"><ChangePasswordForm action={changePasswordAction} hasPassword={account?.hasPassword ?? true} /></div>
      </section>

      {facebook && (
        <section aria-labelledby="fb" className="mt-10">
          <h2 id="fb" className="text-lg font-bold text-brand-black">Facebook</h2>
          {account?.facebookLinked ? (
            <form action={unlinkFacebookAction} className="mt-3 space-y-3">
              <p className="text-sm text-brand-grey">
                {account.hasPassword ? 'Facebook sign-in is linked. If you unlink it you can still sign in with your password.' : 'Facebook sign-in is linked. Choose a password above before you can unlink it, or you would have no way to sign in.'}
              </p>
              {account.hasPassword && <button type="submit" className="flex min-h-12 w-full items-center justify-center rounded-lg border border-brand-black/20 px-4 text-base font-semibold text-brand-black">Unlink Facebook</button>}
            </form>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-brand-grey">Link your Facebook so you can sign in with one tap next time.</p>
              <FacebookButton link next="/selector/account" label="Link Facebook" />
            </div>
          )}
        </section>
      )}
    </main>
  )
}
