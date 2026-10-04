import { SelectorShell } from '@/components/selector/shell'
import { requireSelection } from '@/lib/selector-auth'
import { logoutAction } from '../actions'

/** Everything under `/selector` except login, invite and the Facebook routes needs a signed-in selector, admin or editor. */
export default async function SelectorAreaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSelection()
  const name = (user as { name?: string | null }).name?.trim().split(/\s+/)[0] ?? ''
  return (
    <SelectorShell
      name={name}
      signOut={
        <form action={logoutAction}>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand-black underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </SelectorShell>
  )
}
