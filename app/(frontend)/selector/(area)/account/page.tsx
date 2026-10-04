import type { Metadata } from 'next'
import { ChangePasswordForm } from '@/components/selector/forms'
import { FacebookButton } from '@/components/selector/facebook-button'
import { facebookConfig } from '@/lib/facebook-login'
import { requireSelection } from '@/lib/selector-auth'
import { getOwnAccount } from '@/lib/selector-queries'
import { changePasswordAction, unlinkFacebookAction } from '../../actions'

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } }

export default async function AccountPage() {
  const user = await requireSelection('/selector/account')
  const account = await getOwnAccount(user)
  const isSelector = account?.role === 'selector'
  const facebook = Boolean(facebookConfig()) && isSelector
  return (
    <main className="container-site max-w-xl py-8 sm:py-12">
      <h1 className="display text-3xl text-brand-black">My account</h1>
      <p className="mt-2 text-sm text-brand-grey">{account?.name ? `${account.name} · ` : ''}{account?.email}</p>

      <section aria-labelledby="pw" className="mt-8">
        <h2 id="pw" className="text-lg font-bold text-brand-black">Password</h2>
        <div className="mt-3"><ChangePasswordForm action={changePasswordAction} /></div>
      </section>

      {facebook && (
        <section aria-labelledby="fb" className="mt-10">
          <h2 id="fb" className="text-lg font-bold text-brand-black">Facebook</h2>
          {account?.facebookLinked ? (
            <form action={unlinkFacebookAction} className="mt-3 space-y-3">
              <p className="text-sm text-brand-grey">Facebook sign-in is linked. You can still sign in with your password.</p>
              <button type="submit" className="flex min-h-12 w-full items-center justify-center rounded-lg border border-brand-black/20 px-4 text-base font-semibold text-brand-black">Unlink Facebook</button>
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
