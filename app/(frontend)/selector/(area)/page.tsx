import type { Metadata } from 'next'
import Link from 'next/link'
import { requireSelection } from '@/lib/selector-auth'

export const metadata: Metadata = { title: 'Selectors', robots: { index: false, follow: false } }

/** The selector home. This work package delivers the frame; availability, squads and team selection fill it in later packages. */
export default async function SelectorHome() {
  const user = await requireSelection()
  const name = (user as { name?: string | null }).name?.trim().split(/\s+/)[0]
  return (
    <main className="container-site py-8 sm:py-12">
      <h1 className="display text-3xl text-brand-black sm:text-4xl">{name ? `Hello, ${name}` : 'Hello'}</h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-brand-grey">
        You are signed in as a selector. The team selection tools will appear here as the club switches them on.
      </p>
      <p className="mt-6">
        <Link href="/selector/account" className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">
          My account
        </Link>
      </p>
    </main>
  )
}
