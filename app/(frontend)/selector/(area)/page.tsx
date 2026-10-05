import type { Metadata } from 'next'
import Link from 'next/link'
import { selectorPaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'

export const metadata: Metadata = { title: 'Selectors', robots: { index: false, follow: false } }

const TOOLS = [
  { href: selectorPaths.availability, title: 'Availability', text: 'Who is in, maybe or out for each game, and who has not replied.' },
  { href: selectorPaths.squads, title: 'Squads', text: 'Who is in each grade this season. Add, move and remove players.' },
  { href: selectorPaths.link, title: 'Player link', text: 'The one link players use to tell you if they can play. Copy it, switch it off or make a new one.' },
  { href: selectorPaths.account, title: 'My account', text: 'Your password and Facebook sign-in.' },
] as const

/** The selector home. Team selection and the match-day overview arrive with the next work package. */
export default async function SelectorHome() {
  const user = await requireSelection()
  const name = (user as { name?: string | null }).name?.trim().split(/\s+/)[0]
  return (
    <main className="container-site py-8 sm:py-12">
      <h1 className="display text-3xl text-brand-black sm:text-4xl">{name ? `Hello, ${name}` : 'Hello'}</h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-brand-grey">You are signed in as a selector. Pick a tool.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="block min-h-11 rounded-xl bg-white p-4 ring-1 ring-brand-black/10 transition hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
              <span className="block text-lg font-bold text-brand-black">{t.title}</span>
              <span className="mt-1 block text-sm text-brand-grey">{t.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
