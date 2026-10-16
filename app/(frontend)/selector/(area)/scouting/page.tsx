import type { Metadata } from 'next'
import Link from 'next/link'
import { selectorPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { formatMatchDayYear } from '@/lib/selection/lineup-text'
import { requireSelection } from '@/lib/selector-auth'
import { loadOpponentList } from '@/lib/selector-scouting-queries'
import { opponentDetail } from '@/lib/scouting/resolve-opponent'
import { normaliseClubName } from '@/lib/stats/match/opposition-key'

export const metadata: Metadata = { title: 'Opposition scouting', robots: { index: false, follow: false } }
// Opposition players are named behind this route: never static, never cached.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string }> }

/** Every club we have stored games against, with games played and the last meeting. */
export default async function ScoutingListPage({ searchParams }: Props) {
  const user = await requireSelection(selectorPaths.scouting)
  const { locale } = await getClub()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : ''
  const all = await loadOpponentList(user)
  const needle = normaliseClubName(q)
  const rows = needle ? all.filter((o) => normaliseClubName(o.label).includes(needle)) : all
  const labelCount = new Map<string, number>()
  for (const o of all) labelCount.set(o.label, (labelCount.get(o.label) ?? 0) + 1)
  return (
    <main className="container-site max-w-3xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black">Opposition scouting</h1>
      <p className="mt-2 text-brand-grey">Pick a club to see our record against them, their typical totals and their danger players, from the games stored on the site.</p>
      <form method="get" role="search" className="mt-4 flex gap-2">
        <label htmlFor="scout-q" className="sr-only">Search clubs</label>
        <input id="scout-q" name="q" defaultValue={q} type="search" autoComplete="off" placeholder="Search clubs" className="min-h-11 w-full rounded-lg border border-brand-black/20 bg-white px-3 text-base" />
        <button type="submit" className="min-h-11 shrink-0 rounded-lg bg-brand-black px-4 text-sm font-semibold text-white">Search</button>
      </form>
      {all.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-brand-grey ring-1 ring-brand-black/10">No finished games are stored yet, so there is nobody to scout.</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-brand-grey ring-1 ring-brand-black/10">No club matches that search.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((o) => (
            <li key={o.key}>
              <Link href={selectorPaths.scoutingFor(o.key)} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-brand-black/10 hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
                <span className="text-lg font-bold text-brand-black">{o.label}{(labelCount.get(o.label) ?? 0) > 1 && <span className="block text-sm font-normal text-brand-grey">{opponentDetail(o)}</span>}</span>
                <span className="shrink-0 text-right text-sm text-brand-grey">{o.played} {o.played === 1 ? 'game' : 'games'}{o.lastDate ? ` · last ${formatMatchDayYear(o.lastDate, locale)}` : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
